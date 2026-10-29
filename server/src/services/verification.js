const crypto = require('crypto');
const db = require('../config/db');
const { sendEmail, SUPPORT_EMAIL } = require('./email');

const CODE_TTL_MINUTES = 15;
const RESEND_COOLDOWN_SECONDS = 60;
const MAX_ATTEMPTS = 5;

class VerificationError extends Error {
  constructor(status, message, details = {}) {
    super(message);
    this.status = status;
    this.details = details;
  }
}

// Only an HMAC of the code is stored, bound to the user so a hash can't be reused elsewhere
function hashCode(userId, code) {
  return crypto.createHmac('sha256', process.env.JWT_SECRET).update(`${userId}:${code}`).digest('hex');
}

function sameHash(a, b) {
  const left = Buffer.from(a || '', 'hex');
  const right = Buffer.from(b || '', 'hex');
  return left.length === right.length && left.length > 0 && crypto.timingSafeEqual(left, right);
}

/**
 * Emails a fresh 6-digit code, replacing any earlier one. Throws (429) inside the resend cooldown.
 */
async function sendCode(user) {
  const sentAt = user.verification_sent_at ? new Date(user.verification_sent_at).getTime() : 0;
  const waitSeconds = Math.ceil((sentAt + RESEND_COOLDOWN_SECONDS * 1000 - Date.now()) / 1000);
  if (waitSeconds > 0) {
    throw new VerificationError(429, `Please wait ${waitSeconds}s before asking for another code.`, { retryAfter: waitSeconds });
  }

  const code = String(crypto.randomInt(0, 1000000)).padStart(6, '0');
  await db.query(
    `UPDATE users SET verification_code_hash = $2, verification_attempts = 0, verification_sent_at = NOW(),
       verification_expires_at = NOW() + make_interval(mins => $3)
     WHERE id = $1`,
    [user.id, hashCode(user.id, code), CODE_TTL_MINUTES]
  );

  await sendEmail({
    to: user.email,
    subject: `${code} is your VibeLoop code`,
    text: `Hi ${user.username},\n\nYour VibeLoop verification code is ${code}. It expires in ${CODE_TTL_MINUTES} minutes.\n\nIf you didn't create a VibeLoop account, you can ignore this email.\n\nNeed help? Write to ${SUPPORT_EMAIL}.`,
    html: `<div style="font-family:Arial,sans-serif;max-width:420px;margin:auto;padding:24px;color:#111">
      <h2 style="margin:0 0 12px">Verify your email</h2>
      <p>Hi ${escapeHtml(user.username)}, enter this code in VibeLoop:</p>
      <p style="font-size:32px;font-weight:bold;letter-spacing:8px;margin:20px 0">${code}</p>
      <p style="color:#555;font-size:13px">It expires in ${CODE_TTL_MINUTES} minutes. If you didn't create a VibeLoop account, ignore this email.</p>
      <p style="color:#555;font-size:13px">Need help? Write to <a href="mailto:${SUPPORT_EMAIL}">${SUPPORT_EMAIL}</a>.</p>
    </div>`
  });
}

/**
 * Checks a code. Returns normally on success; throws VerificationError otherwise.
 * Each wrong guess counts; after MAX_ATTEMPTS the code is dead and a new one must be requested.
 */
async function checkCode(user, code) {
  if (!/^\d{6}$/.test(String(code || ''))) {
    throw new VerificationError(400, 'Enter the 6-digit code from the email.');
  }
  if (!user.verification_code_hash || !user.verification_expires_at || new Date(user.verification_expires_at) < new Date()) {
    throw new VerificationError(400, 'This code has expired. Ask for a new one.');
  }
  if (user.verification_attempts >= MAX_ATTEMPTS) {
    throw new VerificationError(429, 'Too many wrong codes. Ask for a new one.');
  }
  if (!sameHash(hashCode(user.id, code), user.verification_code_hash)) {
    await db.query('UPDATE users SET verification_attempts = verification_attempts + 1 WHERE id = $1', [user.id]);
    const left = MAX_ATTEMPTS - user.verification_attempts - 1;
    throw new VerificationError(400, left > 0 ? `That code is wrong. ${left} tr${left === 1 ? 'y' : 'ies'} left.` : 'Too many wrong codes. Ask for a new one.');
  }
}

function escapeHtml(text) {
  return String(text).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
}

module.exports = { sendCode, checkCode, VerificationError, CODE_TTL_MINUTES, MAX_ATTEMPTS };
