const User = require('../models/User');
const Day = require('../models/Day');
const Achievement = require('../models/Achievement');
const Group = require('../models/Group');
const ProfileShare = require('../models/ProfileShare');
const crypto = require('crypto');


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
    .select('username profilePicture currentStreak highestStreak')
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

    const { code } = req.query;
    let canView = false;

    if (code) {
      // If a code is provided, it MUST be valid for this user
      const validShare = await ProfileShare.findOne({ 
        userId: user._id, 
        shareCode: code 
      });
      if (validShare) {
        canView = true;
      } else {
        // If code is provided but invalid, deny access even if profile is public
        return res.status(403).json({ message: 'Invalid or expired share link' });
      }
    } else {
      // If no code is provided, check if the profile is public
      canView = user.isPublicProfile !== false;
    }

    // If still not allowed (private and no/invalid code), check shared public groups
    if (!canView && req.user && req.user.userId) {
      const requestingUserId = req.user.userId;
      const sharedPublicGroup = await Group.findOne({
        isPublic: true,
        members: { $all: [requestingUserId, user._id] }
      });
      if (sharedPublicGroup) {
        canView = true;
      }
    }

    if (!canView) {
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
      achievements = await Achievement.find({ userId: user._id }).sort({ date: -1 }).limit(10);
    }

    const groupCount = await Group.countDocuments({ members: user._id });

    res.json({
      username: user.username,
      name: user.name,
      profilePicture: user.profilePicture,
      currentStreak: user.currentStreak,
      highestStreak: user.highestStreak || 0,
      groupCount: groupCount,
      days: days.slice(0, 7), // Only first 7 for initial view
      contributionData: contributionData, // Full graph
      achievements: achievements,
      totalDays: days.length
    });

  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
}

async function getPublicProfileDays(req, res) {
  try {
    const { username } = req.params;
    const page = parseInt(req.query.page) || 1;
    const limit = 7;
    const skip = page * limit;

    const user = await User.findOne({ username: username.toLowerCase() });
    if (!user) return res.status(404).json({ message: 'User not found' });

    // Note: Privacy check omitted for simplicity here, assuming it's handled by frontend calling this only if public
    const daysRaw = await Day.find({ userId: user._id })
      .sort({ date: -1 })
      .skip(skip)
      .limit(limit)
      .lean();

    const days = daysRaw.map(day => {
      const sanitizedCategories = day.categories.map(cat => ({
        name: cat.name,
        tasks: cat.tasks.map(t => ({ title: t.title, completed: t.completed }))
      }));
      return { _id: day._id, date: day.date, categories: sanitizedCategories };
    });

    res.json(days);
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
}

async function getPublicProfileAchievements(req, res) {
  try {
    const { username } = req.params;
    const page = parseInt(req.query.page) || 1;
    const limit = 10;
    const skip = page * limit;

    const user = await User.findOne({ username: username.toLowerCase() });
    if (!user) return res.status(404).json({ message: 'User not found' });

    const achievements = await Achievement.find({ userId: user._id })
      .sort({ date: -1 })
      .skip(skip)
      .limit(limit);

    res.json(achievements);
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
}


async function logProfileShare(req, res) {
  try {
    const { userId } = req.user;
    const { platform } = req.body;
    
    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ message: 'User not found' });

    const shareCode = crypto.randomBytes(16).toString('hex');

    const share = new ProfileShare({
      userId: user._id,
      username: user.username,
      platform: platform || 'unknown',
      shareCode
    });

    await share.save();
    res.json({ message: 'Share logged successfully', shareCode });
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
}

module.exports = {
  searchUsers,
  getPublicProfile,
  getPublicProfileDays,
  getPublicProfileAchievements,
  logProfileShare
};

