const jwt = require('jsonwebtoken');
require('dotenv').config();

const JWT_SECRET = process.env.JWT_SECRET;

// Refuse to boot with a guessable secret: a missing env var must never fall back to a default
if (!JWT_SECRET) {
  throw new Error('[VibeLoop Auth] JWT_SECRET environment variable is not set');
}

/**
 * Issues a session token. Gender and country are embedded so the signaling
 * hot path can matchmake without a database lookup.
 */
function signToken(user) {
  return jwt.sign(
    {
      id: user.id,
      username: user.username,
      gender: user.gender || 'other',
      country: user.country_code || 'ALL',
      isGuest: Boolean(user.is_guest)
    },
    JWT_SECRET,
    { expiresIn: user.is_guest ? '30d' : '7d' }
  );
}

function verifyToken(token) {
  return jwt.verify(token, JWT_SECRET);
}

module.exports = { signToken, verifyToken };
