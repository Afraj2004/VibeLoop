const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const db = require('../config/db');
const { signToken } = require('../config/jwt');

const USER_COLUMNS = 'id, username, email, vibe_balance, gender, country_code, is_guest';

const GENDERS = ['male', 'female', 'other'];
const USERNAME_PATTERN = /^[a-zA-Z0-9_]{3,32}$/;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const COUNTRY_PATTERN = /^[A-Z]{2,3}$/;

function toPublicUser(user) {
  return {
    id: user.id,
    username: user.username,
    email: user.email,
    gender: user.gender,
    country: user.country_code,
    isGuest: user.is_guest,
    balance: user.vibe_balance
  };
}

function validateRegistration({ username, email, password, gender, country }) {
  if (!USERNAME_PATTERN.test(username || '')) {
    return 'Username must be 3-32 characters: letters, numbers or underscores';
  }
  if (!EMAIL_PATTERN.test(email || '') || email.length > 255) {
    return 'A valid email address is required';
  }
  if (typeof password !== 'string' || password.length < 8 || password.length > 128) {
    return 'Password must be 8-128 characters';
  }
  if (gender && !GENDERS.includes(gender)) {
    return 'Invalid gender';
  }
  if (country && !COUNTRY_PATTERN.test(country)) {
    return 'Invalid country code';
  }
  return null;
}

/**
 * POST /api/auth/guest
 * Instant, frictionless session: creates an anonymous user row so guests can
 * match, chat and hold a wallet before upgrading to a full account.
 */
exports.createGuest = async (req, res) => {
  try {
    const username = `guest_${crypto.randomBytes(4).toString('hex')}`;
    const result = await db.query(
      `INSERT INTO users (username, is_guest) VALUES ($1, TRUE) RETURNING ${USER_COLUMNS}`,
      [username]
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
 */
exports.register = async (req, res) => {
  const validationError = validateRegistration(req.body);
  if (validationError) {
    return res.status(400).json({ success: false, error: validationError });
  }

  const { username, email, password, gender, country } = req.body;

  try {
    // Check if user exists
    const userExists = await db.query(
      'SELECT id FROM users WHERE email = $1 OR username = $2',
      [email, username]
    );

    if (userExists.rows.length > 0) {
      return res.status(400).json({ success: false, error: 'User already exists' });
    }

    // Hash password
    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(password, salt);

    // Insert user
    const newUser = await db.query(
      `INSERT INTO users (username, email, password_hash, gender, country_code)
       VALUES ($1, $2, $3, $4, $5) RETURNING ${USER_COLUMNS}`,
      [username, email, passwordHash, gender || 'other', country || 'ALL']
    );

    const user = newUser.rows[0];

    res.status(201).json({ success: true, token: signToken(user), user: toPublicUser(user) });
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
