const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const db = require('../config/db');
const { signToken } = require('../config/jwt');
const { REWARDS } = require('../config/economy');
const { countryFromLocation } = require('../services/geo');
const verification = require('../services/verification');
const { ageOn, checkBirthDate } = require('../config/age');
const { SUPPORT_EMAIL } = require('../services/email');

const USER_COLUMNS = 'id, username, email, vibe_balance, gender, country_code, is_guest, avatar_key, avatar_rewarded_at, likes_received, birth_date';

const GENDERS = ['male', 'female', 'other'];
const USERNAME_PATTERN = /^[a-zA-Z0-9_]{3,32}$/;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const COUNTRY_PATTERN = /^[A-Z]{2,3}$/;

// Bump when the Terms / Community Guidelines change; stored with each acceptance
const TERMS_VERSION = '2026-10-29';
const CONSENT_ERROR = 'You must confirm you are 18 or older and accept the Terms to use VibeLoop';

const LOCATION_REQUIRED = 'Allow location access so we can set your country';
const LOCATION_UNKNOWN = "We couldn't work out your country from your location. Please try again.";

const hasConsent = (body) => body?.ageConfirmed === true && body?.termsAccepted === true;

function toPublicUser(user) {
  return {
    id: String(user.id),
    username: user.username,
    email: user.email,
    gender: user.gender,
    country: user.country_code,
    isGuest: user.is_guest,
    balance: user.vibe_balance,
    // Photo URL key for GET /api/avatars/:key (changes on every upload); null when there is no photo
    avatarKey: user.avatar_key || null,
    photoRewardClaimed: Boolean(user.avatar_rewarded_at),
    likes: Number(user.likes_received || 0),
    // Own profile only; partners see just the age
    birthDate: user.birth_date || null,
    age: user.birth_date ? ageOn(user.birth_date) : null
  };
}

const checkPassword = (password) => (typeof password !== 'string' || password.length < 8 || password.length > 128
  ? 'Password must be 8-128 characters'
  : null);

function validateRegistration({ username, email, password, gender, birthDate }) {
  if (!USERNAME_PATTERN.test(username || '')) {
    return 'Username must be 3-32 characters: letters, numbers or underscores';
  }
  const trimmedEmail = typeof email === 'string' ? email.trim() : '';
  if (!EMAIL_PATTERN.test(trimmedEmail) || trimmedEmail.length > 255) {
    return 'A valid email address is required';
  }
  const passwordError = checkPassword(password);
  if (passwordError) return passwordError;
  // Required: it is locked once the account exists (see updateProfile)
  if (!GENDERS.includes(gender)) {
    return 'Choose your gender';
  }
  return checkBirthDate(birthDate).error || null;
}

/**
 * POST /api/auth/guest
 * Instant, frictionless session: creates an anonymous user row so guests can
 * match, chat and hold a wallet before upgrading to a full account. Guests start with 0 VIBE.
 */
exports.createGuest = async (req, res) => {
  if (!hasConsent(req.body)) {
    return res.status(400).json({ success: false, error: CONSENT_ERROR });
  }
  // Usually sent from the first-visit screen; sessions created without one are asked for it next
  let birthDate = null;
  if (req.body.birthDate !== undefined) {
    const checked = checkBirthDate(req.body.birthDate);
    if (checked.error) return res.status(400).json({ success: false, error: checked.error });
    birthDate = checked.birthDate;
  }

  try {
    const username = `guest_${crypto.randomBytes(4).toString('hex')}`;
    const result = await db.query(
      `INSERT INTO users (username, is_guest, age_confirmed_at, terms_accepted_at, terms_version, vibe_balance, birth_date)
       VALUES ($1, TRUE, NOW(), NOW(), $2, 0, $3) RETURNING ${USER_COLUMNS}`,
      [username, TERMS_VERSION, birthDate]
    );
    const user = result.rows[0];

    res.status(201).json({ success: true, token: signToken(user), user: toPublicUser(user) });
  } catch (err) {
    console.error('Guest Session Error:', err);
    res.status(500).json({ success: false, error: 'Server error creating guest session' });
  }
};

