const admin = require('../config/firebase');
const User = require('../models/User');

/**
 * Reads a user's friends list from MongoDB and updates the corresponding
 * Firestore document in the `/friendships` collection.
 * @param {string|ObjectId} userId - The ID of the user to sync
 * @param {string|ObjectId} [deletingUserId] - The ID of the user currently being deleted (if any)
 */
async function syncFriendsToFirestore(userId, deletingUserId = null) {
  try {
    const user = await User.findById(userId);
    if (!user) {
      console.warn(`[FirestoreSync] User not found: ${userId}`);
      return;
    }

    const db = admin.firestore();
    const friendsArray = (user.friends || []).map(id => String(id));

    // Preserve read access to deleted accounts
    const docRef = db.collection('friendships').doc(String(userId));
    const docSnap = await docRef.get();
    if (docSnap.exists) {
      const existingFriends = docSnap.data().friends || [];
      for (const oldFriendId of existingFriends) {
        const oldFriendIdStr = String(oldFriendId);
        if (!friendsArray.includes(oldFriendIdStr)) {
          // Check if this friend is the one being deleted, or if they do not exist in MongoDB
          const isDeleted = (deletingUserId && oldFriendIdStr === String(deletingUserId)) || !(await User.exists({ _id: oldFriendIdStr }));
          if (isDeleted) {
            // Keep them in the Firestore friendships list to preserve read access to old chats
            friendsArray.push(oldFriendIdStr);
          }
        }
      }
    }

    await docRef.set({
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

    // 3. Clear (not delete) the user's friendships document in Firestore.
    // We keep the document existing with an empty friends array so that the Firestore
    // security rule `exists(/friendships/{uid})` continues to return true for the
    // other participant in any existing DM chat. Deleting the doc entirely would cause
    // `isFriend()` to fail for the remaining active user, blocking all DM sends.
    await db.collection('friendships').doc(String(userId)).set({
      friends: [],
      deletedAt: admin.firestore.FieldValue.serverTimestamp(),
      isDeleted: true
    });

    // 4. Update and sync Firestore friendships for all connected users
    for (const connectedId of connectedUserIds) {
      await syncFriendsToFirestore(connectedId, userId);
    }

    // 5. Mark DMs as deleted on this user's side in Firestore, and trigger hard deletion if both have deleted
    const getChatId = (uid1, uid2) => {
      const s1 = String(uid1);
      const s2 = String(uid2);
      return s1 < s2 ? `${s1}_${s2}` : `${s2}_${s1}`;
    };

    for (const connectedId of connectedUserIds) {
      const chatId = getChatId(userId, connectedId);
      try {
        const metaRef = db.collection('direct_messages')
          .doc(chatId)
          .collection('messages')
          .doc('metadata');

        await metaRef.set({
          deletedAt: {
            [String(userId)]: now
          }
        }, { merge: true });
        console.log(`[FirestoreSync] Marked DM ${chatId} as deleted for user ${userId}`);

        // Check if both users have cleared this chat to trigger hard deletion on the server
        const metaSnap = await metaRef.get();
        if (metaSnap.exists) {
          const metaData = metaSnap.data();
          const deletedAt = metaData.deletedAt || {};

          const userIds = chatId.split('_');
          const u1 = userIds[0];
          const u2 = userIds[1];

          if (deletedAt[u1] && deletedAt[u2]) {
            // Hard-delete messages and their media
            const msgsCol = db.collection('direct_messages').doc(chatId).collection('messages');
            const msgsSnap = await msgsCol.get();

            if (!msgsSnap.empty) {
              const mediaUrls = [];
              const batch = db.batch();

              msgsSnap.docs.forEach(doc => {
                if (doc.id === 'metadata') return;
                const msgData = doc.data();
                if (msgData.mediaUrl) {
                  mediaUrls.push(msgData.mediaUrl);
                }
                batch.delete(doc.ref);
              });

              // Delete media from Cloudinary
              if (mediaUrls.length > 0) {
                const { deleteFromCloudinary } = require('../config/cloudinary');
                for (const url of mediaUrls) {
                  await deleteFromCloudinary(url);
                }
              }

              // Commit Firestore delete batch
              await batch.commit();
              console.log(`[FirestoreSync] Hard-deleted ${msgsSnap.size - 1} messages and Cloudinary media for DM ${chatId}`);
            }
          }
        }
      } catch (dmErr) {
        console.error(`[FirestoreSync] Failed to mark/hard-delete DM ${chatId}:`, dmErr);
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
