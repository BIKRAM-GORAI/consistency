const friendshipsCache = new Map();
const CACHE_TTL_MS = 15 * 60 * 1000; // 15 minutes TTL
const MAX_CACHE_SIZE = 1000; // Maximum items in memory

function getChatKey(uid1, uid2) {
  const s1 = String(uid1);
  const s2 = String(uid2);
  return s1 < s2 ? `${s1}_${s2}` : `${s2}_${s1}`;
}

function pruneCacheIfNeeded() {
  if (friendshipsCache.size >= MAX_CACHE_SIZE) {
    // Evict oldest entry (first item in Map iterator)
    const oldestKey = friendshipsCache.keys().next().value;
    if (oldestKey) friendshipsCache.delete(oldestKey);
  }
}

/**
 * Checks friendship status in the memory cache. If miss or expired, queries MongoDB and stores result.
 * @param {string} uid1 User ID 1
 * @param {string} uid2 User ID 2
 * @param {object} User Mongoose User Model
 * @returns {Promise<boolean>}
 */
async function isFriendsCached(uid1, uid2, User) {
  const key = getChatKey(uid1, uid2);
  const cached = friendshipsCache.get(key);

  if (cached) {
    if (Date.now() < cached.expiresAt) {
      return cached.isFriend;
    }
    // Expired
    friendshipsCache.delete(key);
  }

  try {
    const user = await User.findById(uid1);
    if (!user) {
      return false;
    }
    const isFriend = user.friends.map(String).includes(String(uid2));
    pruneCacheIfNeeded();
    friendshipsCache.set(key, { isFriend, expiresAt: Date.now() + CACHE_TTL_MS });
    return isFriend;
  } catch (err) {
    console.error(`[FriendshipCache] Error fetching relationship for ${key}:`, err);
    return false;
  }
}

/**
 * Manually sets friendship status in memory cache with TTL.
 * @param {string} uid1 User ID 1
 * @param {string} uid2 User ID 2
 * @param {boolean} isFriend Friendship status
 */
function setFriendshipCache(uid1, uid2, isFriend) {
  const key = getChatKey(uid1, uid2);
  pruneCacheIfNeeded();
  friendshipsCache.set(key, { isFriend, expiresAt: Date.now() + CACHE_TTL_MS });
}

/**
 * Invalidates friendship status in memory cache.
 * @param {string} uid1 User ID 1
 * @param {string} uid2 User ID 2
 */
function invalidateFriendshipCache(uid1, uid2) {
  const key = getChatKey(uid1, uid2);
  friendshipsCache.delete(key);
}

// Background cleanup sweep every 5 minutes to prune expired entries
const cleanupTimer = setInterval(() => {
  const now = Date.now();
  for (const [k, v] of friendshipsCache.entries()) {
    if (v && v.expiresAt && now > v.expiresAt) {
      friendshipsCache.delete(k);
    }
  }
}, 5 * 60 * 1000);

if (cleanupTimer.unref) {
  cleanupTimer.unref(); // Prevent timer from keeping Node process alive in tests or CLI scripts
}

module.exports = {
  isFriendsCached,
  setFriendshipCache,
  invalidateFriendshipCache
};
