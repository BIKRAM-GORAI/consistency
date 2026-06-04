const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../../.env') });
const mongoose = require('mongoose');
const User = require('../models/User');
const Day = require('../models/Day');

function countCompletedTasks(categories) {
  let completed = 0;
  for (const cat of categories) {
    for (const task of cat.tasks) {
      if (task.completed) completed++;
    }
  }
  return completed;
}

async function migrate() {
  try {
    const mongoUri = process.env.MONGO_URI;
    if (!mongoUri) {
      throw new Error('MONGO_URI is not set in the environment variables.');
    }

    await mongoose.connect(mongoUri);
    console.log('Connected to MongoDB');

    const users = await User.find({});
    console.log(`Found ${users.length} users to migrate.`);

    let migratedCount = 0;

    for (const user of users) {
      const days = await Day.find({ userId: user._id }).select('date categories');
      
      const mostRecentCompletedDay = days
        .filter(d => countCompletedTasks(d.categories) > 0)
        .sort((a, b) => b.date.localeCompare(a.date))[0];

      const lastCompletedDate = mostRecentCompletedDay ? mostRecentCompletedDay.date : null;

      user.lastCompletedDate = lastCompletedDate;
      await user.save();
      migratedCount++;
      console.log(`Migrated user: ${user.username || user._id} -> lastCompletedDate: ${lastCompletedDate}`);
    }

    console.log(`Migration complete. Updated ${migratedCount} users.`);
    process.exit(0);
  } catch (err) {
    console.error('Migration failed:', err);
    process.exit(1);
  }
}

migrate();