/**
 * POST /api/auth/register
 * Stores the account and emails a 6-digit code; there is no session until POST /api/auth/verify-email.
 * Called from a guest session (Authorization header), the details go onto the guest row, which stays a
 * guest until verified: then its VIBE balance, history, contacts and blocks carry over to the account.
 * Re-registering from the same guest session (e.g. to fix a mistyped email) replaces the pending details.
 */
exports.register = async (req, res) => {
  if (!hasConsent(req.body)) {
    return res.status(400).json({ success: false, error: CONSENT_ERROR });
  }

  const validationError = validateRegistration(req.body);
  if (validationError) {
    return res.status(400).json({ success: false, error: validationError });
  }

  // The country always comes from the device's location, never from a typed value
  const { username, password, gender } = req.body;
  const email = req.body.email.trim().toLowerCase();
  const { birthDate } = checkBirthDate(req.body.birthDate);
  if (!req.body.location) {
    return res.status(400).json({ success: false, error: LOCATION_REQUIRED });
  }
  const country = countryFromLocation(req.body.location);
  if (!country) {
    return res.status(400).json({ success: false, error: LOCATION_UNKNOWN });
  }
  const guestId = req.user?.isGuest ? req.user.id : null;

  try {
    // Check if user exists (the upgrading guest's own row does not count)
    const userExists = await db.query(
      'SELECT id FROM users WHERE (LOWER(email) = $1 OR LOWER(username) = LOWER($2)) AND id IS DISTINCT FROM $3',
      [email, username, guestId]
    );

    if (userExists.rows.length > 0) {
      return res.status(400).json({ success: false, error: 'User already exists' });
    }

    // Hash password
    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(password, salt);

    const PENDING_COLUMNS = 'id, username, email, verification_sent_at';
    let pending = null;

    if (guestId) {
      const upgraded = await db.query(
        `UPDATE users
         SET username = $2, email = $3, password_hash = $4, gender = $5, country_code = $6,
             age_confirmed_at = NOW(), terms_accepted_at = NOW(), terms_version = $7, verification_sent_at = NULL,
             birth_date = COALESCE(birth_date, $8)
         WHERE id = $1 AND is_guest = TRUE
         RETURNING ${PENDING_COLUMNS}`,
        [guestId, username, email, passwordHash, gender, country, TERMS_VERSION, birthDate]
      );
      // Falls through to a fresh account if the guest row no longer exists
      pending = upgraded.rows[0] || null;
    }

    if (!pending) {
      const inserted = await db.query(
        `INSERT INTO users (username, email, password_hash, gender, country_code,
                            age_confirmed_at, terms_accepted_at, terms_version, vibe_balance, birth_date)
         VALUES ($1, $2, $3, $4, $5, NOW(), NOW(), $6, 0, $7) RETURNING ${PENDING_COLUMNS}`,
        [username, email, passwordHash, gender, country, TERMS_VERSION, birthDate]
      );
      pending = inserted.rows[0];
    }

    let emailError;
    try {
      await verification.sendCode(pending);
    } catch (err) {
      console.error('Verification Email Error:', err.message);
      emailError = "We couldn't send the code right now. Tap \"Resend code\" in a minute.";
    }

    res.status(201).json({ success: true, needsVerification: true, email, ...(emailError && { emailError }) });
  } catch (err) {
    console.error('Registration Error:', err);
    res.status(500).json({ success: false, error: 'Server error during registration' });
  }
};

/**
 * POST /api/auth/login
 */
exports.login = async (req, res) => {
  const { email, password } = req.body;

  if (typeof email !== 'string' || typeof password !== 'string') {
    return res.status(400).json({ success: false, error: 'Email and password are required' });
  }

  try {
    const result = await db.query('SELECT * FROM users WHERE LOWER(email) = LOWER($1)', [email.trim()]);
    const user = result.rows[0];

    // Guest rows have no password hash and can never log in with credentials
    if (!user || !user.password_hash) {
      return res.status(400).json({ success: false, error: 'Invalid credentials' });
    }

    const isMatch = await bcrypt.compare(password, user.password_hash);
    if (!isMatch) {
      return res.status(400).json({ success: false, error: 'Invalid credentials' });
    }

    // Unverified accounts get a fresh code instead of a session
    if (!user.email_verified_at) {
      let note = 'We sent a code to your email.';
      try {
        await verification.sendCode(user);
      } catch (err) {
        if (err instanceof verification.VerificationError) {
          note = 'Use the code we just sent.';
        } else {
          console.error('Verification Email Error:', err.message);
          note = 'We couldn\'t send a code right now. Try "Resend code" shortly.';
        }
      }
      return res.status(403).json({
        success: false, needsVerification: true, email: user.email, error: `Verify your email to sign in. ${note}`
      });
    }

    res.json({ success: true, token: signToken(user), user: toPublicUser(user) });
  } catch (err) {
    console.error('Login Error:', err);
    res.status(500).json({ success: false, error: 'Server error during login' });
  }
};

