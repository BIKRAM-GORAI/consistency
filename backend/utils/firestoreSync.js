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

module.exports = {
  syncFriendsToFirestore
};
