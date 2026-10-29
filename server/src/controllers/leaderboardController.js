const leaderboard = require('../services/leaderboard');

/**
 * GET /api/leaderboard?period=week|all
 * Most-liked verified accounts. Signed-in viewers also get their own place (`me`), if they have one.
 */
exports.get = async (req, res) => {
  const period = req.query.period === 'all' ? 'all' : 'week';
  try {
    const board = await leaderboard.getLeaderboard(period, req.user?.isGuest ? null : req.user?.id);
    res.json({ success: true, period, ...board });
  } catch (err) {
    console.error('Leaderboard Error:', err);
    res.status(500).json({ success: false, error: 'Server error loading the leaderboard' });
  }
};
