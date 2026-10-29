// Razorpay top-ups: order creation, signature checks, exactly-once crediting, verify and webhook
const { describe, it, before, after, beforeEach } = require('node:test');
const assert = require('node:assert');
const crypto = require('node:crypto');
const http = require('node:http');
const express = require('express');
const { srcPath, stubModule, stubRedis } = require('../test-support/harness');

stubRedis();

const BUYER = '55';
const OTHER = '66';

// ---- in-memory Postgres stand-in -------------------------------------------
let paymentsTable = [];
let balances = {};
let ledger = [];

function handle(text, params = []) {
  const sql = text.replace(/\s+/g, ' ').trim();
  if (/^(BEGIN|COMMIT|ROLLBACK)/.test(sql)) return { rows: [] };
  if (sql.startsWith('INSERT INTO payments')) {
    paymentsTable.push({
      id: `p${paymentsTable.length + 1}`, user_id: params[0], package_id: params[1],
      vibe_amount: params[2], amount_paise: params[3], razorpay_order_id: params[4], status: 'created'
    });
    return { rows: [] };
  }
  if (sql.startsWith("UPDATE payments SET status = 'paid'")) {
    const row = paymentsTable.find((p) => p.razorpay_order_id === params[0] && p.status !== 'paid' && p.amount_paise === params[2]);
    if (!row) return { rows: [] };
    row.status = 'paid';
    row.razorpay_payment_id = params[1];
    return { rows: [row] };
  }
  if (sql.startsWith("UPDATE payments SET status = 'failed'")) {
    const row = paymentsTable.find((p) => p.razorpay_order_id === params[0] && p.status === 'created');
    if (row) row.status = 'failed';
    return { rows: [] };
  }
  if (sql.startsWith('UPDATE users SET vibe_balance = vibe_balance + $2')) {
    balances[params[0]] += Number(params[1]);
    return { rows: [{ vibe_balance: balances[params[0]] }] };
  }
  if (sql.startsWith('INSERT INTO token_transactions')) {
    ledger.push(params);
    return { rows: [] };
  }
  if (sql.startsWith('SELECT user_id, status FROM payments')) {
    return { rows: paymentsTable.filter((p) => p.razorpay_order_id === params[0]) };
  }
  if (sql.startsWith('SELECT vibe_balance FROM users')) {
    return { rows: [{ vibe_balance: balances[params[0]] }] };
  }
  throw new Error(`unhandled SQL: ${sql}`);
}

stubModule('config/db.js', {
  query: async (text, params) => handle(text, params),
  withTransaction: async (work) => work({ query: async (text, params) => handle(text, params) })
});

const payments = require(srcPath('services/payments.js'));
const controller = require(srcPath('controllers/paymentsController.js'));
const webhookRoutes = require(srcPath('routes/webhooks.js'));

const ENV = { RAZORPAY_KEY_ID: 'rzp_test_key', RAZORPAY_KEY_SECRET: 'key_secret', RAZORPAY_WEBHOOK_SECRET: 'hook_secret' };
const sign = (secret, payload) => crypto.createHmac('sha256', secret).update(payload).digest('hex');

let emitted = [];
function call(handler, req) {
  return new Promise((resolve) => {
    handler({
      body: {},
      header: () => undefined,
      app: { get: () => ({ to: (room) => ({ emit: (event, payload) => emitted.push({ room, event, payload }) }) }) },
      ...req
    }, {
      statusCode: 200,
      status(code) { this.statusCode = code; return this; },
      json(body) { resolve({ status: this.statusCode, body }); }
    });
  });
}

// Fake Razorpay API: records requests, answers orders and payment lookups
let razorpayRequests = [];
let paymentLookup = {};
const realFetch = global.fetch;

function resetState() {
  Object.assign(process.env, ENV);
  paymentsTable = [];
  balances = { [BUYER]: 10, [OTHER]: 10 };
  ledger = [];
  emitted = [];
  razorpayRequests = [];
  paymentLookup = {};
  global.fetch = async (url, options = {}) => {
    if (!String(url).startsWith('https://api.razorpay.com/')) return realFetch(url, options);
    razorpayRequests.push({ url, options });
    if (url.endsWith('/orders')) {
      return { ok: true, json: async () => ({ id: `order_${razorpayRequests.length}`, amount: JSON.parse(options.body).amount }) };
    }
    const id = decodeURIComponent(url.split('/payments/')[1]);
    return { ok: true, json: async () => paymentLookup[id] };
  };
}

