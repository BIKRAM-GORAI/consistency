require('dotenv').config();
const connectDB = require('../config/db');
const User = require('../models/User');
const { syncFriendsToFirestore } = require('../utils/firestoreSync');

async function runMigration() {
  console.log('[Migration] Connecting to MongoDB...');
  await connectDB();
  
  console.log('[Migration] Fetching all users from MongoDB...');
  const users = await User.find({});
  console.log(`[Migration] Found ${users.length} users. Starting synchronization to Firestore...`);

  for (const user of users) {
    try {
      await syncFriendsToFirestore(user._id);
    } catch (e) {
      console.error(`[Migration] Failed to migrate user ${user._id}:`, e);
    }
  }

  console.log('[Migration] Friendship synchronization migration complete.');
  process.exit(0);
}

runMigration().catch(err => {
  console.error('[Migration] Migration failed with error:', err);
  process.exit(1);
});
