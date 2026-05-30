const User = require('../models/User');
const Day = require('../models/Day');
const { calculateCurrentStreak, calculateHighestStreak } = require('./dayController');
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
      isBlacklisted: { $ne: true }
    })
    .select('username profilePicture currentStreak highestStreak subscriptionTier subscriptionExpiresAt')
    .limit(10);

    const usersMapped = users.map(user => {
      const isPremium = user.subscriptionTier === 'premium' && 
        (!user.subscriptionExpiresAt || new Date(user.subscriptionExpiresAt) > new Date());
      return {
        _id: user._id,
        username: user.username,
        profilePicture: user.profilePicture,
        currentStreak: user.currentStreak,
        highestStreak: user.highestStreak,
        isPremium
      };
    });

    res.json(usersMapped);
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
    let showPrivateDetails = user.isPublicProfile !== false;

    if (!showPrivateDetails && code) {
      // If a code is provided, it MUST be valid for this user
      const validShare = await ProfileShare.findOne({ 
        userId: user._id, 
        shareCode: code,
        expiresAt: { $gt: new Date() }
      });
      if (validShare) {
        showPrivateDetails = true;
      }
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

    // Fetch Achievements if public or private access (limit to 10 for initial view)
    let achievements = [];
    if (user.achievementsPublic !== false || showPrivateDetails) {
      achievements = await Achievement.find({ userId: user._id }).sort({ date: -1 }).limit(10);
    }

    const groupCount = await Group.countDocuments({ members: user._id });
    
    const isPremium = user.subscriptionTier === 'premium' && 
      (!user.subscriptionExpiresAt || new Date(user.subscriptionExpiresAt) > new Date());

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
      claimedBadges: user.claimedBadges || [],
      isPublicProfile: user.isPublicProfile !== false,
      showPrivateDetails: showPrivateDetails,
      productivityBio: user.productivityBio || '',
      lastBioGeneratedAt: user.lastBioGeneratedAt || null,
      subscriptionTier: user.subscriptionTier || 'free',
      isPremium: isPremium
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
    let canView = user.isPublicProfile !== false;
    if (!canView && code) {
      const validShare = await ProfileShare.findOne({ userId: user._id, shareCode: code, expiresAt: { $gt: new Date() } });
      if (validShare) canView = true;
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
    let canView = user.isPublicProfile !== false;
    if (!canView && code) {
      const validShare = await ProfileShare.findOne({ userId: user._id, shareCode: code, expiresAt: { $gt: new Date() } });
      if (validShare) canView = true;
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
    const clientDate = req.headers['x-client-date'];

    // 1. Pre-decay stale streaks of all users on the leaderboard to ensure sorting is accurate
    const activeStreakUsers = await User.find({
      currentStreak: { $gt: 0 },
      showOnLeaderboard: { $ne: false },
      username: { $exists: true, $ne: null },
      isBlacklisted: { $ne: true }
    }).select('_id currentStreak highestStreak');

    if (activeStreakUsers.length > 0) {
      const userIds = activeStreakUsers.map(u => u._id);
      // Fetch all days for these users in a single query
      const allDays = await Day.find({ userId: { $in: userIds } }).select('userId date categories').lean();
      
      // Group days by userId in memory
      const daysByUserId = {};
      for (const d of allDays) {
        const uidStr = d.userId.toString();
        if (!daysByUserId[uidStr]) {
          daysByUserId[uidStr] = [];
        }
        daysByUserId[uidStr].push(d);
      }

      // Reconcile and decay streaks in memory
      const bulkOps = [];
      for (const u of activeStreakUsers) {
        const uidStr = u._id.toString();
        const userDays = daysByUserId[uidStr] || [];
        const freshCurrent = calculateCurrentStreak(userDays, clientDate);
        const freshHighest = calculateHighestStreak(userDays);

        if (u.currentStreak !== freshCurrent || u.highestStreak !== freshHighest) {
          bulkOps.push({
            updateOne: {
              filter: { _id: u._id },
              update: { $set: { currentStreak: freshCurrent, highestStreak: freshHighest } }
            }
          });
        }
      }

      if (bulkOps.length > 0) {
        await User.bulkWrite(bulkOps);
      }
    }

    // 2. Fetch the perfectly sorted and fresh paginated list
    const query = {
      showOnLeaderboard: { $ne: false },
      username: { $exists: true, $ne: null },
      isBlacklisted: { $ne: true }
    };

    const usersRaw = await User.find(query)
      .select('name username profilePicture currentStreak highestStreak lastActiveAt subscriptionTier subscriptionExpiresAt')
      .sort({ [sortField]: -1, lastActiveAt: -1 })
      .skip(skip)
      .limit(limit);

    const maxRankings = parseInt(process.env.MAX_RANKINGS_SHOWN) || 100;
    const realTotal = await User.countDocuments(query);
    const cappedTotal = Math.min(realTotal, maxRankings);
    
    // Capping the users list if it exceeds maxRankings
    let usersList = usersRaw;
    if (skip + usersList.length > maxRankings) {
      usersList = usersList.slice(0, Math.max(0, maxRankings - skip));
    }

    const usersMapped = usersList.map(user => {
      const isPremium = user.subscriptionTier === 'premium' && 
        (!user.subscriptionExpiresAt || new Date(user.subscriptionExpiresAt) > new Date());
      return {
        _id: user._id,
        name: user.name,
        username: user.username,
        profilePicture: user.profilePicture,
        currentStreak: user.currentStreak,
        highestStreak: user.highestStreak,
        lastActiveAt: user.lastActiveAt,
        isPremium
      };
    });

    // 3. Calculate active user's rank and fresh streaks if authenticated and they are on the leaderboard
    let myRank = null;
    let myCurrentStreak = null;
    let myHighestStreak = null;
    if (req.user && req.user.userId) {
      const activeUser = await User.findById(req.user.userId);
      if (activeUser && activeUser.username && !activeUser.isBlacklisted) {
        // Recalculate active user's streak first to ensure their rank calculation is accurate!
        const myDays = await Day.find({ userId: activeUser._id }).select('date categories');
        myCurrentStreak = calculateCurrentStreak(myDays, clientDate);
        myHighestStreak = calculateHighestStreak(myDays);
        
        if (activeUser.currentStreak !== myCurrentStreak || activeUser.highestStreak !== myHighestStreak) {
          activeUser.currentStreak = myCurrentStreak;
          activeUser.highestStreak = myHighestStreak;
          await User.findByIdAndUpdate(activeUser._id, {
            currentStreak: myCurrentStreak,
            highestStreak: myHighestStreak
          });
        }

        const scoreVal = activeUser[sortField] || 0;
        const lastActive = activeUser.lastActiveAt || new Date(0);
        
        // Count users ahead of the active user
        const aheadCount = await User.countDocuments({
          showOnLeaderboard: { $ne: false },
          username: { $exists: true, $ne: null },
          isBlacklisted: { $ne: true },
          $or: [
            { [sortField]: { $gt: scoreVal } },
            {
              [sortField]: scoreVal,
              lastActiveAt: { $gt: lastActive }
            }
          ]
        });
        myRank = aheadCount + 1;
      }
    }

    res.json({
      users: usersMapped,
      total: cappedTotal,
      page,
      limit,
      hasMore: cappedTotal > (skip + usersList.length),
      maxRankingsShown: maxRankings,
      myRank,
      myCurrentStreak,
      myHighestStreak
    });
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
}

async function getPublicConfig(req, res) {
  res.json({
    maxRankingsShown: parseInt(process.env.MAX_RANKINGS_SHOWN) || 100,
    chatReadThresholdPct: parseInt(process.env.CHAT_READ_THRESHOLD_PCT) || 10
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