after(() => {
  global.fetch = realFetch;
});

async function placeOrder(userId = BUYER, packageId = 'popular') {
  const { body } = await call(controller.createOrder, { user: { id: userId, isGuest: false }, body: { packageId } });
  return body.orderId;
}

describe('creating orders', () => {
  beforeEach(resetState);

  it('requires payments to be configured', async () => {
    delete process.env.RAZORPAY_KEY_SECRET;
    const { status } = await call(controller.createOrder, { user: { id: BUYER }, body: { packageId: 'popular' } });
    assert.strictEqual(status, 503);
  });

  it('refuses guests and unknown packages', async () => {
    assert.strictEqual((await call(controller.createOrder, { user: { id: BUYER, isGuest: true }, body: { packageId: 'popular' } })).status, 403);
    assert.strictEqual((await call(controller.createOrder, { user: { id: BUYER }, body: { packageId: 'nope' } })).status, 400);
    assert.strictEqual(razorpayRequests.length, 0);
  });

  it('creates a Razorpay order in paise with basic auth and records it', async () => {
    const { status, body } = await call(controller.createOrder, { user: { id: BUYER }, body: { packageId: 'popular' } });
    assert.strictEqual(status, 200);
    assert.strictEqual(body.amountPaise, 9900);
    assert.strictEqual(body.keyId, 'rzp_test_key');

    const request = razorpayRequests[0];
    assert.strictEqual(request.url, 'https://api.razorpay.com/v1/orders');
    assert.strictEqual(request.options.headers.Authorization, `Basic ${Buffer.from('rzp_test_key:key_secret').toString('base64')}`);
    assert.deepStrictEqual(JSON.parse(request.options.body).notes, { userId: BUYER, packageId: 'popular' });
    assert.deepStrictEqual(
      { user: paymentsTable[0].user_id, vibe: paymentsTable[0].vibe_amount, paise: paymentsTable[0].amount_paise, status: paymentsTable[0].status },
      { user: BUYER, vibe: 120, paise: 9900, status: 'created' }
    );
  });
});

describe('signatures', () => {
  beforeEach(resetState);

  it('accepts only the correct checkout and webhook signatures', () => {
    assert.strictEqual(payments.verifyCheckoutSignature('order_1', 'pay_1', sign('key_secret', 'order_1|pay_1')), true);
    assert.strictEqual(payments.verifyCheckoutSignature('order_1', 'pay_2', sign('key_secret', 'order_1|pay_1')), false);
    assert.strictEqual(payments.verifyCheckoutSignature('order_1', 'pay_1', 'short'), false);

    const body = Buffer.from('{"event":"payment.captured"}');
    assert.strictEqual(payments.verifyWebhookSignature(body, sign('hook_secret', body)), true);
    assert.strictEqual(payments.verifyWebhookSignature(body, sign('wrong', body)), false);
    assert.strictEqual(payments.verifyWebhookSignature(body, undefined), false);
  });
});

describe('crediting', () => {
  beforeEach(resetState);

  it('credits exactly once, and only for the ordered amount', async () => {
    const orderId = await placeOrder();

    const wrongAmount = await payments.creditPayment({ orderId, paymentId: 'pay_1', amountPaise: 100 });
    assert.strictEqual(wrongAmount.credited, false);

    const first = await payments.creditPayment({ orderId, paymentId: 'pay_1', amountPaise: 9900 });
    const second = await payments.creditPayment({ orderId, paymentId: 'pay_1', amountPaise: 9900 });
    assert.strictEqual(first.credited, true);
    assert.strictEqual(second.credited, false);
    assert.strictEqual(balances[BUYER], 130);
    assert.strictEqual(ledger.length, 1);
    assert.deepStrictEqual([ledger[0][0], ledger[0][1]], [BUYER, 120]);
  });
});

