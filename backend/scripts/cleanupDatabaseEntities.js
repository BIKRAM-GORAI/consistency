const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../../.env') });
if (!process.env.MONGO_URI) {
  require('dotenv').config({ path: path.join(__dirname, '../.env') });
}

const connectDB = require('../config/db');
const Achievement = require('../models/Achievement');
const Goal = require('../models/Goal');

function decodeEntities(str) {
  if (!str) return '';
  let s = String(str);
  for (let i = 0; i < 6; i++) {
    if (!/&(amp|lt|gt|quot|#39|#x2F);/i.test(s)) break;
    s = s
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/&#x2F;/gi, '/');
  }
  return s;
}

(async () => {
  console.log('🚀 Starting Database Entity Cleanup Script...');
  if (!process.env.MONGO_URI) {
    console.error('❌ MONGO_URI is missing from environment.');
    process.exit(1);
  }

  await connectDB();

  try {
    // 1. Clean Achievements
    const achievements = await Achievement.find({
      $or: [
        { title: { $regex: /&(amp|lt|gt|quot|#39|#x2F);/i } },
        { description: { $regex: /&(amp|lt|gt|quot|#39|#x2F);/i } }
      ]
    });

    console.log(`[Cleanup] Found ${achievements.length} Achievement records with HTML entities to clean.`);
    let achCleanedCount = 0;
    for (const ach of achievements) {
      const oldTitle = ach.title;
      const oldDesc = ach.description;
      ach.title = decodeEntities(oldTitle);
      ach.description = decodeEntities(oldDesc);

      if (oldTitle !== ach.title || oldDesc !== ach.description) {
        await ach.save();
        achCleanedCount++;
        console.log(`  Cleaned Achievement [${ach._id}]: "${oldTitle}" -> "${ach.title}"`);
      }
    }

    // 2. Clean Goals
    const goals = await Goal.find();
    console.log(`[Cleanup] Scanning ${goals.length} Goal records...`);
    let goalCleanedCount = 0;

    for (const goal of goals) {
      let modified = false;
      const oldTitle = goal.title;
      const newTitle = decodeEntities(oldTitle);
      if (oldTitle !== newTitle) {
        goal.title = newTitle;
        modified = true;
      }

      if (Array.isArray(goal.tasks)) {
        goal.tasks.forEach(t => {
          if (t.title) {
            const oldT = t.title;
            const newT = decodeEntities(oldT);
            if (oldT !== newT) {
              t.title = newT;
              modified = true;
            }
          }
        });
      }

      if (modified) {
        await goal.save();
        goalCleanedCount++;
        console.log(`  Cleaned Goal [${goal._id}]: "${oldTitle}" -> "${goal.title}"`);
      }
    }

    console.log(`\n✅ Database Cleanup Complete!`);
    console.log(`   - Achievements Cleaned: ${achCleanedCount}`);
    console.log(`   - Goals Cleaned: ${goalCleanedCount}`);
    process.exit(0);
  } catch (err) {
    console.error('❌ Database Cleanup Error:', err);
    process.exit(1);
  }
})();
