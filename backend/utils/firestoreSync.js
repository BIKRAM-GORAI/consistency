const admin = require('../config/firebase');
const User = require('../models/User');

/**
 * Reads a user's friends list from MongoDB and updates the corresponding
 * Firestore document in the `/friendships` collection.
 * @param {string|ObjectId} userId - The ID of the user to sync
 */
async function syncFriendsToFirestore(userId) {
  try {
    const user = await User.findById(userId);
    if (!user) {
      console.warn(`[FirestoreSync] User not found: ${userId}`);
      return;
    }

    const db = admin.firestore();
    const friendsArray = (user.friends || []).map(id => String(id));

    await db.collection('friendships').doc(String(userId)).set({
      friends: friendsArray,
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    });

    console.log(`[FirestoreSync] Synced ${friendsArray.length} friends for user ${userId} (${user.username})`);
  } catch (err) {
    console.error(`[FirestoreSync] Failed to sync friendships for user ${userId}:`, err);
  }
}

/**
 * Cleans up a user's social relationships (friends, requests) in MongoDB and Firestore,
 * and marks all their DMs as deleted on their side in Firestore before account deletion.
 * @param {string|ObjectId} userId - The ID of the user being deleted
 */
async function cleanupUserSocialData(userId) {
  try {
    const user = await User.findById(userId);
    if (!user) return;

    const db = admin.firestore();
    const now = Date.now();

    // 1. Gather all connected user IDs (friends, received requests, sent requests)
    const connectedUserIds = [
      ...new Set([
        ...(user.friends || []),
        ...(user.friendRequests || []),
        ...(user.sentRequests || [])
      ].map(id => String(id)))
    ];

    // 2. Remove this user from all other users' friends, requests, and sent requests lists in MongoDB
    await User.updateMany(
      { _id: { $in: connectedUserIds } },
      {
        $pull: {
          friends: user._id,
          friendRequests: user._id,
          sentRequests: user._id
        }
      }
    );

    // 3. Delete the user's friendships document in Firestore
    await db.collection('friendships').doc(String(userId)).delete();

    // 4. Update and sync Firestore friendships for all connected users
    for (const connectedId of connectedUserIds) {
      await syncFriendsToFirestore(connectedId);
    }

    // 5. Mark DMs as deleted on this user's side in Firestore
    const getChatId = (uid1, uid2) => {
      const s1 = String(uid1);
      const s2 = String(uid2);
      return s1 < s2 ? `${s1}_${s2}` : `${s2}_${s1}`;
    };

    for (const connectedId of connectedUserIds) {
      const chatId = getChatId(userId, connectedId);
      try {
        await db.collection('direct_messages')
          .doc(chatId)
          .collection('messages')
          .doc('metadata')
          .set({
            deletedAt: {
              [String(userId)]: now
            }
          }, { merge: true });
        console.log(`[FirestoreSync] Marked DM ${chatId} as deleted for user ${userId}`);
      } catch (dmErr) {
        console.error(`[FirestoreSync] Failed to mark DM ${chatId} as deleted:`, dmErr);
      }
    }

    console.log(`[FirestoreSync] Social cleanup completed successfully for user ${userId}`);
  } catch (err) {
    console.error(`[FirestoreSync] Social cleanup failed for user ${userId}:`, err);
  }
}

module.exports = {
  syncFriendsToFirestore,
  cleanupUserSocialData
};
