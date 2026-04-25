const User = require('../models/User');
const Day = require('../models/Day');
const Achievement = require('../models/Achievement');

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

/**
 * GET /api/users/search?q=...
 * Searches for users by username (prefix match).
 * Only returns users with isPublicProfile = true.
 */
async function searchUsers(req, res) {
  try {
    const q = req.query.q || '';
    if (q.length < 1) return res.json([]);

    // Prefix match regex, case insensitive
    const regex = new RegExp('^' + q, 'i');

    const users = await User.find({
      username: regex,
      isPublicProfile: { $ne: false }
    })
    .select('username profilePicture')
    .limit(10);

    res.json(users);
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
}

/**
 * GET /api/users/:username
 * Returns the public profile of a user.
 */
async function getPublicProfile(req, res) {
  try {
    const username = req.params.username.toLowerCase();
    
    const user = await User.findOne({ username });
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    if (user.isPublicProfile === false) {
      return res.status(403).json({ message: 'This profile is private' });
    }

    // Fetch Days
    const daysRaw = await Day.find({ userId: user._id }).sort({ date: -1 }).lean();
    
    // Map contribution data and sanitize days
    const contributionData = [];
    const days = [];

    for (const day of daysRaw) {
      let completedCount = 0;
      
      const sanitizedCategories = day.categories.map(cat => {
        const sanitizedTasks = cat.tasks.map(t => {
          if (t.completed) completedCount++;
          return { title: t.title, completed: t.completed }; // Exclude extra personal notes
        });
        return { name: cat.name, tasks: sanitizedTasks };
      });

      contributionData.push({ date: day.date, completedCount });
      
      days.push({
        _id: day._id,
        date: day.date,
        categories: sanitizedCategories
        // 'summary' is explicitly omitted
      });
    }

    // Fetch Achievements if public
    let achievements = [];
    if (user.achievementsPublic !== false) {
      achievements = await Achievement.find({ userId: user._id }).sort({ date: -1 });
    }

    res.json({
      username: user.username,
      name: user.name,
      profilePicture: user.profilePicture,
      currentStreak: user.currentStreak,
      days: days, // the full daily cards
      contributionData: contributionData, // for the graph
      achievements: achievements
    });

  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
}

module.exports = {
  searchUsers,
  getPublicProfile
};
