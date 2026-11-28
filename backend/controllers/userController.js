const User = require('../models/User');
const Day = require('../models/Day');
const { calculateCurrentStreak, calculateHighestStreak } = require('./dayController');
const Achievement = require('../models/Achievement');
const Group = require('../models/Group');
const Badge = require('../models/Badge');
const ProfileShare = require('../models/ProfileShare');
const crypto = require('crypto');
const usernameTrie = require('../utils/usernameTrie');


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
 * Searches for users by username using an in-memory Prefix Tree (Trie)
 * backed by an indexed lowercase query on cold start.
 */
async function searchUsers(req, res) {
  try {
    const q = (req.query.q || '').trim();
    if (q.length < 1) return res.json([]);

    await usernameTrie.ensureLoaded(User);
    const matches = usernameTrie.searchPrefix(q, 10);
    res.json(matches);
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
}

/**
 * GET /api/users/:username
 * Fast profile summary (identity, streaks, badges, groupCount).
 * Activity graph is loaded asynchronously via GET /api/users/:username/graph.
 * Strictly omits private achievements when showPrivateDetails === false.
 */
async function getPublicProfile(req, res) {
  try {
    const username = req.params.username.toLowerCase();

    const user = await User.findOne({ username }).populate('claimedBadges').lean();
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    const { code } = req.query;
    let showPrivateDetails = user.isPublicProfile !== false;

    if (!showPrivateDetails && code) {
      const validShare = await ProfileShare.findOne({
        userId: user._id,
        shareCode: code,
        expiresAt: { $gt: new Date() }
      }).lean();
      if (validShare) {
        showPrivateDetails = true;
      }
    }

    // Strict privacy: never query or return achievements when profile is private
    const canViewAchievements = showPrivateDetails && (user.achievementsPublic !== false || Boolean(code));

    const [rawAchs, groupCount] = await Promise.all([
      canViewAchievements
        ? Achievement.find({ userId: user._id }).sort({ date: -1 }).limit(10).lean()
        : Promise.resolve([]),
      Group.countDocuments({ members: user._id }),
    ]);

    const achievements = rawAchs.map(obj => {
      if (obj.photos && obj.photos.length > 0) {
        obj.photos = obj.photos.map(p => ({
          ...p,
          thumbnailUrl: (p.thumbnailUrl || p.url || '').replace(/\/upload\/c_fill,w_\d+,h_\d+[^/]*\//, '/upload/c_limit,w_800,q_auto,f_auto/')
        }));
      }
      return obj;
    });

    const isPremium = user.subscriptionTier === 'premium' &&
      (!user.subscriptionExpiresAt || new Date(user.subscriptionExpiresAt) > new Date());

    res.json({
      _id: user._id,
      username: user.username,
      name: user.name,
      profilePicture: user.profilePicture,
      currentStreak: user.currentStreak || 0,
      highestStreak: user.highestStreak || 0,
      groupCount: groupCount,
      days: [],
      achievements: achievements,
      achievementsPublic: showPrivateDetails && user.achievementsPublic !== false,
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

/**
 * GET /api/users/:username/graph
 * Asynchronous endpoint for the Activity Graph (contribution counts only).
 * Visible on both public and private profiles without exposing task/goal text.
 */
async function getPublicProfileGraph(req, res) {
  try {
    const username = req.params.username.toLowerCase();
    const { code } = req.query;

    const user = await User.findOne({ username })
      .select('_id isPublicProfile achievementsPublic')
      .lean();
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    let showPrivateDetails = user.isPublicProfile !== false;
    if (!showPrivateDetails && code) {
      const validShare = await ProfileShare.findOne({
        userId: user._id,
        shareCode: code,
        expiresAt: { $gt: new Date() }
      }).lean();
      if (validShare) showPrivateDetails = true;
    }

    const canViewAchievements = showPrivateDetails && (user.achievementsPublic !== false || Boolean(code));

    const daysRaw = await Day.find({ userId: user._id })
      .select('date categories.name categories.tasks.completed')
      .lean();

    const contributionData = [];
    for (const day of daysRaw) {
      let completedCount = 0;
      if (day.categories) {
        for (const cat of day.categories) {
          if (cat.name && cat.name.startsWith('🎯 Goal:') && !canViewAchievements) {
            continue;
          }
          if (cat.tasks) {
            for (const task of cat.tasks) {
              if (task.completed) completedCount++;
            }
          }
        }
      }
      contributionData.push({ date: day.date, completedCount });
    }

    res.json({
      contributionData,
      totalDays: daysRaw.length
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

    // Strict Privacy Check (no isOwner exception)
    let canView = user.isPublicProfile !== false;
    let validShare = false;
    if (!canView && code) {
      const shareDoc = await ProfileShare.findOne({ userId: user._id, shareCode: code, expiresAt: { $gt: new Date() } }).lean();
      if (shareDoc) { canView = true; validShare = true; }
    }

    if (!canView) return res.status(403).json({ message: 'This profile is private' });

    const canViewAchievements = user.achievementsPublic !== false || validShare;

    const page = parseInt(req.query.page) || 1;
    const limit = 7;
    const skip = (page - 1) * limit;

    const daysRaw = await Day.find({ userId: user._id })
      .sort({ date: -1 })
      .skip(skip)
      .limit(limit)
      .lean();

    const days = daysRaw.map(day => {
      const sanitizedCategories = (day.categories || [])
        .filter(cat => {
          if (!canViewAchievements && cat.name && cat.name.startsWith('🎯 Goal:')) {
            return false; // Filter out goal categories if achievements are private
          }
          return true;
        })
        .map(cat => ({
          name: cat.name,
          tasks: (cat.tasks || []).map(t => ({ title: t.title, completed: t.completed }))
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

    // Strict Privacy Check (no isOwner exception)
    let canView = user.isPublicProfile !== false;
    let validShare = false;
    if (!canView && code) {
      const shareDoc = await ProfileShare.findOne({ userId: user._id, shareCode: code, expiresAt: { $gt: new Date() } }).lean();
      if (shareDoc) { canView = true; validShare = true; }
    }

    if (!canView) return res.status(403).json({ message: 'This profile is private' });

    if (user.achievementsPublic === false && !validShare) {
      return res.status(403).json({ message: 'Achievements are private', achievementsPublic: false });
    }

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

    // 1. Read-only leaderboard query (streaks are already maintained by dayController on task changes)
    const d = new Date();
    const serverToday = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    const [y, m, dayNum] = serverToday.split('-').map(Number);
    const prev = new Date(y, m - 1, dayNum - 1);
    const yesterday = `${prev.getFullYear()}-${String(prev.getMonth() + 1).padStart(2, '0')}-${String(prev.getDate()).padStart(2, '0')}`;

    const query = {
      showOnLeaderboard: { $ne: false },
      username: { $exists: true, $ne: null },
      isBlacklisted: { $ne: true },
      isEmailVerified: true
    };
    if (sortField === 'currentStreak') {
      query.lastCompletedDate = { $gte: yesterday };
    }

    const [usersRaw, realTotal, activeUser] = await Promise.all([
      User.find(query)
        .select('name username profilePicture currentStreak highestStreak lastActiveAt subscriptionTier subscriptionExpiresAt')
        .sort({ [sortField]: -1, lastActiveAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      User.countDocuments(query),
      (req.user && req.user.userId)
        ? User.findById(req.user.userId).select('username isBlacklisted currentStreak highestStreak lastCompletedDate lastActiveAt').lean()
        : Promise.resolve(null),
    ]);

    const maxRankings = parseInt(process.env.MAX_RANKINGS_SHOWN) || 100;
    const cappedTotal = Math.min(realTotal, maxRankings);

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

    // 2. Compute active user's rank using stored streak fields (no Day collection scan)
    let myRank = null;
    let myCurrentStreak = null;
    let myHighestStreak = null;
    if (activeUser && activeUser.username && !activeUser.isBlacklisted) {
      const isStreakFresh = activeUser.lastCompletedDate && activeUser.lastCompletedDate >= yesterday;
      myCurrentStreak = isStreakFresh ? (activeUser.currentStreak || 0) : 0;
      myHighestStreak = activeUser.highestStreak || 0;

      const scoreVal = sortField === 'currentStreak' ? myCurrentStreak : myHighestStreak;
      const lastActive = activeUser.lastActiveAt || new Date(0);

      const aheadCount = await User.countDocuments({
        ...query,
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
  const enableDarkBrutalistTheme = String(process.env.ENABLE_DARK_BRUTALIST_THEME).toLowerCase() === 'true';
  res.json({
    maxRankingsShown: parseInt(process.env.MAX_RANKINGS_SHOWN) || 100,
    chatReadThresholdPct: parseInt(process.env.CHAT_READ_THRESHOLD_PCT) || 10,
    enableDarkBrutalistTheme
  });
}

module.exports = {
  searchUsers,
  getPublicProfile,
  getPublicProfileGraph,
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

