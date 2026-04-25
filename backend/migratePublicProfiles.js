require('dotenv').config();
const mongoose = require('mongoose');
const User = require('./models/User');

async function migrate() {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    console.log('Connected to MongoDB');
    
    // Add isPublicProfile: true to all users that don't have it
    const result = await User.updateMany(
      { isPublicProfile: { $exists: false } },
      { $set: { isPublicProfile: true } }
    );
    
    console.log(`Migration complete. Modified ${result.modifiedCount} users.`);
    process.exit(0);
  } catch (err) {
    console.error('Migration failed:', err);
    process.exit(1);
  }
}

migrate();
