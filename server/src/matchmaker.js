// matchmaker.js
import Redis from 'ioredis';

export const redis = new Redis(process.env.REDIS_URL || 'redis://127.0.0.1:6379');

// Lua script to atomically pop a random socketId that is NOT the requesting user
const ATOMIC_POP_MATCH_LUA = `
  local queue_key = KEYS[1]
  local my_socket_id = ARGV[1]

  -- Get all members in the target queue
  local members = redis.call('SMEMBERS', queue_key)
  for _, peer_socket_id in ipairs(members) do
    if peer_socket_id ~= my_socket_id then
      -- Remove the found peer from the queue atomically
      redis.call('SREM', queue_key, peer_socket_id)
      return peer_socket_id
    end
  end
  return nil
`;

// Define a custom Redis command for the Lua script
redis.defineCommand('atomicPopMatch', {
  numberOfKeys: 1,
  lua: ATOMIC_POP_MATCH_LUA,
});

/**
 * Queue resolution key helper:
 * Supports routing by gender requirement and country filter.
 */
export function getQueueKey({ country = 'ALL', targetGender = 'any' }) {
  const c = country.toUpperCase();
  const g = targetGender.toLowerCase();
  return `queue:${c}:${g}`;
}

/**
 * Enqueue a socket into the waiting room
 */
export async function enqueueUser(socketId, userState) {
  const selfKey = `user:${socketId}`;
  await redis.hset(selfKey, {
    userId: userState.userId,
    gender: userState.gender,
    country: userState.country,
    targetGender: userState.targetGender || 'any',
    targetCountry: userState.targetCountry || 'ALL',
    inCallWith: '',
    connectedAt: 0,
  });

  // Determine what queue this user belongs to for others seeking them
  // e.g., if user is female from US, they are placed in `queue:US:female` and `queue:ALL:female`
  const queues = [
    `queue:ALL:any`,
    `queue:ALL:${userState.gender}`,
    `queue:${userState.country}:any`,
    `queue:${userState.country}:${userState.gender}`,
  ];

  const pipeline = redis.pipeline();
  queues.forEach((q) => pipeline.sadd(q, socketId));
  await pipeline.exec();
}

/**
 * Attempt to match a user with an active peer
 */
export async function findMatch(socketId, preferences) {
  const { targetCountry = 'ALL', targetGender = 'any' } = preferences;

  // 1. Try exact target match
  let targetQueue = getQueueKey({ country: targetCountry, targetGender });
  let matchedSocketId = await redis.atomicPopMatch(targetQueue, socketId);

  // 2. Fallback to ALL countries if specific country has no active peers
  if (!matchedSocketId && targetCountry !== 'ALL') {
    targetQueue = getQueueKey({ country: 'ALL', targetGender });
    matchedSocketId = await redis.atomicPopMatch(targetQueue, socketId);
  }

  // 3. If targetGender is specified but empty, do not fall back to 'any' (preserves paid gender filters)
  return matchedSocketId;
}

/**
 * Remove user from all matchmaking queues
 */
export async function dequeueUser(socketId, userState = {}) {
  const country = userState.country || 'US';
  const gender = userState.gender || 'male';

  const queues = [
    `queue:ALL:any`,
    `queue:ALL:${gender}`,
    `queue:${country}:any`,
    `queue:${country}:${gender}`,
  ];

  const pipeline = redis.pipeline();
  queues.forEach((q) => pipeline.srem(q, socketId));
  await pipeline.exec();
}