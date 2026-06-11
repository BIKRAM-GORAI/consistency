const friendshipsCache = new Map();

function getChatKey(uid1, uid2) {
  const s1 = String(uid1);
  const s2 = String(uid2);
  return s1 < s2 ? `${s1}_${s2}` : `${s2}_${s1}`;
}

/**
 * Checks friendship status in the memory cache. If miss, queries MongoDB and stores result.
 * @param {string} uid1 User ID 1
 * @param {string} uid2 User ID 2
 * @param {object} User Mongoose User Model
 * @returns {Promise<boolean>}
 */
async function isFriendsCached(uid1, uid2, User) {
  const key = getChatKey(uid1, uid2);
  if (friendshipsCache.has(key)) {
    return friendshipsCache.get(key);
  }

  try {
    const user = await User.findById(uid1);
    if (!user) {
      return false;
    }
    const isFriend = user.friends.map(String).includes(String(uid2));
    friendshipsCache.set(key, isFriend);
    return isFriend;
  } catch (err) {
    console.error(`[FriendshipCache] Error fetching relationship for ${key}:`, err);
    return false;
  }
}

/**
 * Manually sets friendship status in memory cache.
 * @param {string} uid1 User ID 1
 * @param {string} uid2 User ID 2
 * @param {boolean} isFriend Friendship status
 */
function setFriendshipCache(uid1, uid2, isFriend) {
  const key = getChatKey(uid1, uid2);
  friendshipsCache.set(key, isFriend);
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

module.exports = {
  isFriendsCached,
  setFriendshipCache,
  invalidateFriendshipCache
};
