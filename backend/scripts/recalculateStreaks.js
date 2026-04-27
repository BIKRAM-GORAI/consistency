/**
 * recalculateStreaks.js
 * ─────────────────────────────────────────────────────────────────────────────
 * One-time migration script to recalculate both `currentStreak` and
 * `highestStreak` for every user based on their complete Day history.
 *
 * Run from the project root:
 *   node backend/scripts/recalculateStreaks.js
 * ─────────────────────────────────────────────────────────────────────────────
 */

require('dotenv').config();
const mongoose = require('mongoose');
const User = require('../models/User');
const Day  = require('../models/Day');

// ── Helpers (same logic as dayController) ──────────────────────────────────

function countCompletedTasks(categories) {
  let completed = 0;
  for (const cat of categories) {
    for (const task of cat.tasks) {
      if (task.completed) completed++;
    }
  }
  return completed;
}

/**
 * Current (as-of-today) consecutive streak.
 * Returns 0 if the user missed even one day.
 */
function calculateCurrentStreak(days) {
  if (!days || !days.length) return 0;

  const sorted = [...days].sort((a, b) => b.date.localeCompare(a.date));

  const d     = new Date();
  const today = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

  let streak    = 0;
  let checkDate = today;

  const todayDay  = sorted.find(day => day.date === today);
  const todayDone = todayDay && countCompletedTasks(todayDay.categories) > 0;

  if (!todayDone) {
    const [y, m, dayNum] = checkDate.split('-').map(Number);
    const prev = new Date(y, m - 1, dayNum - 1);
    checkDate = `${prev.getFullYear()}-${String(prev.getMonth() + 1).padStart(2, '0')}-${String(prev.getDate()).padStart(2, '0')}`;
  }

  for (const day of sorted) {
    if (day.date > checkDate) continue;
    if (day.date < checkDate) break;

    const completed = countCompletedTasks(day.categories);
    if (completed > 0) {
      streak++;
      const [y, m, dayNum] = checkDate.split('-').map(Number);
      const prev = new Date(y, m - 1, dayNum - 1);
      checkDate = `${prev.getFullYear()}-${String(prev.getMonth() + 1).padStart(2, '0')}-${String(prev.getDate()).padStart(2, '0')}`;
    } else {
      break;
    }
  }

  return streak;
}

/**
 * All-time highest consecutive streak (scans full history, oldest→newest).
 */
function calculateHighestStreak(days) {
  if (!days || !days.length) return 0;

  const sorted = [...days].sort((a, b) => a.date.localeCompare(b.date));

  let maxStreak = 0;
  let curStreak = 0;
  let prevDate  = null;

  for (const day of sorted) {
    const completed = countCompletedTasks(day.categories);

    if (completed === 0) {
      curStreak = 0;
      prevDate  = null;
      continue;
    }

    if (prevDate === null) {
      curStreak = 1;
    } else {
      const [py, pm, pd] = prevDate.split('-').map(Number);
      const [cy, cm, cd] = day.date.split('-').map(Number);
      const diffMs   = new Date(cy, cm - 1, cd) - new Date(py, pm - 1, pd);
      const diffDays = Math.round(diffMs / (1000 * 60 * 60 * 24));

      if (diffDays === 1) {
        curStreak++;
      } else {
        curStreak = 1;
      }
    }

    prevDate = day.date;
    if (curStreak > maxStreak) maxStreak = curStreak;
  }

  return maxStreak;
}

// ── Main ───────────────────────────────────────────────────────────────────

async function recalculateAllStreaks() {
  try {
    console.log('🔌 Connecting to MongoDB...');
    await mongoose.connect(process.env.MONGO_URI);
    console.log('✅ Connected.\n');

    const users = await User.find({}).select('_id name email currentStreak highestStreak');
    console.log(`👥 Found ${users.length} users. Recalculating streaks...\n`);

    let updated  = 0;
    let unchanged = 0;
    let errors   = 0;

    for (const user of users) {
      try {
        // Fetch ALL days for this user
        const days = await Day.find({ userId: user._id }).select('date categories');

        const newCurrentStreak = calculateCurrentStreak(days);
        const newHighestStreak = Math.max(
          calculateHighestStreak(days),
          // Never lower a stored highestStreak (belt-and-suspenders)
          user.highestStreak || 0
        );

        const currentChanged = user.currentStreak !== newCurrentStreak;
        const highestChanged = (user.highestStreak || 0) !== newHighestStreak;

        if (currentChanged || highestChanged) {
          await User.findByIdAndUpdate(user._id, {
            currentStreak: newCurrentStreak,
            highestStreak: newHighestStreak,
          });

          console.log(
            `  ✏️  ${user.name} (${user.email})\n` +
            `       currentStreak : ${user.currentStreak} → ${newCurrentStreak}\n` +
            `       highestStreak : ${user.highestStreak || 0} → ${newHighestStreak}\n` +
            `       days in DB    : ${days.length}`
          );
          updated++;
        } else {
          console.log(`  ✓  ${user.name} (${user.email}) — no change (streak=${newCurrentStreak}, highest=${newHighestStreak})`);
          unchanged++;
        }
      } catch (userErr) {
        console.error(`  ❌ Failed for ${user.email}:`, userErr.message);
        errors++;
      }
    }

    console.log('\n─────────────────────────────────');
    console.log(`✅ Recalculation complete.`);
    console.log(`   Updated  : ${updated} users`);
    console.log(`   Unchanged: ${unchanged} users`);
    console.log(`   Errors   : ${errors} users`);
    console.log('─────────────────────────────────\n');

    process.exit(0);
  } catch (err) {
    console.error('❌ Fatal error:', err);
    process.exit(1);
  }
}

recalculateAllStreaks();