describe('checkout verification', () => {
  beforeEach(resetState);

  const verify = (userId, orderId, paymentId, signature) => call(controller.verifyPayment, {
    user: { id: userId },
    body: { razorpay_order_id: orderId, razorpay_payment_id: paymentId, razorpay_signature: signature ?? sign('key_secret', `${orderId}|${paymentId}`) }
  });

  it('rejects bad signatures and other users\' orders', async () => {
    const orderId = await placeOrder();
    assert.strictEqual((await verify(BUYER, orderId, 'pay_1', 'deadbeef')).status, 400);
    assert.strictEqual((await verify(OTHER, orderId, 'pay_1')).status, 404);
    assert.strictEqual(balances[BUYER], 10);
  });

  it('credits a captured payment and notifies the buyer live', async () => {
    const orderId = await placeOrder();
    paymentLookup.pay_1 = { id: 'pay_1', order_id: orderId, status: 'captured', amount: 9900 };
    const { status, body } = await verify(BUYER, orderId, 'pay_1');
    assert.strictEqual(status, 200);
    assert.deepStrictEqual(body, { success: true, status: 'paid', balance: 130 });
    assert.deepStrictEqual(emitted[0], { room: `user:${BUYER}`, event: 'wallet_updated', payload: { balance: 130, reason: 'topup', vibeAmount: 120 } });
  });

  it('waits for capture when the payment is only authorized, and marks failures', async () => {
    const orderId = await placeOrder();
    paymentLookup.pay_1 = { id: 'pay_1', order_id: orderId, status: 'authorized', amount: 9900 };
    assert.strictEqual((await verify(BUYER, orderId, 'pay_1')).body.status, 'pending');
    assert.strictEqual(balances[BUYER], 10);

    paymentLookup.pay_1.status = 'failed';
    assert.strictEqual((await verify(BUYER, orderId, 'pay_1')).status, 400);
    assert.strictEqual(paymentsTable[0].status, 'failed');
  });

  it('rejects a payment that belongs to a different order', async () => {
    const orderId = await placeOrder();
    paymentLookup.pay_9 = { id: 'pay_9', order_id: 'order_other', status: 'captured', amount: 9900 };
    assert.strictEqual((await verify(BUYER, orderId, 'pay_9')).status, 400);
    assert.strictEqual(balances[BUYER], 10);
  });
});

describe('webhook (real HTTP, raw body)', () => {
  beforeEach(resetState);

  let server;
  let url;

  before(async () => {
    const app = express();
    app.set('io', { to: (room) => ({ emit: (event, payload) => emitted.push({ room, event, payload }) }) });
    app.use('/api/webhooks', webhookRoutes);
    app.use(express.json());
    server = http.createServer(app);
    await new Promise((resolve) => server.listen(0, resolve));
    url = `http://localhost:${server.address().port}/api/webhooks/razorpay`;
  });

  after(async () => {
    await new Promise((resolve) => server.close(resolve));
  });

  const post = (payload, signature) => {
    const body = JSON.stringify(payload);
    return realFetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Razorpay-Signature': signature ?? sign('hook_secret', body) },
      body
    });
  };

  it('rejects unsigned or tampered events', async () => {
    const orderId = await placeOrder();
    const event = { event: 'payment.captured', payload: { payment: { entity: { id: 'pay_1', order_id: orderId, status: 'captured', amount: 9900 } } } };
    assert.strictEqual((await post(event, 'bad')).status, 400);
    assert.strictEqual(balances[BUYER], 10);
  });

  it('credits on payment.captured, ignores duplicates, and marks payment.failed', async () => {
    const orderId = await placeOrder();
    const event = { event: 'payment.captured', payload: { payment: { entity: { id: 'pay_1', order_id: orderId, status: 'captured', amount: 9900 } } } };
    assert.strictEqual((await post(event)).status, 200);
    assert.strictEqual((await post(event)).status, 200, 'Razorpay retries are acknowledged');
    assert.strictEqual(balances[BUYER], 130, 'credited once');

    const failedOrder = await placeOrder();
    const failed = { event: 'payment.failed', payload: { payment: { entity: { id: 'pay_2', order_id: failedOrder, status: 'failed', amount: 9900 } } } };
    assert.strictEqual((await post(failed)).status, 200);
    assert.strictEqual(paymentsTable.find((p) => p.razorpay_order_id === failedOrder).status, 'failed');
  });
});
