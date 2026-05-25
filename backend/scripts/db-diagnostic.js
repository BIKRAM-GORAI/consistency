const mongoose = require('mongoose');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../../.env') });

const User = require('../models/User');

async function run() {
  console.log("Connecting to MongoDB at:", process.env.MONGO_URI);
  await mongoose.connect(process.env.MONGO_URI);
  console.log("Connected successfully!");

  const users = await User.find({}, 'name username email fcmTokens lastActiveAt');
  console.log(`Total users in DB: ${users.length}`);
  
  users.forEach(u => {
    console.log(`- User: ${u.name} (username: ${u.username || 'N/A'}, email: ${u.email})`);
    console.log(`  Last Active: ${u.lastActiveAt}`);
    console.log(`  FCM Tokens count: ${u.fcmTokens ? u.fcmTokens.length : 0}`);
    if (u.fcmTokens && u.fcmTokens.length > 0) {
      console.log(`  Tokens:`, u.fcmTokens);
    }
  });

  await mongoose.disconnect();
}

run().catch(err => {
  console.error(err);
  process.exit(1);
});
