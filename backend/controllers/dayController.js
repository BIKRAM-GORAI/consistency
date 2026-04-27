const Day = require('../models/Day');
const User = require('../models/User');

// ── Helpers ────────────────────────────────────────────────

/** Count completed tasks across all categories */
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
 * Calculate the CURRENT (as-of-today) consecutive streak.
 * A streak is maintained only if every consecutive day (no gaps)
 * has at least one completed task. Missing a single day resets to 0.
 *
 * @param {Array} days - Array of Day documents (all days for this user)
 * @returns {number} Current streak count
 */
function calculateCurrentStreak(days) {
  if (!days || !days.length) return 0;

  // Sort newest-first for sequential backward walk
  const sorted = [...days].sort((a, b) => b.date.localeCompare(a.date));

  const d = new Date();
  const today = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

  let streak = 0;
  let checkDate = today;

  // If today has at least one completed task, start counting from today.
  // Otherwise start from yesterday (user still has until end-of-day).
  const todayDay = sorted.find(day => day.date === today);
  const todayDone = todayDay && countCompletedTasks(todayDay.categories) > 0;

  if (!todayDone) {
    // Shift checkDate back by one day
    const [y, m, dayNum] = checkDate.split('-').map(Number);
    const prev = new Date(y, m - 1, dayNum - 1);
    checkDate = `${prev.getFullYear()}-${String(prev.getMonth() + 1).padStart(2, '0')}-${String(prev.getDate()).padStart(2, '0')}`;
  }

  for (const day of sorted) {
    // Skip any days newer than the current checkDate
    if (day.date > checkDate) continue;
    // Gap found — streak is broken
    if (day.date < checkDate) break;

    // day.date === checkDate
    const completed = countCompletedTasks(day.categories);
    if (completed > 0) {
      streak++;
      // Move checkDate one day further back
      const [y, m, dayNum] = checkDate.split('-').map(Number);
      const prev = new Date(y, m - 1, dayNum - 1);
      checkDate = `${prev.getFullYear()}-${String(prev.getMonth() + 1).padStart(2, '0')}-${String(prev.getDate()).padStart(2, '0')}`;
    } else {
      // Day exists but has 0 completed tasks — breaks the streak
      break;
    }
  }

  return streak;
}

/**
 * Calculate the HIGHEST consecutive streak ever achieved by scanning
 * all historical days (oldest-to-newest), tracking the longest run.
 *
 * @param {Array} days - Array of Day documents (all days for this user)
 * @returns {number} All-time highest streak
 */
function calculateHighestStreak(days) {
  if (!days || !days.length) return 0;

  // Sort oldest-first to walk forward through history
  const sorted = [...days].sort((a, b) => a.date.localeCompare(b.date));

  let maxStreak = 0;
  let curStreak = 0;
  let prevDate = null;

  for (const day of sorted) {
    const completed = countCompletedTasks(day.categories);

    if (completed === 0) {
      // Day with no completions — reset current run
      curStreak = 0;
      prevDate = null;
      continue;
    }

    if (prevDate === null) {
      // First productive day in a new run
      curStreak = 1;
    } else {
      // Check if this day is exactly one day after the previous
      const [py, pm, pd] = prevDate.split('-').map(Number);
      const [cy, cm, cd] = day.date.split('-').map(Number);
      const diffMs = new Date(cy, cm - 1, cd) - new Date(py, pm - 1, pd);
      const diffDays = Math.round(diffMs / (1000 * 60 * 60 * 24));

      if (diffDays === 1) {
        curStreak++;
      } else {
        // Gap — start a fresh run
        curStreak = 1;
      }
    }

    prevDate = day.date;
    if (curStreak > maxStreak) maxStreak = curStreak;
  }

  return maxStreak;
}

/**
 * Recalculate both currentStreak and highestStreak for a user from
 * ALL their Day documents, then persist to the User record.
 * Returns the new currentStreak so callers can include it in API responses.
 *
 * @param {string|ObjectId} userId
 * @returns {Promise<number>} The newly-calculated currentStreak
 */
