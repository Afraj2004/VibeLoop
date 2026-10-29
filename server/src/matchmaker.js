// matchmaker.js
const redis = require('./config/redis');
const { FILTER_MIN_AGE, FILTER_MAX_AGE } = require('./config/age');

// Waiting users expire on their own if a server crash skips the disconnect cleanup
const USER_TTL_SECONDS = 2 * 60 * 60;

/**
 * Atomically finds a compatible waiting peer, or enqueues the requester if none exists.
 * Doing both in one script means two simultaneous searchers can never both end up waiting.
 *
 * A candidate is compatible only if the match is reciprocal: the candidate's own
 * gender/country/age filters must accept the requester as well, and neither user has
 * blocked the other (blocks:{userId} sets, see services/moderation.js). The matched peer is
 * removed from ALL four of its queues so it can never be handed out twice.
 *
 * VibeBoost: waiting boosted users are also kept in the small 'queue:boosted' set and are
 * offered first to every compatible searcher, ahead of the random sample.
 *
 * Ages: a max of FILTER_MAX_AGE means "and older". Users with no known age only pass open ranges.
 *
 * ARGV: mySocketId, myUserId, myGender, myCountry, targetGender, targetCountry, myBoosted ('1'/'0'),
 *       myAge (-1 if unknown), minAge, maxAge, filterMaxAge
 */
const FIND_OR_ENQUEUE_LUA = `
  local my_sid, my_uid, my_gender, my_country, t_gender, t_country, my_boosted =
    ARGV[1], ARGV[2], ARGV[3], ARGV[4], ARGV[5], ARGV[6], ARGV[7]
  local my_age, min_age, max_age, filter_max = tonumber(ARGV[8]), tonumber(ARGV[9]), tonumber(ARGV[10]), tonumber(ARGV[11])
  local filter_min = ${FILTER_MIN_AGE}

  -- Does an age range accept this age? Open ranges accept everyone, even unknown ages.
  local function age_ok(age, lo, hi)
    if lo <= filter_min and hi >= filter_max then return true end
    if age < 0 then return false end
    return age >= lo and (hi >= filter_max or age <= hi)
  end

  local function queues_for(gender, country)
    return {
      'queue:ALL:any',
      'queue:ALL:' .. gender,
      'queue:' .. country .. ':any',
      'queue:' .. country .. ':' .. gender,
    }
  end

  -- Exact country first, then fall back to all countries
  local search = { 'queue:' .. t_country .. ':' .. t_gender }
  if t_country ~= 'ALL' then
    table.insert(search, 'queue:ALL:' .. t_gender)
  end

  -- Returns the candidate's profile if the match is reciprocal and unblocked,
  -- 'stale' if its state hash expired, or nil
  local function check(sid)
    if sid == my_sid then return nil end
    if redis.call('EXISTS', 'user:' .. sid) == 0 then return 'stale' end
    local p = redis.call('HMGET', 'user:' .. sid, 'userId', 'gender', 'country', 'targetGender', 'targetCountry',
      'age', 'minAge', 'maxAge')
    local their_age = tonumber(p[6]) or -1
    local their_min = tonumber(p[7]) or filter_min
    local their_max = tonumber(p[8]) or filter_max
    if p[1] ~= my_uid
      and redis.call('SISMEMBER', 'blocks:' .. my_uid, p[1]) == 0
      and redis.call('SISMEMBER', 'blocks:' .. p[1], my_uid) == 0
      and (p[4] == 'any' or p[4] == my_gender)
      and (p[5] == 'ALL' or p[5] == my_country)
      and age_ok(their_age, min_age, max_age)
      and age_ok(my_age, their_min, their_max) then
      return p
    end
    return nil
  end

  local function take(sid, p)
    for _, k in ipairs(queues_for(p[2], p[3])) do
      redis.call('SREM', k, sid)
    end
    redis.call('SREM', 'queue:boosted', sid)
    return sid
  end

  -- 1. Boosted users waiting in one of my target queues get priority
  for _, sid in ipairs(redis.call('SMEMBERS', 'queue:boosted')) do
    local in_target = false
    for _, queue_key in ipairs(search) do
      if redis.call('SISMEMBER', queue_key, sid) == 1 then in_target = true end
    end
    if in_target then
      local p = check(sid)
      if p == 'stale' then
        redis.call('SREM', 'queue:boosted', sid)
      elseif p then
        return take(sid, p)
      end
    elseif redis.call('EXISTS', 'user:' .. sid) == 0 then
      redis.call('SREM', 'queue:boosted', sid)
    end
  end

  -- 2. Everyone else, from a random sample of each target queue
  for _, queue_key in ipairs(search) do
    if redis.call('SCARD', queue_key) > 0 then
      local candidates = redis.call('SRANDMEMBER', queue_key, 50)
      for _, sid in ipairs(candidates) do
        local p = check(sid)
        if p == 'stale' then
          -- State hash expired: drop the leftover entry
          redis.call('SREM', queue_key, sid)
        elseif p then
          return take(sid, p)
        end
      end
    end
  end

  for _, k in ipairs(queues_for(my_gender, my_country)) do
    redis.call('SADD', k, my_sid)
  end
  if my_boosted == '1' then
    redis.call('SADD', 'queue:boosted', my_sid)
  end
  return false
`;

