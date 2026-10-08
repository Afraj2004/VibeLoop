const history = require('../services/history');

/**
 * GET /api/history
 * Recent contacts (calls of 20+ seconds), newest first, max 10
 */
exports.getHistory = async (req, res) => {
  try {
    const contacts = await history.getHistory(req.user.id);
    res.json({ success: true, contacts });
  } catch (err) {
    console.error('History Error:', err);
    res.status(500).json({ success: false, error: 'Server error fetching history' });
  }
};
