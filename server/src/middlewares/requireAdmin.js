const db = require('../config/db');

/**
 * Must run after the auth middleware. Admin status is read from the database on
 * every request (not from the token) so revoking it takes effect immediately.
 */
module.exports = async (req, res, next) => {
  try {
    const { rows } = await db.query('SELECT is_admin FROM users WHERE id = $1', [req.user.id]);
    if (!rows[0]?.is_admin) {
      return res.status(403).json({ success: false, error: 'Admin access required' });
    }
    next();
  } catch (err) {
    console.error('Admin Check Error:', err);
    res.status(500).json({ success: false, error: 'Server error checking permissions' });
  }
};
