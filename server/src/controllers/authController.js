const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const db = require('../config/db');
const { signToken } = require('../config/jwt');
const { REWARDS } = require('../config/economy');
const { countryFromLocation } = require('../services/geo');

const USER_COLUMNS = 'id, username, email, vibe_balance, gender, country_code, is_guest, avatar_updated_at, avatar_rewarded_at, likes_received';

const GENDERS = ['male', 'female', 'other'];
const USERNAME_PATTERN = /^[a-zA-Z0-9_]{3,32}$/;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const COUNTRY_PATTERN = /^[A-Z]{2,3}$/;

// Bump when the Terms / Community Guidelines change; stored with each acceptance
const TERMS_VERSION = '2026-10-11';
const CONSENT_ERROR = 'You must confirm you are 18 or older and accept the Terms to use VibeLoop';

const LOCATION_REQUIRED = 'Allow location access so we can set your country';
const LOCATION_UNKNOWN = "We couldn't work out your country from your location. Please try again.";

const hasConsent = (body) => body?.ageConfirmed === true && body?.termsAccepted === true;

function toPublicUser(user) {
  return {
    id: user.id,
    username: user.username,
    email: user.email,
    gender: user.gender,
    country: user.country_code,
    isGuest: user.is_guest,
    balance: user.vibe_balance,
    // Cache-busting version for GET /api/users/:id/avatar; null when there is no photo
    avatarVersion: user.avatar_updated_at ? new Date(user.avatar_updated_at).getTime() : null,
    photoRewardClaimed: Boolean(user.avatar_rewarded_at),
    likes: Number(user.likes_received || 0)
  };
}

function validateRegistration({ username, email, password, gender }) {
  if (!USERNAME_PATTERN.test(username || '')) {
    return 'Username must be 3-32 characters: letters, numbers or underscores';
  }
  if (!EMAIL_PATTERN.test(email || '') || email.length > 255) {
    return 'A valid email address is required';
  }
  if (typeof password !== 'string' || password.length < 8 || password.length > 128) {
    return 'Password must be 8-128 characters';
  }
  // Required: it is locked once the account exists (see updateProfile)
  if (!GENDERS.includes(gender)) {
    return 'Choose your gender';
  }
  return null;
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

  try {
    const username = `guest_${crypto.randomBytes(4).toString('hex')}`;
    const result = await db.query(
      `INSERT INTO users (username, is_guest, age_confirmed_at, terms_accepted_at, terms_version, vibe_balance)
       VALUES ($1, TRUE, NOW(), NOW(), $2, 0) RETURNING ${USER_COLUMNS}`,
      [username, TERMS_VERSION]
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
 * Called from a guest session (Authorization header), the guest row itself is upgraded,
 * so the VIBE balance, history, contacts and blocks carry over to the new account.
 * Either way the account is credited the one-off sign-up bonus, in the same statement as its ledger row.
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
  const { username, email, password, gender } = req.body;
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
      'SELECT id FROM users WHERE (email = $1 OR username = $2) AND id IS DISTINCT FROM $3',
      [email, username, guestId]
    );

    if (userExists.rows.length > 0) {
      return res.status(400).json({ success: false, error: 'User already exists' });
    }

    // Hash password
    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(password, salt);

    if (guestId) {
      const upgraded = await db.query(
        `WITH u AS (
           UPDATE users
           SET username = $2, email = $3, password_hash = $4, gender = $5, country_code = $6,
               is_guest = FALSE, age_confirmed_at = NOW(), terms_accepted_at = NOW(), terms_version = $7,
               vibe_balance = vibe_balance + $8
           WHERE id = $1 AND is_guest = TRUE
           RETURNING ${USER_COLUMNS}
         ), bonus AS (
           INSERT INTO token_transactions (user_id, amount, transaction_type)
           SELECT id, $8, 'SIGNUP_BONUS' FROM u
         )
         SELECT * FROM u`,
        [guestId, username, email, passwordHash, gender, country, TERMS_VERSION, REWARDS.SIGNUP]
      );

      // Falls through to a fresh account if the guest row no longer exists
      if (upgraded.rows[0]) {
        const user = upgraded.rows[0];
        return res.status(201).json({
          success: true, upgraded: true, token: signToken(user), user: toPublicUser(user), bonus: REWARDS.SIGNUP
        });
      }
    }

    // Insert user
    const newUser = await db.query(
      `WITH u AS (
         INSERT INTO users (username, email, password_hash, gender, country_code,
                            age_confirmed_at, terms_accepted_at, terms_version, vibe_balance)
         VALUES ($1, $2, $3, $4, $5, NOW(), NOW(), $6, $7) RETURNING ${USER_COLUMNS}
       ), bonus AS (
         INSERT INTO token_transactions (user_id, amount, transaction_type)
         SELECT id, $7, 'SIGNUP_BONUS' FROM u
       )
       SELECT * FROM u`,
      [username, email, passwordHash, gender, country, TERMS_VERSION, REWARDS.SIGNUP]
    );

    const user = newUser.rows[0];

    res.status(201).json({ success: true, token: signToken(user), user: toPublicUser(user), bonus: REWARDS.SIGNUP });
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
    const result = await db.query('SELECT * FROM users WHERE email = $1', [email]);
    const user = result.rows[0];

    // Guest rows have no password hash and can never log in with credentials
    if (!user || !user.password_hash) {
      return res.status(400).json({ success: false, error: 'Invalid credentials' });
    }

    const isMatch = await bcrypt.compare(password, user.password_hash);
    if (!isMatch) {
      return res.status(400).json({ success: false, error: 'Invalid credentials' });
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
        error: 'Your gender was set when you signed up and cannot be changed. Contact support@vibeloop.com if it is wrong.'
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
    res.json({ success: true, user: toPublicUser(result.rows[0]) });
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
