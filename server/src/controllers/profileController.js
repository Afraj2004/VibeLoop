const db = require('../config/db');
const { REWARDS } = require('../config/economy');
const { USER_COLUMNS, toPublicUser } = require('./authController');

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DATA_URL_PATTERN = /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/]+={0,2})$/;

// The client crops and resizes to 256px before upload, so real photos are well under this
const MAX_AVATAR_BYTES = 150 * 1024;

// The decoded bytes must really be the declared format, not just claim to be
const MAGIC = {
  'image/jpeg': (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff,
  'image/png': (b) => b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])),
  'image/webp': (b) => b.toString('ascii', 0, 4) === 'RIFF' && b.toString('ascii', 8, 12) === 'WEBP'
};

function parseImage(dataUrl) {
  const match = typeof dataUrl === 'string' && DATA_URL_PATTERN.exec(dataUrl);
  if (!match) return null;
  const [, type, base64] = match;
  const bytes = Buffer.from(base64, 'base64');
  if (bytes.length < 12 || !MAGIC[type](bytes)) return null;
  return { type, bytes };
}

/**
 * PUT /api/profile/avatar  { image: 'data:image/jpeg;base64,...' }
 * Registered accounts only. The first photo ever set earns REWARDS.PROFILE_PHOTO VIBE, credited in
 * the same statement as the photo and its ledger row, so replacing or re-adding a photo never pays twice.
 */
exports.setAvatar = async (req, res) => {
  if (req.user.isGuest) {
    return res.status(403).json({ success: false, error: 'Create an account to add a profile photo' });
  }

  const image = parseImage(req.body?.image);
  if (!image) {
    return res.status(400).json({ success: false, error: 'Upload a JPEG, PNG or WebP image' });
  }
  if (image.bytes.length > MAX_AVATAR_BYTES) {
    return res.status(413).json({ success: false, error: 'That photo is too large. Try a smaller one.' });
  }

  try {
    // NOW() is fixed for the statement, so the two timestamps are equal only when this upload earned the reward
    const { rows } = await db.query(
      `WITH u AS (
         UPDATE users
         SET avatar_url = $2,
             avatar_updated_at = NOW(),
             vibe_balance = vibe_balance + CASE WHEN avatar_rewarded_at IS NULL THEN $3 ELSE 0 END,
             avatar_rewarded_at = COALESCE(avatar_rewarded_at, NOW())
         WHERE id = $1 AND is_guest = FALSE
         RETURNING ${USER_COLUMNS}, avatar_rewarded_at = avatar_updated_at AS rewarded
       ), bonus AS (
         INSERT INTO token_transactions (user_id, amount, transaction_type)
         SELECT id, $3, 'PROFILE_PHOTO_BONUS' FROM u WHERE rewarded
       )
       SELECT * FROM u`,
      [req.user.id, `data:${image.type};base64,${image.bytes.toString('base64')}`, REWARDS.PROFILE_PHOTO]
    );
    const user = rows[0];
    if (!user) {
      return res.status(404).json({ success: false, error: 'User not found' });
    }

    res.json({
      success: true,
      user: toPublicUser(user),
      balance: Number(user.vibe_balance),
      reward: user.rewarded ? REWARDS.PROFILE_PHOTO : 0
    });
  } catch (err) {
    console.error('Avatar Upload Error:', err);
    res.status(500).json({ success: false, error: 'Server error saving your photo' });
  }
};

/**
 * DELETE /api/profile/avatar
 */
exports.removeAvatar = async (req, res) => {
  try {
    const { rows } = await db.query(
      `UPDATE users SET avatar_url = NULL, avatar_updated_at = NULL WHERE id = $1 RETURNING ${USER_COLUMNS}`,
      [req.user.id]
    );
    if (!rows[0]) {
      return res.status(404).json({ success: false, error: 'User not found' });
    }
    res.json({ success: true, user: toPublicUser(rows[0]) });
  } catch (err) {
    console.error('Avatar Remove Error:', err);
    res.status(500).json({ success: false, error: 'Server error removing your photo' });
  }
};

/**
 * GET /api/users/:id/avatar?v=<avatarVersion>
 * Public image response. URLs carry the version, so they can be cached forever.
 */
exports.getAvatar = async (req, res) => {
  if (!UUID_PATTERN.test(req.params.id)) {
    return res.status(404).json({ success: false, error: 'Not found' });
  }

  try {
    const { rows } = await db.query('SELECT avatar_url FROM users WHERE id = $1', [req.params.id]);
    const image = parseImage(rows[0]?.avatar_url);
    if (!image) {
      return res.status(404).json({ success: false, error: 'Not found' });
    }

    res.set({
      'Content-Type': image.type,
      'Cache-Control': req.query.v ? 'public, max-age=31536000, immutable' : 'public, max-age=300',
      'X-Content-Type-Options': 'nosniff',
      // Served from the API origin but embedded by the web app
      'Cross-Origin-Resource-Policy': 'cross-origin'
    });
    res.send(image.bytes);
  } catch (err) {
    console.error('Avatar Fetch Error:', err);
    res.status(500).json({ success: false, error: 'Server error fetching photo' });
  }
};
