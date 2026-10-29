const db = require('../config/db');

// Weeks run Monday 00:00 to Sunday 23:59, India time
const WEEK_TIME_ZONE = 'Asia/Kolkata';
const LEADERBOARD_SIZE = 50;
const CHAMPION_COUNT = 3;
const CHAMPIONS_REFRESH_MS = 10 * 60 * 1000;

// Only verified accounts that are not suspended appear
const ELIGIBLE = `u.is_guest = FALSE AND u.email_verified_at IS NOT NULL
  AND (u.banned_until IS NULL OR u.banned_until < NOW())`;

const WEEK_START = `(date_trunc('week', NOW() AT TIME ZONE '${WEEK_TIME_ZONE}') AT TIME ZONE '${WEEK_TIME_ZONE}')`;

// Likes per user for a period: all time reads the lifetime counter, a week counts logged likes
const SCORES = {
  all: `SELECT u.id, u.likes_received AS likes FROM users u WHERE ${ELIGIBLE} AND u.likes_received > 0`,
  week: `SELECT u.id, COUNT(*)::int AS likes
         FROM like_events l JOIN users u ON u.id = l.liked_id
         WHERE ${ELIGIBLE} AND l.created_at >= ${WEEK_START}
         GROUP BY u.id`
};

/**
 * Top LEADERBOARD_SIZE for 'week' or 'all', plus the viewer's own place when they have one.
 * Ties share a rank; within a tie, older accounts come first.
 */
async function getLeaderboard(period, viewerId) {
  const { rows } = await db.query(
    `WITH scores AS (${SCORES[period]}),
     ranked AS (
       SELECT s.id, s.likes, RANK() OVER (ORDER BY s.likes DESC) AS rank,
              ROW_NUMBER() OVER (ORDER BY s.likes DESC, u.created_at, u.id) AS position
       FROM scores s JOIN users u ON u.id = s.id
     )
     SELECT r.id, r.likes, r.rank, r.position, u.username, u.country_code, u.avatar_key
     FROM ranked r JOIN users u ON u.id = r.id
     WHERE r.position <= $1 OR r.id = $2
     ORDER BY r.position`,
    [LEADERBOARD_SIZE, viewerId || null]
  );

  const toEntry = (row) => ({
    id: String(row.id),
    rank: Number(row.rank),
    username: row.username,
    country: row.country_code,
    avatarKey: row.avatar_key || null,
    likes: Number(row.likes)
  });

  const me = rows.find((row) => viewerId && String(row.id) === String(viewerId));
  return {
    entries: rows.filter((row) => Number(row.position) <= LEADERBOARD_SIZE).map(toEntry),
    me: me ? toEntry(me) : null,
    ...(period === 'week' && { resetsAt: await nextWeekStart() })
  };
}

async function nextWeekStart() {
  const { rows } = await db.query(`SELECT ${WEEK_START} + INTERVAL '7 days' AS next`);
  return rows[0].next;
}

/**
 * Last completed week's top CHAMPION_COUNT, as a Map of userId -> place (1-3).
 * Cached: it only changes once a week, and matchmaking reads it on every pairing.
 */
let champions = new Map();
let championsLoadedAt = 0;
let championsLoading = null;

async function loadChampions() {
  const { rows } = await db.query(
    `SELECT u.id, COUNT(*)::int AS likes
     FROM like_events l JOIN users u ON u.id = l.liked_id
     WHERE ${ELIGIBLE}
       AND l.created_at >= ${WEEK_START} - INTERVAL '7 days' AND l.created_at < ${WEEK_START}
     GROUP BY u.id
     ORDER BY likes DESC, MIN(u.created_at), u.id
     LIMIT $1`,
    [CHAMPION_COUNT]
  );
  champions = new Map(rows.map((row, i) => [String(row.id), i + 1]));
  championsLoadedAt = Date.now();
}

/**
 * Last week's place for a user (1-3), or null. Never waits on the database: a stale
 * cache triggers a background refresh and the previous answer is used meanwhile.
 */
function championPlace(userId) {
  if (Date.now() - championsLoadedAt > CHAMPIONS_REFRESH_MS && !championsLoading) {
    championsLoading = loadChampions()
      .catch((err) => console.error('[VibeLoop Leaderboard] champions refresh failed:', err.message))
      .finally(() => {
        championsLoading = null;
      });
  }
  return champions.get(String(userId)) || null;
}

module.exports = { getLeaderboard, championPlace, loadChampions, LEADERBOARD_SIZE };