/**
 * PATCH /api/auth/profile
 * Updates the matchmaking profile (own gender/country). Registered accounts keep the gender
 * they signed up with, so it cannot be flipped to slip past other people's gender filters,
 * and their country only changes through PATCH /api/profile/location.
 * Issues a fresh token because
 * the signaling server reads these values from the token claims.
 */
exports.updateProfile = async (req, res) => {
  const { gender, country } = req.body;

  if (!GENDERS.includes(gender)) {
    return res.status(400).json({ success: false, error: 'Invalid gender' });
  }
  if (!COUNTRY_PATTERN.test(country || '')) {
    return res.status(400).json({ success: false, error: 'Invalid country code' });
  }

  try {
    const current = await db.query('SELECT is_guest, gender, country_code FROM users WHERE id = $1', [req.user.id]);
    if (!current.rows[0]) {
      return res.status(404).json({ success: false, error: 'User not found' });
    }
    if (!current.rows[0].is_guest && current.rows[0].gender !== gender) {
      return res.status(403).json({
        success: false,
        error: `Your gender was set when you signed up and cannot be changed. Contact ${SUPPORT_EMAIL} if it is wrong.`
      });
    }
    if (!current.rows[0].is_guest && current.rows[0].country_code !== country) {
      return res.status(403).json({
        success: false,
        error: 'Your country comes from your location. Update it from your profile.'
      });
    }

    const result = await db.query(
      `UPDATE users SET gender = $2, country_code = $3 WHERE id = $1 RETURNING ${USER_COLUMNS}`,
      [req.user.id, gender, country]
    );
    const user = result.rows[0];
    if (!user) {
      return res.status(404).json({ success: false, error: 'User not found' });
    }

    res.json({ success: true, token: signToken(user), user: toPublicUser(user) });
  } catch (err) {
    console.error('Profile Update Error:', err);
    res.status(500).json({ success: false, error: 'Server error updating profile' });
  }
};

/**
 * GET /api/auth/me
 */
exports.getMe = async (req, res) => {
  try {
    const result = await db.query(
      `SELECT ${USER_COLUMNS}, created_at FROM users WHERE id = $1`,
      [req.user.id]
    );
    if (!result.rows[0]) {
      return res.status(404).json({ success: false, error: 'User not found' });
    }
    const user = result.rows[0];
    // A birth date added from another device isn't in this session's token yet: matchmaking needs it
    const staleToken = !req.user.birthDate && user.birth_date;
    res.json({ success: true, user: toPublicUser(user), ...(staleToken && { token: signToken(user) }) });
  } catch (err) {
    res.status(500).json({ success: false, error: 'Server error fetching user' });
  }
};

exports.toPublicUser = toPublicUser;

exports.USER_COLUMNS = USER_COLUMNS;

/**
 * POST /api/geo/country  { latitude, longitude }
 * Previews the country a location resolves to (shown on the sign-up form). Nothing is stored.
 */
exports.detectCountry = (req, res) => {
  const country = countryFromLocation(req.body);
  if (!country) {
    return res.status(400).json({ success: false, error: LOCATION_UNKNOWN });
  }
  res.json({ success: true, country });
};

/**
 * PATCH /api/profile/location  { latitude, longitude }
 * Sets your country from your current location. Returns a fresh token (matchmaking reads the claim).
 */
exports.updateLocation = async (req, res) => {
  const country = countryFromLocation(req.body);
  if (!country) {
    return res.status(400).json({ success: false, error: LOCATION_UNKNOWN });
  }

  try {
    const { rows } = await db.query(
      `UPDATE users SET country_code = $2 WHERE id = $1 RETURNING ${USER_COLUMNS}`,
      [req.user.id, country]
    );
    if (!rows[0]) {
      return res.status(404).json({ success: false, error: 'User not found' });
    }
    res.json({ success: true, token: signToken(rows[0]), user: toPublicUser(rows[0]) });
  } catch (err) {
    console.error('Location Update Error:', err);
    res.status(500).json({ success: false, error: 'Server error updating your country' });
  }
};