async function updateUserStreakAndActivity(userId) {
  // Fetch every day for this user (only fields needed for calculation)
  const days = await Day.find({ userId }).select('date categories');

  const currentStreak = calculateCurrentStreak(days);
  const newHighest    = calculateHighestStreak(days);

  // Fetch current stored highestStreak so we never lower it
  const user = await User.findById(userId).select('highestStreak');
  const storedHighest = (user && user.highestStreak) || 0;
  const highestStreak = Math.max(storedHighest, newHighest);

  await User.findByIdAndUpdate(userId, {
    currentStreak,
    highestStreak,
    lastActiveAt: new Date(),
  });

  return currentStreak;
}

// ── Controllers ────────────────────────────────────────────

/**
 * GET /api/days?userId=...&page=...&limit=...
 *
 * KEY FIX: Streak is recalculated from ALL days on every page load.
 * This corrects any stale values stored in the DB (e.g. when a user
 * was inactive for days and the stored streak was never reset).
 */
const getAllDays = async (req, res) => {
  try {
    const userId = req.user.userId;
    const { page, limit } = req.query;

    if (page && limit) {
      const pageNum  = parseInt(page);
      const limitNum = parseInt(limit);
      const skip     = (pageNum - 1) * limitNum;

      // Fetch ALL days (for streak) and the current page (for display) in parallel
      const [allUserDays, paginatedDays, total] = await Promise.all([
        Day.find({ userId }).select('date categories'),
        Day.find({ userId }).sort({ date: -1 }).skip(skip).limit(limitNum),
        Day.countDocuments({ userId }),
      ]);

      // Recalculate streak fresh — this is the source of truth
      const currentStreak = calculateCurrentStreak(allUserDays);
      const newHighest    = calculateHighestStreak(allUserDays);

      // Persist corrected values (fire-and-forget — don't block the response)
      User.findById(userId).select('highestStreak').then(user => {
        const storedHighest = (user && user.highestStreak) || 0;
        return User.findByIdAndUpdate(userId, {
          currentStreak,
          highestStreak: Math.max(storedHighest, newHighest),
        });
      }).catch(() => {});

      const hasMore = (skip + paginatedDays.length) < total;
      return res.json({ days: paginatedDays, streak: currentStreak, hasMore });

    } else {
      // Non-paginated fallback
      const days = await Day.find({ userId }).sort({ date: -1 });
      const currentStreak = calculateCurrentStreak(days);
      return res.json(days);
    }
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

/**
 * GET /api/days/:date?userId=...
 * Get a specific day by date string (YYYY-MM-DD) for a user.
 */
const getDayByDate = async (req, res) => {
  try {
    const userId = req.user.userId;

    const day = await Day.findOne({ userId, date: req.params.date });
    if (!day) return res.status(404).json({ message: 'Day not found' });
    res.json(day);
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

/**
 * POST /api/days
 * Create a new day entry for a user.
 * Returns the saved day with the updated streak included.
 */
const createDay = async (req, res) => {
  try {
    const userId = req.user.userId;
    const { date, categories, summary } = req.body;

    // Prevent duplicate dates per user
    const existing = await Day.findOne({ userId, date });
    if (existing) {
      return res.status(400).json({ message: 'A card for this date already exists' });
    }

    const day   = new Day({ userId, date, categories: categories || [], summary: summary || '' });
    const saved = await day.save();

    // Recalculate and persist streak, get new value back
    const newStreak = await updateUserStreakAndActivity(userId);

    // Include streak in the response so the frontend can update immediately
    res.status(201).json({ ...saved.toObject(), streak: newStreak });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

/**
 * PUT /api/days/:id
 * Update a day (categories, tasks, summary).
 *
 * KEY FIX: Returns the updated streak in the response body so the
 * frontend can update its display without needing a separate request.
 */
const updateDay = async (req, res) => {
  try {
    const userId = req.user.userId;
    // Only allow updating days that belong to the user
    const updated = await Day.findOneAndUpdate(
      { _id: req.params.id, userId },
      { $set: req.body },
      { new: true, runValidators: true }
    );
    if (!updated) return res.status(404).json({ message: 'Day not found or unauthorized' });

    // Recalculate streak and include it in the response
    const newStreak = await updateUserStreakAndActivity(updated.userId);

    res.json({ ...updated.toObject(), streak: newStreak });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

module.exports = { getAllDays, getDayByDate, createDay, updateDay };
