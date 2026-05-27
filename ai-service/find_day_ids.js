require('dotenv').config({ path: '../.env' });
const mongoose = require('mongoose');
const connectDB = require('../backend/config/db');
const Day = require('../backend/models/Day');
const User = require('../backend/models/User');

async function findIds() {
  try {
    console.log('🔌 Connecting to MongoDB...');
    await connectDB();
    console.log('✅ Connected!');

    console.log('\n👤 Listing recent users in database:');
    const users = await User.find().limit(5);
    if (users.length === 0) {
      console.log('❌ No users found in database.');
      process.exit(0);
    }
    users.forEach(u => {
      console.log(`- Username: ${u.username || u.name} | ID: ${u._id} | Email: ${u.email}`);
    });

    console.log('\n📅 Listing recent Day cards recorded:');
    const days = await Day.find().sort({ date: -1 }).limit(10);
    if (days.length === 0) {
      console.log('❌ No daily task cards found in database.');
      process.exit(0);
    }
    days.forEach(d => {
      console.log(`- Date: ${d.date} | Mongo _id: ${d._id} | UserID: ${d.userId}`);
    });

    console.log('\n💡 Tip: Copy the Mongo _id for your desired date and paste it in Postman:');
    console.log('👉 POST http://localhost:5001/api/ai/weekly-summary/<Mongo_id>');

  } catch (err) {
    console.error('❌ Error listing database details:', err.message);
  } finally {
    mongoose.connection.close();
  }
}

findIds();
