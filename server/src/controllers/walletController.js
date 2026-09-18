const GIFT_CATALOG = [
  { id: 'rose', name: 'Cyber Rose', price: 1, icon: '🌹', color: '#FF2A7A' },
  { id: 'heart', name: 'Neon Heart', price: 5, icon: '💖', color: '#FF2A7A' },
  { id: 'flame', name: 'Vibe Flame', price: 10, icon: '🔥', color: '#FF9E00' },
  { id: 'diamond', name: 'Hyper Diamond', price: 25, icon: '💎', color: '#00F0FF' },
  { id: 'crown', name: 'Royal Crown', price: 75, icon: '👑', color: '#FFD166' }
];

// In-memory wallet store (synchronized with Redis in production)
const userWallets = new Map();

const DEFAULT_WALLET = {
  balance: 10.0,
  m2eEarnedToday: 0.0,
  activeSecondsToday: 0,
  lastM2EReset: new Date().toDateString()
};

function getOrCreateWallet(userId) {
  if (!userWallets.has(userId)) {
    userWallets.set(userId, { ...DEFAULT_WALLET });
  }
  const wallet = userWallets.get(userId);
  
  // Daily reset check
  const today = new Date().toDateString();
  if (wallet.lastM2EReset !== today) {
    wallet.m2eEarnedToday = 0.0;
    wallet.activeSecondsToday = 0;
    wallet.lastM2EReset = today;
  }
  return wallet;
}

/**
 * GET /api/wallet/balance
 */
exports.getBalance = (req, res) => {
  const userId = req.user?.id || req.query.userId || 'guest_user';
  const wallet = getOrCreateWallet(userId);
  
  return res.json({
    success: true,
    balance: parseFloat(wallet.balance.toFixed(2)),
    m2eEarnedToday: parseFloat(wallet.m2eEarnedToday.toFixed(2)),
    m2eDailyCap: 10.0,
    m2eRatePer3Min: 0.10,
    activeSecondsToday: wallet.activeSecondsToday
  });
};

/**
 * POST /api/wallet/m2e-heartbeat
 * Recovers 0.10 VIBE for every 180s (3 mins) of active video time, max 10 VIBE/day
 */
exports.processMeetToEarn = (req, res) => {
  const userId = req.user?.id || req.body.userId || 'guest_user';
  const { activeSeconds = 30 } = req.body; // Heartbeat interval (e.g. 30s)

  const wallet = getOrCreateWallet(userId);
  const DAILY_CAP = 10.0;
  const REWARD_PER_CYCLE = 0.10;
  const CYCLE_SECONDS = 180; // 3 minutes

  const prevSeconds = wallet.activeSecondsToday;
  wallet.activeSecondsToday += Number(activeSeconds);

  // Check how many 3-minute boundaries were crossed
  const prevCycles = Math.floor(prevSeconds / CYCLE_SECONDS);
  const newCycles = Math.floor(wallet.activeSecondsToday / CYCLE_SECONDS);
  const cyclesEarned = newCycles - prevCycles;

  let rewardEarned = 0;
  if (cyclesEarned > 0 && wallet.m2eEarnedToday < DAILY_CAP) {
    const potentialReward = cyclesEarned * REWARD_PER_CYCLE;
    const remainingCap = DAILY_CAP - wallet.m2eEarnedToday;
    rewardEarned = Math.min(potentialReward, remainingCap);

    wallet.m2eEarnedToday += rewardEarned;
    wallet.balance += rewardEarned;
  }

  return res.json({
    success: true,
    rewardEarned: parseFloat(rewardEarned.toFixed(2)),
    balance: parseFloat(wallet.balance.toFixed(2)),
    m2eEarnedToday: parseFloat(wallet.m2eEarnedToday.toFixed(2)),
    m2eDailyCap: DAILY_CAP,
    secondsUntilNextReward: CYCLE_SECONDS - (wallet.activeSecondsToday % CYCLE_SECONDS)
  });
};

/**
 * POST /api/wallet/send-gift
 * Handles live gifting with 50% platform rake
 */
exports.sendGift = (req, res) => {
  const senderId = req.user?.id || req.body.senderId || 'guest_user';
  const { recipientId, giftId } = req.body;

  if (!recipientId || !giftId) {
    return res.status(400).json({ success: false, error: 'Recipient and giftId required' });
  }

  const gift = GIFT_CATALOG.find(g => g.id === giftId);
  if (!gift) {
    return res.status(404).json({ success: false, error: 'Gift item not found' });
  }

  const senderWallet = getOrCreateWallet(senderId);

  if (senderWallet.balance < gift.price) {
    return res.status(400).json({ 
      success: false, 
      error: 'Insufficient VIBE tokens',
      required: gift.price,
      currentBalance: senderWallet.balance
    });
  }

  // Deduct full amount from sender
  senderWallet.balance -= gift.price;

  // 50% Rake to Recipient
  const recipientEarnings = gift.price * 0.50;
  const recipientWallet = getOrCreateWallet(recipientId);
  recipientWallet.balance += recipientEarnings;

  return res.json({
    success: true,
    gift: gift,
    cost: gift.price,
    recipientReceived: recipientEarnings,
    senderNewBalance: parseFloat(senderWallet.balance.toFixed(2)),
    transactionId: `tx_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`
  });
};

/**
 * GET /api/wallet/gifts
 */
exports.getGifts = (req, res) => {
  return res.json({ success: true, gifts: GIFT_CATALOG });
};