// matchmaker.js
const redis = require('./config/redis');

// Waiting users expire on their own if a server crash skips the disconnect cleanup
const USER_TTL_SECONDS = 2 * 60 * 60;

/**
 * Atomically finds a compatible waiting peer, or enqueues the requester if none exists.
 * Doing both in one script means two simultaneous searchers can never both end up waiting.
 *
 * A candidate is compatible only if the match is reciprocal: the candidate's own
 * gender/country filters must accept the requester as well, and neither user has
 * blocked the other (blocks:{userId} sets, see services/moderation.js). The matched peer is
 * removed from ALL four of its queues so it can never be handed out twice.
 *
 * ARGV: mySocketId, myUserId, myGender, myCountry, targetGender, targetCountry
 */
const FIND_OR_ENQUEUE_LUA = `
  local my_sid, my_uid, my_gender, my_country, t_gender, t_country =
    ARGV[1], ARGV[2], ARGV[3], ARGV[4], ARGV[5], ARGV[6]

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

  for _, queue_key in ipairs(search) do
    if redis.call('SCARD', queue_key) > 0 then
      local candidates = redis.call('SRANDMEMBER', queue_key, 50)
      for _, sid in ipairs(candidates) do
        if sid ~= my_sid then
          if redis.call('EXISTS', 'user:' .. sid) == 0 then
            -- Stale entry whose state hash expired: drop it
            redis.call('SREM', queue_key, sid)
          else
            local p = redis.call('HMGET', 'user:' .. sid, 'userId', 'gender', 'country', 'targetGender', 'targetCountry')
            if p[1] ~= my_uid
              and redis.call('SISMEMBER', 'blocks:' .. my_uid, p[1]) == 0
              and redis.call('SISMEMBER', 'blocks:' .. p[1], my_uid) == 0
              and (p[4] == 'any' or p[4] == my_gender)
              and (p[5] == 'ALL' or p[5] == my_country) then
              for _, k in ipairs(queues_for(p[2], p[3])) do
                redis.call('SREM', k, sid)
              end
              return sid
            end
          end
        end
      end
    end
  end

  for _, k in ipairs(queues_for(my_gender, my_country)) do
    redis.call('SADD', k, my_sid)
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
function normalizePreferences({ targetGender, targetCountry } = {}) {
  const gender = String(targetGender || 'any').toLowerCase();
  const country = String(targetCountry || 'ALL').toUpperCase();
  return {
    targetGender: ['any', 'male', 'female', 'other'].includes(gender) ? gender : 'any',
    targetCountry: /^[A-Z]{2,3}$/.test(country) ? country : 'ALL',
  };
}

/**
 * Returns the matched peer's socket ID, or null if the user was placed in the waiting pool
 */
async function findOrEnqueue(socketId, userState) {
  const { userId, gender, country, targetGender, targetCountry } = userState;

  await redis
    .multi()
    .hset(`user:${socketId}`, { userId, gender, country, targetGender, targetCountry })
    .expire(`user:${socketId}`, USER_TTL_SECONDS)
    .exec();

  return redis.findOrEnqueue(socketId, userId, gender, country, targetGender, targetCountry);
}

/**
 * Remove a socket from every matchmaking queue it could be in
 */
async function dequeueUser(socketId, { gender, country }) {
  const pipeline = redis.pipeline();
  queuesFor(gender, country).forEach((q) => pipeline.srem(q, socketId));
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
