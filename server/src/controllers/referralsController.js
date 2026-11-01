const referrals = require('../services/referrals');
const { REFERRAL } = require('../config/economy');

/**
 * GET /api/referrals
 * The invite rewards, plus (for registered accounts) your invite code and how your invites are doing.
 */
exports.get = async (req, res) => {
  const rewards = {
    inviter: REFERRAL.INVITER,
    invitee: REFERRAL.INVITEE,
    qualifyMinutes: REFERRAL.QUALIFY_CALL_SECONDS / 60,
    monthlyCap: REFERRAL.MONTHLY_CAP
  };
  if (!req.user || req.user.isGuest) {
    return res.json({ success: true, rewards, code: null });
  }
  try {
    const [code, stats] = await Promise.all([referrals.getOrCreateCode(req.user.id), referrals.getStats(req.user.id)]);
    res.json({ success: true, rewards, code, ...stats });
  } catch (err) {
    console.error('Referrals Error:', err);
    res.status(500).json({ success: false, error: 'Server error loading your invites' });
  }
};