/**
 * PATCH /api/profile/birth-date  { birthDate }
 * One-time: for sessions that started before birth dates were asked. Once set it can't be changed
 * (only support can correct it). Returns a fresh token, since matchmaking reads the age from it.
 */
exports.setBirthDate = async (req, res) => {
  const { birthDate, error } = checkBirthDate(req.body?.birthDate);
  if (error) {
    return res.status(400).json({ success: false, error });
  }

  try {
    const { rows } = await db.query(
      `UPDATE users SET birth_date = $2 WHERE id = $1 AND birth_date IS NULL RETURNING ${USER_COLUMNS}`,
      [req.user.id, birthDate]
    );
    if (!rows[0]) {
      const existing = await db.query(`SELECT ${USER_COLUMNS} FROM users WHERE id = $1`, [req.user.id]);
      if (!existing.rows[0]) {
        return res.status(404).json({ success: false, error: 'User not found' });
      }
      // Already set (e.g. from another device): hand back the stored one rather than changing it
      if (existing.rows[0].birth_date !== birthDate) {
        return res.status(403).json({
          success: false,
          error: `Your date of birth is already set and can't be changed. Contact ${SUPPORT_EMAIL} if it is wrong.`
        });
      }
      rows.push(existing.rows[0]);
    }
    res.json({ success: true, token: signToken(rows[0]), user: toPublicUser(rows[0]) });
  } catch (err) {
    console.error('Birth Date Error:', err);
    res.status(500).json({ success: false, error: 'Server error saving your date of birth' });
  }
};

// Registered accounts (they have a password), found by email in any letter case
async function findPasswordAccount(email) {
  if (typeof email !== 'string' || !email.trim()) return null;
  const { rows } = await db.query(
    'SELECT * FROM users WHERE LOWER(email) = LOWER($1) AND password_hash IS NOT NULL',
    [email.trim()]
  );
  return rows[0] || null;
}

/**
 * POST /api/auth/verify-email  { email, code }
 * A correct code activates the account (a pending guest becomes a full account), pays the sign-up
 * bonus once (never to accounts that already received it) and signs the person in.
 */
exports.verifyEmail = async (req, res) => {
  try {
    const user = await findPasswordAccount(req.body?.email);
    if (!user) {
      return res.status(400).json({ success: false, error: 'This code has expired. Ask for a new one.' });
    }
    if (user.email_verified_at) {
      return res.status(400).json({ success: false, error: 'This email is already verified. Sign in instead.' });
    }

    await verification.checkCode(user, req.body?.code);

    const { rows } = await db.query(
      `WITH prior AS (
         SELECT EXISTS (
           SELECT 1 FROM token_transactions WHERE user_id = $1 AND transaction_type = 'SIGNUP_BONUS'
         ) AS paid
       ), u AS (
         UPDATE users
         SET is_guest = FALSE, is_verified = TRUE, email_verified_at = NOW(),
             verification_code_hash = NULL, verification_expires_at = NULL, verification_attempts = 0,
             vibe_balance = vibe_balance + CASE WHEN (SELECT paid FROM prior) THEN 0 ELSE $2 END
         WHERE id = $1 AND email_verified_at IS NULL
         RETURNING ${USER_COLUMNS}, NOT (SELECT paid FROM prior) AS bonus_paid
       ), bonus AS (
         INSERT INTO token_transactions (user_id, amount, transaction_type)
         SELECT id, $2, 'SIGNUP_BONUS' FROM u WHERE bonus_paid
       )
       SELECT * FROM u`,
      [user.id, REWARDS.SIGNUP]
    );
    const verified = rows[0];
    if (!verified) {
      return res.status(400).json({ success: false, error: 'This email is already verified. Sign in instead.' });
    }

    res.json({
      success: true,
      token: signToken(verified),
      user: toPublicUser(verified),
      bonus: verified.bonus_paid ? REWARDS.SIGNUP : 0,
      upgraded: Boolean(user.is_guest)
    });
  } catch (err) {
    if (err instanceof verification.VerificationError) {
      return res.status(err.status).json({ success: false, error: err.message, ...err.details });
    }
    console.error('Verify Email Error:', err);
    res.status(500).json({ success: false, error: 'Server error verifying your email' });
  }
};

