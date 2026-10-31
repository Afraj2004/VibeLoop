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

/**
 * Emailed 6-digit codes, one kind per purpose. Each purpose has its own columns,
 * so a sign-up code can never be used to reset a password, or the other way round.
 */
const PURPOSES = {
  // Confirms the email address of a new account
  verify: {
    columns: {
      hash: 'verification_code_hash', expires: 'verification_expires_at',
      attempts: 'verification_attempts', sentAt: 'verification_sent_at'
    },
    subject: (code) => `${code} is your VibeLoop code`,
    heading: 'Verify your email',
    intro: 'Your VibeLoop verification code is',
    ignore: "If you didn't create a VibeLoop account, you can ignore this email."
  },
  // Lets someone who forgot their password choose a new one
  reset: {
    columns: {
      hash: 'reset_code_hash', expires: 'reset_expires_at',
      attempts: 'reset_attempts', sentAt: 'reset_sent_at'
    },
    subject: (code) => `${code} is your VibeLoop password reset code`,
    heading: 'Reset your password',
    intro: 'Your VibeLoop password reset code is',
    ignore: "If you didn't ask to reset your password, ignore this email. Your password hasn't changed."
  }
};

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
 * Emails a fresh 6-digit code, replacing any earlier one of the same purpose.
 * Throws (429) inside the resend cooldown.
 */
async function sendCode(user, purpose = 'verify') {
  const { columns, subject, heading, intro, ignore } = PURPOSES[purpose];
  const lastSent = user[columns.sentAt];
  const sentAt = lastSent ? new Date(lastSent).getTime() : 0;
  const waitSeconds = Math.ceil((sentAt + RESEND_COOLDOWN_SECONDS * 1000 - Date.now()) / 1000);
  if (waitSeconds > 0) {
    throw new VerificationError(429, `Please wait ${waitSeconds}s before asking for another code.`, { retryAfter: waitSeconds });
  }

  const code = String(crypto.randomInt(0, 1000000)).padStart(6, '0');
  await db.query(
    `UPDATE users SET ${columns.hash} = $2, ${columns.attempts} = 0, ${columns.sentAt} = NOW(),
       ${columns.expires} = NOW() + make_interval(mins => $3)
     WHERE id = $1`,
    [user.id, hashCode(user.id, code), CODE_TTL_MINUTES]
  );

  await sendEmail({
    to: user.email,
    subject: subject(code),
    text: `Hi ${user.username},\n\n${intro} ${code}. It expires in ${CODE_TTL_MINUTES} minutes.\n\n${ignore}\n\nNeed help? Write to ${SUPPORT_EMAIL}.`,
    html: `<div style="font-family:Arial,sans-serif;max-width:420px;margin:auto;padding:24px;color:#111">
      <h2 style="margin:0 0 12px">${heading}</h2>
      <p>Hi ${escapeHtml(user.username)}, enter this code in VibeLoop:</p>
      <p style="font-size:32px;font-weight:bold;letter-spacing:8px;margin:20px 0">${code}</p>
      <p style="color:#555;font-size:13px">It expires in ${CODE_TTL_MINUTES} minutes. ${ignore}</p>
      <p style="color:#555;font-size:13px">Need help? Write to <a href="mailto:${SUPPORT_EMAIL}">${SUPPORT_EMAIL}</a>.</p>
    </div>`
  });
}

/**
 * Checks a code. Returns normally on success; throws VerificationError otherwise.
 * Each wrong guess counts; after MAX_ATTEMPTS the code is dead and a new one must be requested.
 */
async function checkCode(user, code, purpose = 'verify') {
  const { columns } = PURPOSES[purpose];
  if (!/^\d{6}$/.test(String(code || ''))) {
    throw new VerificationError(400, 'Enter the 6-digit code from the email.');
  }
  const storedHash = user[columns.hash];
  const expiresAt = user[columns.expires];
  const attempts = Number(user[columns.attempts] || 0);
  if (!storedHash || !expiresAt || new Date(expiresAt) < new Date()) {
    throw new VerificationError(400, 'This code has expired. Ask for a new one.');
  }
  if (attempts >= MAX_ATTEMPTS) {
    throw new VerificationError(429, 'Too many wrong codes. Ask for a new one.');
  }
  if (!sameHash(hashCode(user.id, code), storedHash)) {
    await db.query(`UPDATE users SET ${columns.attempts} = ${columns.attempts} + 1 WHERE id = $1`, [user.id]);
    const left = MAX_ATTEMPTS - attempts - 1;
    throw new VerificationError(400, left > 0 ? `That code is wrong. ${left} tr${left === 1 ? 'y' : 'ies'} left.` : 'Too many wrong codes. Ask for a new one.');
  }
}

function escapeHtml(text) {
  return String(text).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
}

module.exports = { sendCode, checkCode, VerificationError, CODE_TTL_MINUTES, MAX_ATTEMPTS };
