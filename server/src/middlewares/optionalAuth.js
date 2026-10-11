const { verifyToken } = require('../config/jwt');

/**
 * Like auth, but never rejects: sets req.user when a valid token is present
 * (e.g. so registering from a guest session can upgrade that guest in place)
 */
module.exports = (req, res, next) => {
  const token = req.header('Authorization')?.replace('Bearer ', '');
  if (token) {
    try {
      req.user = verifyToken(token);
    } catch {
      // Invalid or expired token: treat as anonymous
    }
  }
  next();
};
