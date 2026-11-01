const db = require('../config/db');
const meetToEarn = require('../services/meetToEarn');
const boost = require('../services/boost');
const { GIFT_CATALOG, GIFT_RECIPIENT_SHARE, M2E, BOOST, REWARDS, roundVibe } = require('../config/economy');

const { isId } = require('../config/ids');

class WalletError extends Error {
  constructor(status, message, details = {}) {
    super(message);
    this.status = status;
    this.details = details;
  }
}

/**
 * GET /api/wallet/balance
 */
exports.getBalance = async (req, res) => {
  try {
    const { rows } = await db.query(
      `SELECT vibe_balance, earned_balance, daily_earned_tokens, last_earned_date::text AS last_day
       FROM users WHERE id = $1`,
      [req.user.id]
    );
    const user = rows[0];
    if (!user) {
      return res.status(404).json({ success: false, error: 'User not found' });
    }

    const [progress, boostUntil] = await Promise.all([
      meetToEarn.getProgress(req.user.id),
      boost.getBoostExpiry(req.user.id)
    ]);

    return res.json({
      success: true,
      balance: Number(user.vibe_balance),
      earnedBalance: Number(user.earned_balance),
      m2eEarnedToday: user.last_day === meetToEarn.todayUtc() ? Number(user.daily_earned_tokens) : 0,
      m2eDailyCap: M2E.DAILY_CAP,
      m2eRatePer3Min: M2E.REWARD_PER_CYCLE,
      boostUntil,
      boostPrice: BOOST.PRICE,
      rewards: REWARDS,
      ...progress
    });
  } catch (err) {
    console.error('Balance Error:', err);
    res.status(500).json({ success: false, error: 'Server error fetching balance' });
  }
};

/**
 * POST /api/wallet/send-gift
 * Atomically debits the sender and credits the recipient's earned balance (50% platform rake)
 */
exports.sendGift = async (req, res) => {
  const senderId = req.user.id;
  const { giftId } = req.body;
  const recipientId = req.body.recipientId == null ? '' : String(req.body.recipientId);

  if (!recipientId || !giftId) {
    return res.status(400).json({ success: false, error: 'Recipient and giftId required' });
  }
  if (!isId(recipientId)) {
    return res.status(400).json({ success: false, error: 'Invalid recipient' });
  }
  if (recipientId === senderId) {
    return res.status(400).json({ success: false, error: 'You cannot send a gift to yourself' });
  }

  const gift = GIFT_CATALOG.find(g => g.id === giftId);
  if (!gift) {
    return res.status(404).json({ success: false, error: 'Gift item not found' });
  }

  const recipientReceived = roundVibe(gift.price * GIFT_RECIPIENT_SHARE);

  try {
    const result = await db.withTransaction(async (client) => {
      // Lock both wallets in a consistent order so crossing gifts cannot deadlock
      const locked = await client.query(
        'SELECT id, vibe_balance FROM users WHERE id = ANY($1::bigint[]) ORDER BY id FOR UPDATE',
        [[senderId, recipientId]]
      );
      const sender = locked.rows.find(r => r.id === senderId);
      const recipient = locked.rows.find(r => r.id === recipientId);

      if (!sender) throw new WalletError(404, 'Sender not found');
      if (!recipient) throw new WalletError(404, 'Recipient not found');
      if (Number(sender.vibe_balance) < gift.price) {
        throw new WalletError(400, 'Insufficient VIBE tokens', {
          required: gift.price,
          currentBalance: Number(sender.vibe_balance)
        });
      }

      const debited = await client.query(
        'UPDATE users SET vibe_balance = vibe_balance - $2 WHERE id = $1 RETURNING vibe_balance',
        [senderId, gift.price]
      );
      await client.query(
        'UPDATE users SET earned_balance = earned_balance + $2 WHERE id = $1',
        [recipientId, recipientReceived]
      );
      const ledger = await client.query(
        `INSERT INTO token_transactions (user_id, amount, transaction_type, metadata)
         VALUES ($1, $2, 'SEND_GIFT', $3), ($4, $5, 'RECEIVE_GIFT', $6)
         RETURNING id`,
        [
          senderId, -gift.price, { giftId: gift.id, recipientId },
          recipientId, recipientReceived, { giftId: gift.id, senderId }
        ]
      );

      return {
        senderNewBalance: Number(debited.rows[0].vibe_balance),
        transactionId: ledger.rows[0].id
      };
    });

    // Live notification to every socket the recipient has open
    req.app.get('io')?.to(`user:${recipientId}`).emit('gift_received', {
      gift,
      from: { id: senderId, username: req.user.username },
      recipientReceived
    });

    return res.json({
      success: true,
      gift,
      cost: gift.price,
      recipientReceived,
      ...result
    });
  } catch (err) {
    if (err instanceof WalletError) {
      return res.status(err.status).json({ success: false, error: err.message, ...err.details });
    }
    console.error('Gift Error:', err);
    res.status(500).json({ success: false, error: 'Server error sending gift' });
  }
};

/**
 * GET /api/wallet/transactions
 * Most recent ledger entries (max 50), with gift names and counterparty usernames resolved
 */
exports.getTransactions = async (req, res) => {
  try {
    const { rows } = await db.query(
      `SELECT t.id, t.amount, t.transaction_type, t.metadata, t.created_at, c.username AS counterparty
       FROM token_transactions t
       LEFT JOIN users c ON c.id = COALESCE(
         t.metadata->>'recipientId', t.metadata->>'senderId', t.metadata->>'inviteeId', t.metadata->>'inviterId'
       )::bigint
       WHERE t.user_id = $1
       ORDER BY t.created_at DESC
       LIMIT 50`,
      [req.user.id]
    );

    const transactions = rows.map((row) => {
      const gift = GIFT_CATALOG.find((g) => g.id === row.metadata?.giftId);
      return {
        id: row.id,
        type: row.transaction_type,
        amount: Number(row.amount),
        createdAt: row.created_at,
        gift: gift ? { name: gift.name, icon: gift.icon } : null,
        counterparty: row.counterparty || null
      };
    });

    res.json({ success: true, transactions });
  } catch (err) {
    console.error('Transactions Error:', err);
    res.status(500).json({ success: false, error: 'Server error fetching transactions' });
  }
};

/**
 * POST /api/wallet/boost
 * Spends BOOST.PRICE VIBE for an hour of VibeBoost (stacks onto an active boost)
 */
exports.purchaseBoost = async (req, res) => {
  try {
    const { balance, boostUntil } = await boost.purchaseBoost(req.user.id);
    res.json({ success: true, balance, boostUntil, price: BOOST.PRICE });
  } catch (err) {
    if (err instanceof boost.BoostError) {
      return res.status(err.status).json({ success: false, error: err.message, ...err.details });
    }
    console.error('Boost Error:', err);
    res.status(500).json({ success: false, error: 'Server error activating VibeBoost' });
  }
};

/**
 * GET /api/wallet/gifts
 */
exports.getGifts = (req, res) => {
  return res.json({ success: true, gifts: GIFT_CATALOG });
};