/**
 * POST /api/auth/resend-code  { email }
 * The reply is the same whether or not the email is waiting for verification.
 */
exports.resendCode = async (req, res) => {
  try {
    const user = await findPasswordAccount(req.body?.email);
    if (user && !user.email_verified_at) {
      await verification.sendCode(user);
    }
    res.json({ success: true });
  } catch (err) {
    if (err instanceof verification.VerificationError) {
      return res.status(err.status).json({ success: false, error: err.message, ...err.details });
    }
    console.error('Resend Code Error:', err.message);
    res.status(502).json({ success: false, error: "We couldn't send the code right now. Please try again shortly." });
  }
};

/**
 * POST /api/auth/forgot-password  { email }
 * Emails a password reset code. The reply is the same whether or not an account uses the email.
 */
exports.forgotPassword = async (req, res) => {
  try {
    const user = await findPasswordAccount(req.body?.email);
    if (user) await verification.sendCode(user, 'reset');
    res.json({ success: true });
  } catch (err) {
    // Inside the resend cooldown the earlier code still works; answering differently would reveal the account
    if (err instanceof verification.VerificationError) return res.json({ success: true });
    console.error('Forgot Password Error:', err.message);
    res.status(502).json({ success: false, error: "We couldn't send the code right now. Please try again shortly." });
  }
};

/**
 * POST /api/auth/reset-password  { email, code, password }
 * A correct code sets the new password and signs the person in. Getting the code proves they own
 * the inbox, so an account still waiting for email verification is verified too (with the sign-up
 * bonus it was waiting for, never twice).
 */
exports.resetPassword = async (req, res) => {
  const passwordError = checkPassword(req.body?.password);
  if (passwordError) {
    return res.status(400).json({ success: false, error: passwordError });
  }

  try {
    const user = await findPasswordAccount(req.body?.email);
    if (!user) {
      return res.status(400).json({ success: false, error: 'This code has expired. Ask for a new one.' });
    }
    await verification.checkCode(user, req.body?.code, 'reset');

    const passwordHash = await bcrypt.hash(req.body.password, await bcrypt.genSalt(10));
    const { rows } = await db.query(
      `WITH prior AS (
         SELECT (u.email_verified_at IS NOT NULL OR EXISTS (
           SELECT 1 FROM token_transactions WHERE user_id = $1 AND transaction_type = 'SIGNUP_BONUS'
         )) AS skip_bonus
         FROM users u WHERE u.id = $1
       ), u AS (
         UPDATE users
         SET password_hash = $3, reset_code_hash = NULL, reset_expires_at = NULL, reset_attempts = 0,
             is_guest = FALSE, is_verified = TRUE, email_verified_at = COALESCE(email_verified_at, NOW()),
             verification_code_hash = NULL, verification_expires_at = NULL, verification_attempts = 0,
             vibe_balance = vibe_balance + CASE WHEN (SELECT skip_bonus FROM prior) THEN 0 ELSE $2 END
         WHERE id = $1 AND reset_code_hash = $4
         RETURNING ${USER_COLUMNS}, NOT (SELECT skip_bonus FROM prior) AS bonus_paid
       ), bonus AS (
         INSERT INTO token_transactions (user_id, amount, transaction_type)
         SELECT id, $2, 'SIGNUP_BONUS' FROM u WHERE bonus_paid
       )
       SELECT * FROM u`,
      [user.id, REWARDS.SIGNUP, passwordHash, user.reset_code_hash]
    );
    // The same code was just used by another request
    const updated = rows[0];
    if (!updated) {
      return res.status(400).json({ success: false, error: 'This code has expired. Ask for a new one.' });
    }

    res.json({
      success: true,
      token: signToken(updated),
      user: toPublicUser(updated),
      bonus: updated.bonus_paid ? REWARDS.SIGNUP : 0
    });
  } catch (err) {
    if (err instanceof verification.VerificationError) {
      return res.status(err.status).json({ success: false, error: err.message, ...err.details });
    }
    console.error('Reset Password Error:', err);
    res.status(500).json({ success: false, error: 'Server error resetting your password' });
  }
};
