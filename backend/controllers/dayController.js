const Day = require('../models/Day');
const User = require('../models/User');

// Helper to count completed tasks
function countTasks(categories) {
  let completed = 0;
  for (const cat of categories) {
    for (const task of cat.tasks) {
      if (task.completed) completed++;
    }
  }
  return completed;
}

// Helper to calculate streak logic same as frontend
function calculateStreak(days) {
  if (!days.length) return 0;
  
  const sorted = [...days].sort((a, b) => b.date.localeCompare(a.date));
  
  const d = new Date();
  const today = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  
  let streak = 0;
  let checkDate = today;

  const todayDay = sorted.find(d => d.date === today);
  if (todayDay && countTasks(todayDay.categories) > 0) {
    // Today is done, it counts towards streak
  } else {
    const [y, m, dayNum] = checkDate.split('-').map(Number);
    const prev = new Date(y, m-1, dayNum-1);
    checkDate = `${prev.getFullYear()}-${String(prev.getMonth()+1).padStart(2,'0')}-${String(prev.getDate()).padStart(2,'0')}`;
  }

  for (const day of sorted) {
    if (day.date > checkDate) continue;
    if (day.date < checkDate) break;

    const completed = countTasks(day.categories);
    if (completed > 0) {
      streak++;
      const [y, m, dayNum] = checkDate.split('-').map(Number);
      const prev = new Date(y, m-1, dayNum-1);
      checkDate = `${prev.getFullYear()}-${String(prev.getMonth()+1).padStart(2,'0')}-${String(prev.getDate()).padStart(2,'0')}`;
    } else break;
  }
  return streak;
}

async function updateUserStreakAndActivity(userId) {
  const days = await Day.find({ userId });
  const currentStreak = calculateStreak(days);
  await User.findByIdAndUpdate(userId, { 
    currentStreak,
    lastActiveAt: new Date()
  });
}

/**
 * GET /api/days?userId=...&page=...&limit=...
 * Retrieve days for a specific user, paginated. Sorted by date descending.
 */
const getAllDays = async (req, res) => {
  try {
    const { userId, page, limit } = req.query;
    if (!userId) return res.status(400).json({ message: 'userId is required' });

    const user = await User.findById(userId);
    const streak = user ? user.currentStreak : 0;

    if (page && limit) {
      const pageNum = parseInt(page);
      const limitNum = parseInt(limit);
      const skip = (pageNum - 1) * limitNum;
      
      const days = await Day.find({ userId }).sort({ date: -1 }).skip(skip).limit(limitNum);
      const total = await Day.countDocuments({ userId });
      const hasMore = (skip + days.length) < total;
      
      return res.json({ days, streak, hasMore });
    } else {
      // Fallback for non-paginated requests
      const days = await Day.find({ userId }).sort({ date: -1 });
      return res.json(days);
    }
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

/**
 * GET /api/days/:date?userId=...
 * Get a specific day by date string (YYYY-MM-DD) for a user
 */
const getDayByDate = async (req, res) => {
  try {
    const { userId } = req.query;
    if (!userId) return res.status(400).json({ message: 'userId is required' });

    const day = await Day.findOne({ userId, date: req.params.date });
    if (!day) return res.status(404).json({ message: 'Day not found' });
    res.json(day);
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

/**
 * POST /api/days
 * Create a new day entry for a user
 */
const createDay = async (req, res) => {
  try {
    const { userId, date, categories, summary } = req.body;
    if (!userId) return res.status(400).json({ message: 'userId is required' });

    // Prevent duplicate dates per user
    const existing = await Day.findOne({ userId, date });
    if (existing) {
      return res.status(400).json({ message: 'A card for this date already exists' });
    }

    const day = new Day({ userId, date, categories: categories || [], summary: summary || '' });
    const saved = await day.save();
    
    await updateUserStreakAndActivity(userId);
    
    res.status(201).json(saved);
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

/**
 * PUT /api/days/:id
 * Update a day (categories, tasks, summary)
 */
const updateDay = async (req, res) => {
  try {
    const updated = await Day.findByIdAndUpdate(
      req.params.id,
      { $set: req.body },
      { new: true, runValidators: true }
    );
    if (!updated) return res.status(404).json({ message: 'Day not found' });
    
    await updateUserStreakAndActivity(updated.userId);
    
    res.json(updated);
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

module.exports = { getAllDays, getDayByDate, createDay, updateDay };