redis.defineCommand('findOrEnqueue', {
  numberOfKeys: 0,
  lua: FIND_OR_ENQUEUE_LUA,
});

function queuesFor(gender, country) {
  return [
    'queue:ALL:any',
    `queue:ALL:${gender}`,
    `queue:${country}:any`,
    `queue:${country}:${gender}`,
  ];
}

/**
 * Normalises client-supplied filters to the values the queues understand
 */
function normalizePreferences({ targetGender, targetCountry, minAge, maxAge } = {}) {
  const gender = String(targetGender || 'any').toLowerCase();
  const country = String(targetCountry || 'ALL').toUpperCase();
  const clampAge = (value, fallback) => {
    const n = Math.round(Number(value));
    return Number.isFinite(n) ? Math.min(FILTER_MAX_AGE, Math.max(FILTER_MIN_AGE, n)) : fallback;
  };
  let min = clampAge(minAge, FILTER_MIN_AGE);
  let max = clampAge(maxAge, FILTER_MAX_AGE);
  if (min > max) [min, max] = [max, min];
  return {
    targetGender: ['any', 'male', 'female', 'other'].includes(gender) ? gender : 'any',
    targetCountry: /^[A-Z]{2,3}$/.test(country) ? country : 'ALL',
    minAge: min,
    maxAge: max,
  };
}

/**
 * Returns the matched peer's socket ID, or null if the user was placed in the waiting pool
 */
async function findOrEnqueue(socketId, userState) {
  const {
    userId, gender, country, targetGender, targetCountry, boosted = false,
    age = null, minAge = FILTER_MIN_AGE, maxAge = FILTER_MAX_AGE
  } = userState;
  const knownAge = Number.isInteger(age) ? age : -1;

  await redis
    .multi()
    .hset(`user:${socketId}`, {
      userId, gender, country, targetGender, targetCountry, hasBoost: boosted ? 1 : 0, age: knownAge, minAge, maxAge
    })
    .expire(`user:${socketId}`, USER_TTL_SECONDS)
    .exec();

  return redis.findOrEnqueue(
    socketId, userId, gender, country, targetGender, targetCountry, boosted ? '1' : '0',
    knownAge, minAge, maxAge, FILTER_MAX_AGE
  );
}

/**
 * Remove a socket from every matchmaking queue it could be in
 */
async function dequeueUser(socketId, { gender, country }) {
  const pipeline = redis.pipeline();
  queuesFor(gender, country).forEach((q) => pipeline.srem(q, socketId));
  pipeline.srem('queue:boosted', socketId);
  await pipeline.exec();
}

/**
 * Drop a socket's matchmaking state hash (a popped peer is already out of every queue)
 */
async function clearUserState(socketId) {
  await redis.del(`user:${socketId}`);
}

/**
 * Fully forget a socket: queues plus its state hash
 */
async function removeUser(socketId, userState) {
  await dequeueUser(socketId, userState);
  await clearUserState(socketId);
}

module.exports = {
  normalizePreferences,
  findOrEnqueue,
  dequeueUser,
  clearUserState,
  removeUser,
};
