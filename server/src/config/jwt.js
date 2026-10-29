const jwt = require('jsonwebtoken');
const { isId } = require('./ids');
require('dotenv').config();

const JWT_SECRET = process.env.JWT_SECRET;

// Refuse to boot with a guessable secret: a missing env var must never fall back to a default
if (!JWT_SECRET) {
  throw new Error('[VibeLoop Auth] JWT_SECRET environment variable is not set');
}

/**
 * Issues a session token. Gender, country and birth date are embedded so the signaling
 * hot path can matchmake without a database lookup.
 */
function signToken(user) {
  return jwt.sign(
    {
      id: String(user.id),
      username: user.username,
      gender: user.gender || 'other',
      country: user.country_code || 'ALL',
      birthDate: user.birth_date || null,
      isGuest: Boolean(user.is_guest)
    },
    JWT_SECRET,
    { expiresIn: user.is_guest ? '30d' : '7d' }
  );
}

function verifyToken(token) {
  const claims = jwt.verify(token, JWT_SECRET);
  // Tokens issued before the switch to integer IDs carry a UUID: treat them as signed out
  if (!isId(claims.id)) {
    throw new jwt.JsonWebTokenError('outdated session');
  }
  return claims;
}

module.exports = { signToken, verifyToken };
