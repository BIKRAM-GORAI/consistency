const User = require('../models/User');
const Day = require('../models/Day');
const Achievement = require('../models/Achievement');
const Group = require('../models/Group');
const Badge = require('../models/Badge');
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
    
    const user = await User.findOne({ username }).populate('claimedBadges');
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    const { code } = req.query;
    let canView = false;

    if (code) {
      // If a code is provided, it MUST be valid for this user
      const validShare = await ProfileShare.findOne({ 
        userId: user._id, 
        shareCode: code,
        expiresAt: { $gt: new Date() }
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
      const sharedGroup = await Group.findOne({
        members: { $all: [requestingUserId, user._id] }
      });
      if (sharedGroup) {
        canView = true;
      }
    }

    if (!canView) {
      return res.status(403).json({ message: 'This profile is private' });
    }

    // Fetch only dates and task counts for the contribution graph (performance optimization)
    const daysRaw = await Day.find({ userId: user._id }).select('date categories').lean();
    
    // Map contribution data
    const contributionData = [];
    for (const day of daysRaw) {
      let completedCount = 0;
      for (const cat of day.categories) {
        for (const task of cat.tasks) {
          if (task.completed) completedCount++;
        }
      }
      contributionData.push({ date: day.date, completedCount });
    }

    // Fetch Achievements if public (limit to 10 for initial view)
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
      days: [], // Now empty, fetched on demand
      contributionData: contributionData, // Full graph
      achievements: achievements,
      totalDays: daysRaw.length,
      claimedBadges: user.claimedBadges || []
    });

  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
}

async function getPublicProfileDays(req, res) {
  try {
    const { username } = req.params;
    const { code } = req.query;
    const user = await User.findOne({ username: username.toLowerCase() });
    if (!user) return res.status(404).json({ message: 'User not found' });

    // Privacy Check
    let canView = false;
    if (code) {
      const validShare = await ProfileShare.findOne({ userId: user._id, shareCode: code, expiresAt: { $gt: new Date() } });
      if (validShare) canView = true;
    } else {
      canView = user.isPublicProfile !== false;
    }

    if (!canView && req.user && req.user.userId) {
      const sharedPublicGroup = await Group.findOne({ members: { $all: [req.user.userId, user._id] } });
      if (sharedPublicGroup) canView = true;
    }

    if (!canView) return res.status(403).json({ message: 'This profile is private' });

    const page = parseInt(req.query.page) || 1;
    const limit = 7;
    const skip = (page - 1) * limit;

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
    const { code } = req.query;
    const user = await User.findOne({ username: username.toLowerCase() });
    if (!user) return res.status(404).json({ message: 'User not found' });

    // Privacy Check
    let canView = false;
    if (code) {
      const validShare = await ProfileShare.findOne({ userId: user._id, shareCode: code, expiresAt: { $gt: new Date() } });
      if (validShare) canView = true;
    } else {
      canView = user.isPublicProfile !== false;
    }

    if (!canView && req.user && req.user.userId) {
      const sharedPublicGroup = await Group.findOne({ members: { $all: [req.user.userId, user._id] } });
      if (sharedPublicGroup) canView = true;
    }

    if (!canView) return res.status(403).json({ message: 'This profile is private' });
    if (user.achievementsPublic === false) return res.status(403).json({ message: 'Achievements are private' });

    const page = parseInt(req.query.page) || 1;
    const limit = 10;
    const skip = (page - 1) * limit;

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
    
    // Set expiration based on platform
    const expiresAt = new Date();
    if (platform === 'preview' || platform === 'admin') {
      expiresAt.setMinutes(expiresAt.getMinutes() + 10);
    } else {
      expiresAt.setMonth(expiresAt.getMonth() + 1);
    }

    const share = new ProfileShare({
      userId: user._id,
      username: user.username,
      platform: platform || 'unknown',
      shareCode,
      expiresAt
    });

    await share.save();
    res.json({ message: 'Share logged successfully', shareCode });
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
}

/**
 * GET /api/users/leaderboard?sort=current&page=1&limit=10
 * Returns a paginated list of public users sorted by currentStreak or highestStreak.
 */
async function getLeaderboard(req, res) {
  try {
    const sortField = req.query.sort === 'highest' ? 'highestStreak' : 'currentStreak';
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;

    const query = {
      isPublicProfile: { $ne: false },
      username: { $exists: true, $ne: null },
      isBlacklisted: { $ne: true }
    };

    const usersRaw = await User.find(query)
      .select('name username profilePicture currentStreak highestStreak lastActiveAt')
      .sort({ [sortField]: -1, lastActiveAt: -1 })
      .skip(skip)
      .limit(limit);

    const maxRankings = parseInt(process.env.MAX_RANKINGS_SHOWN) || 100;
    const realTotal = await User.countDocuments(query);
    const cappedTotal = Math.min(realTotal, maxRankings);
    
    // Capping the users list if it exceeds maxRankings
    let users = usersRaw;
    if (skip + users.length > maxRankings) {
      users = users.slice(0, Math.max(0, maxRankings - skip));
    }

    res.json({
      users,
      total: cappedTotal,
      page,
      limit,
      hasMore: cappedTotal > (skip + users.length),
      maxRankingsShown: maxRankings
    });
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
}

async function getPublicConfig(req, res) {
  res.json({
    maxRankingsShown: parseInt(process.env.MAX_RANKINGS_SHOWN) || 100
  });
}

module.exports = {
  searchUsers,
  getPublicProfile,
  getPublicProfileDays,
  getPublicProfileAchievements,
  logProfileShare,
  getLeaderboard,
  getPublicConfig,
  // Badge Functions
  getAllBadges: async (req, res) => {
    try {
      const badges = await Badge.find().sort({ requiredDays: 1 });
      res.json(badges);
    } catch (err) {
      res.status(500).json({ message: 'Server error', error: err.message });
    }
  },
  claimBadge: async (req, res) => {
    try {
      const { badgeId } = req.params;
      const { userId } = req.user;

      const user = await User.findById(userId);
      if (!user) return res.status(404).json({ message: 'User not found' });

      const badge = await Badge.findById(badgeId);
      if (!badge) return res.status(404).json({ message: 'Badge not found' });

      // Eligibility Check
      if (user.highestStreak < badge.requiredDays) {
        return res.status(400).json({ message: `You need a highest streak of ${badge.requiredDays} days to claim this badge.` });
      }

      // Check if already claimed
      if (user.claimedBadges.includes(badgeId)) {
        return res.status(400).json({ message: 'You have already claimed this badge.' });
      }

      user.claimedBadges.push(badgeId);
      await user.save();

      res.json({ message: 'Badge claimed successfully!', claimedBadges: user.claimedBadges });
    } catch (err) {
      res.status(500).json({ message: 'Server error', error: err.message });
    }
  },
  getClaimedBadges: async (req, res) => {
    try {
      const { userId } = req.user;
      const user = await User.findById(userId).populate('claimedBadges');
      if (!user) return res.status(404).json({ message: 'User not found' });
      res.json(user.claimedBadges);
    } catch (err) {
      res.status(500).json({ message: 'Server error', error: err.message });
    }
  }
};

