const db = require('../config/db');
const payments = require('../services/payments');
const { VIBE_PACKAGES } = require('../config/economy');

function notifyWalletUpdate(req, result) {
  if (!result.credited) return;
  req.app.get('io')?.to(`user:${result.userId}`).emit('wallet_updated', {
    balance: result.balance,
    reason: 'topup',
    vibeAmount: result.vibeAmount
  });
}

/**
 * GET /api/payments/packages
 */
exports.getPackages = (req, res) => {
  res.json({
    success: true,
    enabled: payments.isConfigured(),
    keyId: process.env.RAZORPAY_KEY_ID || null,
    packages: VIBE_PACKAGES
  });
};

/**
 * POST /api/payments/order  { packageId }
 * Purchases require a registered account: guest balances live in one browser and are easily lost.
 */
exports.createOrder = async (req, res) => {
  if (!payments.isConfigured()) {
    return res.status(503).json({ success: false, error: 'Payments are not available yet' });
  }
  if (req.user.isGuest) {
    return res.status(403).json({ success: false, error: 'Create an account to buy VIBE, so your purchase is never lost' });
  }

  const pkg = VIBE_PACKAGES.find((p) => p.id === req.body.packageId);
  if (!pkg) {
    return res.status(400).json({ success: false, error: 'Unknown package' });
  }

  try {
    const order = await payments.createOrder(req.user.id, pkg);
    res.json({ success: true, ...order, keyId: process.env.RAZORPAY_KEY_ID, package: pkg });
  } catch (err) {
    console.error('Payment Order Error:', err.message);
    res.status(502).json({ success: false, error: 'Could not start the payment. Please try again.' });
  }
};

/**
 * POST /api/payments/verify  { razorpay_order_id, razorpay_payment_id, razorpay_signature }
 * Called by Checkout's success handler. Credits only once Razorpay reports the payment captured;
 * if it is merely authorized, the payment.captured webhook completes it.
 */
exports.verifyPayment = async (req, res) => {
  const { razorpay_order_id: orderId, razorpay_payment_id: paymentId, razorpay_signature: signature } = req.body;

  if (!orderId || !paymentId || !signature || !payments.verifyCheckoutSignature(orderId, paymentId, signature)) {
    return res.status(400).json({ success: false, error: 'Payment verification failed' });
  }

  try {
    const { rows } = await db.query(
      'SELECT user_id, status FROM payments WHERE razorpay_order_id = $1',
      [orderId]
    );
    if (!rows[0] || rows[0].user_id !== req.user.id) {
      return res.status(404).json({ success: false, error: 'Order not found' });
    }

    const payment = await payments.fetchPayment(paymentId);
    if (payment.order_id !== orderId) {
      return res.status(400).json({ success: false, error: 'Payment verification failed' });
    }

    if (payment.status === 'captured') {
      const result = await payments.creditPayment({ orderId, paymentId, amountPaise: payment.amount });
      notifyWalletUpdate(req, result);
      const balance = await db.query('SELECT vibe_balance FROM users WHERE id = $1', [req.user.id]);
      return res.json({ success: true, status: 'paid', balance: Number(balance.rows[0].vibe_balance) });
    }

    if (payment.status === 'authorized') {
      return res.json({ success: true, status: 'pending' });
    }

    await payments.markFailed(orderId);
    res.status(400).json({ success: false, status: 'failed', error: 'The payment did not go through' });
  } catch (err) {
    console.error('Payment Verify Error:', err.message);
    res.status(502).json({ success: false, error: 'Could not confirm the payment yet. Your VIBE will arrive shortly if it succeeded.' });
  }
};

/**
 * POST /api/webhooks/razorpay  (raw JSON body, signed with RAZORPAY_WEBHOOK_SECRET)
 */
exports.handleWebhook = async (req, res) => {
  const rawBody = req.body;
  if (!Buffer.isBuffer(rawBody) || !payments.verifyWebhookSignature(rawBody, req.header('X-Razorpay-Signature'))) {
    return res.status(400).json({ success: false, error: 'Invalid signature' });
  }

  let event;
  try {
    event = JSON.parse(rawBody.toString('utf8'));
  } catch {
    return res.status(400).json({ success: false, error: 'Invalid payload' });
  }

  const entity = event.payload?.payment?.entity;
  try {
    if ((event.event === 'payment.captured' || event.event === 'order.paid') && entity?.status === 'captured') {
      const result = await payments.creditPayment({
        orderId: entity.order_id,
        paymentId: entity.id,
        amountPaise: entity.amount
      });
      notifyWalletUpdate(req, result);
    } else if (event.event === 'payment.failed' && entity?.order_id) {
      await payments.markFailed(entity.order_id);
    }
    res.json({ success: true });
  } catch (err) {
    // Non-2xx makes Razorpay retry the webhook
    console.error('Payment Webhook Error:', err.message);
    res.status(500).json({ success: false });
  }
};
