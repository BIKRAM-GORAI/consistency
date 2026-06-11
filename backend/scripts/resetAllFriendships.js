/**
 * resetAllFriendships.js
 *
 * Wipes ALL friendship/social data from MongoDB and Firestore so the
 * system can start fresh. This includes:
 *  - MongoDB: friends, friendRequests, sentRequests arrays on all users
 *  - Firestore: ALL documents in /friendships collection
 *  - Firestore: ALL documents in /direct_messages collection (metadata + messages)
 *
 * Usage:
 *   node backend/scripts/resetAllFriendships.js
 */

require('dotenv').config();

const mongoose = require('mongoose');
const admin = require('../config/firebase');

const User = require('../models/User');

async function deleteFirestoreCollection(db, collectionRef, batchSize = 50) {
  const query = collectionRef.limit(batchSize);
  let deleted = 0;

  while (true) {
    const snapshot = await query.get();
    if (snapshot.size === 0) break;

    const batch = db.batch();
    snapshot.docs.forEach(doc => batch.delete(doc.ref));
    await batch.commit();
    deleted += snapshot.size;
    console.log(`  Deleted ${deleted} docs from ${collectionRef.path}...`);
  }

  return deleted;
}

async function deleteSubcollections(db, parentDoc) {
  const collections = await parentDoc.listCollections();
  for (const col of collections) {
    const docs = await col.get();
    const batch = db.batch();
    docs.forEach(d => batch.delete(d.ref));
    if (!docs.empty) await batch.commit();
  }
}

async function main() {
  console.log('=== FRIENDSHIP RESET SCRIPT ===\n');

  // 1. Connect to MongoDB
  console.log('[1/4] Connecting to MongoDB...');
  await mongoose.connect(process.env.MONGO_URI);
  console.log('      Connected.\n');

  // 2. Reset MongoDB user social fields
  console.log('[2/4] Resetting MongoDB friendship arrays for ALL users...');
  const result = await User.updateMany(
    {},
    { $set: { friends: [], friendRequests: [], sentRequests: [] } }
  );
  console.log(`      Done. Modified ${result.modifiedCount} user documents.\n`);

  // 3. Wipe Firestore /friendships collection
  const db = admin.firestore();

  console.log('[3/4] Wiping Firestore /friendships collection...');
  const friendshipsRef = db.collection('friendships');
  const totalFriendships = await deleteFirestoreCollection(db, friendshipsRef);
  console.log(`      Done. Deleted ${totalFriendships} total friendship docs.\n`);

  // 4. Wipe Firestore /direct_messages collection (including subcollections)
  console.log('[4/4] Wiping Firestore /direct_messages collection...');
  const dmRef = db.collection('direct_messages');
  const dmDocs = await dmRef.get();

  let totalDmDocs = 0;
  for (const dmDoc of dmDocs.docs) {
    // Delete all subcollections (e.g. /messages)
    await deleteSubcollections(db, dmDoc.ref);
    await dmDoc.ref.delete();
    totalDmDocs++;
    console.log(`  Deleted DM conversation: ${dmDoc.id}`);
  }
  console.log(`      Done. Deleted ${totalDmDocs} DM conversation documents.\n`);

  console.log('=== RESET COMPLETE ===');
  console.log('All friendships, friend requests, and DM histories have been wiped.');
  console.log('Users will need to re-connect from scratch.\n');

  await mongoose.disconnect();
  process.exit(0);
}

main().catch(err => {
  console.error('Script failed:', err);
  process.exit(1);
});
