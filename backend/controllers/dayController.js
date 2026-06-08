const Day = require('../models/Day');
const User = require('../models/User');
const Achievement = require('../models/Achievement');
const Scratchpad = require('../models/Scratchpad');


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
 * In-memory helper to merge duplicate day cards robustly by date,
 * logically ORing their completions.
 */
function getUniqueDaysWithCompletions(days) {
  const dayMap = {};
  for (const d of days) {
    const completed = countCompletedTasks(d.categories) > 0;
    if (dayMap[d.date] !== undefined) {
      dayMap[d.date] = dayMap[d.date] || completed;
    } else {
      dayMap[d.date] = completed;
    }
  }
  return Object.keys(dayMap).map(date => ({
    date,
    completed: dayMap[date]
  }));
}

/**
 * Calculate the CURRENT (as-of-today) consecutive streak.
 * A streak is maintained only if every consecutive day (no gaps)
 * has at least one completed task. Missing a single day resets to 0.
 *
 * @param {Array} days - Array of Day documents (all days for this user)
 * @param {string} [clientDate] - Timezone-safe local client today date (YYYY-MM-DD)
 * @returns {number} Current streak count
 */
function calculateCurrentStreak(days, clientDate) {
  if (!days || !days.length) return 0;

  const uniqueDays = getUniqueDaysWithCompletions(days);
  // Sort newest-first for sequential backward walk
  uniqueDays.sort((a, b) => b.date.localeCompare(a.date));

  const d = new Date();
  const serverToday = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

  // Timezone-safe today resolution: prioritize client date if sent by frontend, fall back to server or newest day
  let today = clientDate || serverToday;
  const mostRecentDay = uniqueDays[0];
  if (mostRecentDay && mostRecentDay.date > today) {
    today = mostRecentDay.date;
  }

  let streak = 0;
  let checkDate = today;

  // If today has at least one completed task, start counting from today.
  // Otherwise start from yesterday (user still has until end-of-day).
  const todayDay = uniqueDays.find(d => d.date === today);
  const todayDone = todayDay && todayDay.completed;

  if (!todayDone) {
    // Shift checkDate back by one day
    const [y, m, dayNum] = checkDate.split('-').map(Number);
    const prev = new Date(y, m - 1, dayNum - 1);
    checkDate = `${prev.getFullYear()}-${String(prev.getMonth() + 1).padStart(2, '0')}-${String(prev.getDate()).padStart(2, '0')}`;
  }

  for (const day of uniqueDays) {
    // Skip any days newer than the current checkDate
    if (day.date > checkDate) continue;
    // Gap found — streak is broken
    if (day.date < checkDate) break;

    // day.date === checkDate
    if (day.completed) {
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

  const uniqueDays = getUniqueDaysWithCompletions(days);
  // Sort oldest-first to walk forward through history
  uniqueDays.sort((a, b) => a.date.localeCompare(b.date));

  let maxStreak = 0;
  let curStreak = 0;
  let prevDate = null;

  for (const day of uniqueDays) {
    if (!day.completed) {
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
 * @param {string} [clientDate] - Optional client date string YYYY-MM-DD
 * @returns {Promise<number>} The newly-calculated currentStreak
 */
async function updateUserStreakAndActivity(userId, clientDate) {
  // Fetch every day for this user (only fields needed for calculation)
  const days = await Day.find({ userId }).select('date categories');

  const currentStreak = calculateCurrentStreak(days, clientDate);
  const highestStreak = calculateHighestStreak(days);

  // Find the most recent day containing completed tasks
  const mostRecentCompletedDay = days
    .filter(d => countCompletedTasks(d.categories) > 0)
    .sort((a, b) => b.date.localeCompare(a.date))[0];
  const lastCompletedDate = mostRecentCompletedDay ? mostRecentCompletedDay.date : null;

  await User.findByIdAndUpdate(userId, {
    currentStreak,
    highestStreak,
    lastCompletedDate,
    lastActiveAt: new Date(),
  });

  try {
    const { checkAndAwardReferralStreak } = require('../utils/pointsHelper');
    await checkAndAwardReferralStreak(userId, highestStreak);
  } catch (err) {
    console.error('[Referral Reward Check Error]:', err);
  }

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
    const clientDate = req.headers['x-client-date'];

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
      const currentStreak = calculateCurrentStreak(allUserDays, clientDate);
      const newHighest    = calculateHighestStreak(allUserDays);

      // Find the most recent day containing completed tasks
      const mostRecentCompletedDay = allUserDays
        .filter(d => countCompletedTasks(d.categories) > 0)
        .sort((a, b) => b.date.localeCompare(a.date))[0];
      const lastCompletedDate = mostRecentCompletedDay ? mostRecentCompletedDay.date : null;

      // Persist corrected values (fire-and-forget — don't block the response)
      User.findByIdAndUpdate(userId, {
        currentStreak,
        highestStreak: newHighest,
        lastCompletedDate,
      }).then(() => {
        const { checkAndAwardReferralStreak } = require('../utils/pointsHelper');
        checkAndAwardReferralStreak(userId, newHighest).catch(err => console.error(err));
      }).catch(() => {});

      const hasMore = (skip + paginatedDays.length) < total;
      return res.json({ days: paginatedDays, streak: currentStreak, hasMore, total });

    } else {
      // Non-paginated fallback
      const days = await Day.find({ userId }).sort({ date: -1 });
      const currentStreak = calculateCurrentStreak(days, clientDate);
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
 * GET /api/days/id/:id
 * Get a specific day by MongoDB _id for a user.
 */
const getDayById = async (req, res) => {
  try {
    const userId = req.user.userId;

    const day = await Day.findOne({ _id: req.params.id, userId });
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
    const { date, categories, summary, aiSummary, reminder } = req.body;
    const clientDate = req.headers['x-client-date'];

    // Prevent duplicate dates per user
    const existing = await Day.findOne({ userId, date });
    if (existing) {
      return res.status(400).json({ message: 'A card for this date already exists' });
    }

    const day   = new Day({ 
      userId, 
      date, 
      categories: categories || [], 
      summary: summary || '',
      aiSummary: aiSummary || '',
      reminder: reminder || { enabled: false, time: "", type: "notification", selectedTasks: [] }
    });
    const saved = await day.save();

    // Recalculate and persist streak, get new value back
    const newStreak = await updateUserStreakAndActivity(userId, clientDate);

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
    const updateData = req.body;
    const clientDate = req.headers['x-client-date'];

    // Handle different update formats
    if (updateData.tasks && Array.isArray(updateData.tasks)) {
      // If tasks array is provided, add it to the LeetCode category or create one
      const day = await Day.findOne({ _id: req.params.id, userId });
      if (!day) return res.status(404).json({ message: 'Day not found or unauthorized' });

      // Find or create LeetCode category
      let leetcodeCategory = day.categories.find(cat => cat.name === 'LeetCode');
      if (!leetcodeCategory) {
        day.categories.push({ name: 'LeetCode', tasks: [] });
        // IMPORTANT: After pushing a plain object, Mongoose converts it to a subdocument.
        // Re-assign to the actual subdocument so task pushes below are reflected on save.
        leetcodeCategory = day.categories[day.categories.length - 1];
      }

      // Add new tasks to the category
      updateData.tasks.forEach(task => {
        // Check if task already exists
        const existingTaskIndex = leetcodeCategory.tasks.findIndex(
          t => t.title === task.title
        );
        if (existingTaskIndex >= 0) {
          // Update existing task
          leetcodeCategory.tasks[existingTaskIndex] = {
            ...leetcodeCategory.tasks[existingTaskIndex],
            ...task
          };
        } else {
          // Add new task
          leetcodeCategory.tasks.push(task);
        }
      });

      // Save the updated day
      const updated = await day.save();

      // Recalculate streak and include it in the response
      const newStreak = await updateUserStreakAndActivity(updated.userId, clientDate);

      return res.json({ ...updated.toObject(), streak: newStreak });
    }

    // Standard update with categories
    const updated = await Day.findOneAndUpdate(
      { _id: req.params.id, userId },
      { $set: updateData },
      { new: true, runValidators: true }
    );
    if (!updated) return res.status(404).json({ message: 'Day not found or unauthorized' });

    // Recalculate streak and include it in the response
    const newStreak = await updateUserStreakAndActivity(updated.userId, clientDate);

    res.json({ ...updated.toObject(), streak: newStreak });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

/**
 * DELETE /api/days/:id
 * Delete a day by MongoDB _id.
 */
const deleteDay = async (req, res) => {
  try {
    const userId = req.user.userId;
    const clientDate = req.headers['x-client-date'];
    const deleted = await Day.findOneAndDelete({ _id: req.params.id, userId });
    if (!deleted) {
      return res.status(404).json({ message: 'Day not found or unauthorized' });
    }

    // Clean up any achievements associated with this day card for this user
    await Achievement.deleteMany({ dayId: req.params.id, userId });

    // Clean up any scratchpads associated with this day card for this user
    await Scratchpad.deleteMany({ dayId: req.params.id, userId });

    // Recalculate streak and include it in the response
    const newStreak = await updateUserStreakAndActivity(userId, clientDate);

    res.json({ message: 'Day deleted successfully', streak: newStreak });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

/**
 * GET /api/days/:id/scratchpad
 * Retrieve scratchpad strokes for a specific day.
 */
const getScratchpad = async (req, res) => {
  try {
    const userId = req.user.userId;
    const dayId = req.params.id;

    // Check if the day exists and belongs to the user
    const day = await Day.findOne({ _id: dayId, userId });
    if (!day) return res.status(404).json({ message: 'Day not found or unauthorized' });

    let scratchpad = await Scratchpad.findOne({ dayId, userId });
    if (!scratchpad) {
      // Return empty strokes if not created yet
      return res.json({ dayId, strokes: [] });
    }
    res.json(scratchpad);
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

/**
 * PUT /api/days/:id/scratchpad
 * Create or update scratchpad strokes for a specific day.
 */
const saveScratchpad = async (req, res) => {
  try {
    const userId = req.user.userId;
    const dayId = req.params.id;
    const { strokes } = req.body;

    // Check if the day exists and belongs to the user
    const day = await Day.findOne({ _id: dayId, userId });
    if (!day) return res.status(404).json({ message: 'Day not found or unauthorized' });

    // Past day verification with robust 36-hour buffer to handle server-vs-client timezone differences and offline-sync delays safely
    const today = new Date();
    const dayDateObj = new Date(day.date);
    const diffTime = today - dayDateObj;
    const diffHours = diffTime / (1000 * 60 * 60);

    if (diffHours > 36) {
      return res.status(400).json({ message: 'Cannot modify scratchpad for a past day' });
    }

    let scratchpad = await Scratchpad.findOne({ dayId, userId });
    if (scratchpad) {
      scratchpad.strokes = strokes || [];
      await scratchpad.save();
    } else {
      scratchpad = new Scratchpad({
        dayId,
        userId,
        strokes: strokes || [],
      });
      await scratchpad.save();
    }

    // Set hasScratchpad on the Day document
    if (!day.hasScratchpad) {
      day.hasScratchpad = true;
      await day.save();
    }

    res.json(scratchpad);
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

const getAiGraceLimit = (user) => {
  const isPremium = user && user.subscriptionTier === 'premium' && (!user.subscriptionExpiresAt || new Date(user.subscriptionExpiresAt) > new Date());
  let limit;
  if (isPremium) {
    limit = parseInt(process.env.PREMIUM_MONTHLY_GRACE_LIMIT, 10);
    if (isNaN(limit)) limit = 6;
  } else {
    limit = parseInt(process.env.FREE_MONTHLY_GRACE_LIMIT, 10);
    if (isNaN(limit)) limit = 2;
  }
  return limit;
};

/**
 * Checks the user's monthly Grace count, resetting it if a calendar month has changed.
 */
const checkGraceLimit = async (userId) => {
  const user = await User.findById(userId);
  if (!user) {
    const err = new Error('User not found.');
    err.status = 404;
    throw err;
  }

  const now = new Date();
  const lastReset = user.graceResetTime ? new Date(user.graceResetTime) : new Date(0);

  // Compare calendar months
  if (now.getMonth() !== lastReset.getMonth() || now.getFullYear() !== lastReset.getFullYear()) {
    user.graceCount = 0;
    user.graceResetTime = now;
    await user.save();
  }

  const limit = getAiGraceLimit(user);
  const graceLeft = Math.max(0, limit - user.graceCount);
  return { user, graceLeft, limit };
};

/**
 * GET /api/days/grace-limits
 * Fetches remaining monthly grace activations for the user
 */
const getGraceLimits = async (req, res) => {
  try {
    const userId = req.user.userId;
    const { graceLeft, limit } = await checkGraceLimit(userId);
    res.status(200).json({ graceLeft, limit });
  } catch (error) {
    console.error('[Vercel-Backend] getGraceLimits error:', error.message);
    res.status(error.status || 500).json({ message: error.message || 'Internal Server Error' });
  }
};

/**
 * POST /api/days/:id/apply-grace
 * Applies a monthly streak protection Grace point to unlock a past day sheet card permanently.
 */
const applyGrace = async (req, res) => {
  try {
    const userId = req.user.userId;
    const dayId = req.params.id;

    // Retrieve the target day sheet
    const day = await Day.findOne({ _id: dayId, userId });
    if (!day) {
      return res.status(404).json({ message: 'Day sheet card not found.' });
    }

    const clientDate = req.headers['x-client-date'];
    const d = new Date();
    const serverToday = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    const todayStr = clientDate || serverToday;

    // Verify it is indeed a past day card (not today, not future)
    if (day.date >= todayStr) {
      return res.status(400).json({ message: 'Grace days can only be applied to past cards.' });
    }

    // Verify it is in the current calendar month
    const currentMonthPrefix = todayStr.substring(0, 7); // e.g. "2026-06"
    const cardMonthPrefix = day.date.substring(0, 7); // e.g. "2026-05"
    if (cardMonthPrefix !== currentMonthPrefix) {
      return res.status(400).json({ message: 'Grace days can only be applied to cards in the current month.' });
    }

    if (day.graceApplied) {
      return res.status(400).json({ message: 'Grace has already been applied to this day card!' });
    }

    // Validate and enforce monthly Grace quota limits
    const { user, graceLeft, limit } = await checkGraceLimit(userId);
    if (graceLeft <= 0) {
      return res.status(400).json({
        message: `Insufficient Grace Quota. You have used your monthly limit of ${limit} grace days.`
      });
    }

    // Deduct 1 Grace quota point
    user.graceCount += 1;
    if (user.subscriptionTier === 'premium') {
      user.premiumUsageLogs.push({
        actionType: 'grace_apply',
        timestamp: new Date(),
        details: `Restored past daily card for date: ${day.date}`,
        razorpayPaymentId: user.razorpayPaymentId
      });
    }
    await user.save();

    // Mark Grace as applied on target card
    day.graceApplied = true;
    const savedDay = await day.save();

    // Re-verify/Update user streak
    const currentStreak = await updateUserStreakAndActivity(userId, clientDate);

    res.status(200).json({
      message: 'Grace Day applied successfully!',
      day: savedDay,
      graceLeft: Math.max(0, limit - user.graceCount),
      limit,
      streak: currentStreak
    });

  } catch (error) {
    console.error('[Vercel-Backend] applyGrace error:', error.message);
    res.status(500).json({ message: 'Internal Server Error while applying Grace streak protection.' });
  }
};

module.exports = { 
  getAllDays, 
  getDayByDate, 
  getDayById, 
  createDay, 
  updateDay, 
  deleteDay, 
  getScratchpad, 
  saveScratchpad,
  getGraceLimits,
  applyGrace,
  calculateCurrentStreak,
  calculateHighestStreak
};

