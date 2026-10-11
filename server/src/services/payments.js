const crypto = require('crypto');
const db = require('../config/db');

const RAZORPAY_API = 'https://api.razorpay.com/v1';

const isConfigured = () => Boolean(process.env.RAZORPAY_KEY_ID && process.env.RAZORPAY_KEY_SECRET);

async function razorpayRequest(method, path, body) {
  const auth = Buffer.from(`${process.env.RAZORPAY_KEY_ID}:${process.env.RAZORPAY_KEY_SECRET}`).toString('base64');
  const response = await fetch(`${RAZORPAY_API}${path}`, {
    method,
    headers: { Authorization: `Basic ${auth}`, 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(10000)
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(`Razorpay ${method} ${path} failed (${response.status}): ${data.error?.description || 'unknown error'}`);
  }
  return data;
}

function hmacHex(secret, payload) {
  return crypto.createHmac('sha256', secret).update(payload).digest('hex');
}

function safeEqual(a, b) {
  const left = Buffer.from(String(a));
  const right = Buffer.from(String(b));
  return left.length === right.length && crypto.timingSafeEqual(left, right);
}

/**
 * Checkout handler signature: HMAC-SHA256(order_id|payment_id, key secret)
 */
function verifyCheckoutSignature(orderId, paymentId, signature) {
  return safeEqual(hmacHex(process.env.RAZORPAY_KEY_SECRET, `${orderId}|${paymentId}`), signature);
}

/**
 * Webhook signature: HMAC-SHA256(raw request body, webhook secret)
 */
function verifyWebhookSignature(rawBody, signature) {
  const secret = process.env.RAZORPAY_WEBHOOK_SECRET;
  return Boolean(secret && signature) && safeEqual(hmacHex(secret, rawBody), signature);
}

/**
 * Creates a Razorpay order for a package and records it as 'created'
 */
async function createOrder(userId, pkg) {
  const amountPaise = pkg.priceInr * 100;
  const order = await razorpayRequest('POST', '/orders', {
    amount: amountPaise,
    currency: 'INR',
    receipt: `vibe_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`,
    notes: { userId, packageId: pkg.id }
  });

  await db.query(
    `INSERT INTO payments (user_id, package_id, vibe_amount, amount_paise, currency, razorpay_order_id)
     VALUES ($1, $2, $3, $4, 'INR', $5)`,
    [userId, pkg.id, pkg.vibe, amountPaise, order.id]
  );

  return { orderId: order.id, amountPaise, currency: 'INR' };
}

async function fetchPayment(paymentId) {
  return razorpayRequest('GET', `/payments/${encodeURIComponent(paymentId)}`);
}

/**
 * Credits a captured payment exactly once. The status flip from 'created' is the idempotency
 * guard, so the checkout callback and the webhook can both call this safely.
 * Returns { credited, userId, vibeAmount, balance } (credited=false if already processed).
 */
async function creditPayment({ orderId, paymentId, amountPaise }) {
  return db.withTransaction(async (client) => {
    const marked = await client.query(
      `UPDATE payments SET status = 'paid', razorpay_payment_id = $2, paid_at = NOW()
       WHERE razorpay_order_id = $1 AND status <> 'paid' AND amount_paise = $3
       RETURNING id, user_id, vibe_amount, package_id`,
      [orderId, paymentId, amountPaise]
    );
    const payment = marked.rows[0];
    if (!payment) return { credited: false };

    // The buyer may have deleted their account since paying; nothing to credit then
    if (!payment.user_id) return { credited: false };

    const updated = await client.query(
      'UPDATE users SET vibe_balance = vibe_balance + $2 WHERE id = $1 RETURNING vibe_balance',
      [payment.user_id, payment.vibe_amount]
    );
    await client.query(
      `INSERT INTO token_transactions (user_id, amount, transaction_type, metadata)
       VALUES ($1, $2, 'WALLET_REFILL', $3)`,
      [payment.user_id, payment.vibe_amount, { packageId: payment.package_id, orderId, paymentId }]
    );

    return {
      credited: true,
      userId: payment.user_id,
      vibeAmount: Number(payment.vibe_amount),
      balance: updated.rows[0] ? Number(updated.rows[0].vibe_balance) : null
    };
  });
}

async function markFailed(orderId) {
  await db.query(
    "UPDATE payments SET status = 'failed' WHERE razorpay_order_id = $1 AND status = 'created'",
    [orderId]
  );
}

module.exports = {
  isConfigured,
  verifyCheckoutSignature,
  verifyWebhookSignature,
  createOrder,
  fetchPayment,
  creditPayment,
  markFailed
};
