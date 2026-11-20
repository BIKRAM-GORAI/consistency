const bcrypt = require('bcrypt');
const crypto = require('crypto');
const User = require('../models/User');
const Day = require('../models/Day');

// Helper to check authorization for cron calls (timing-safe)
function checkCronAuth(req, res) {
  const cronSecret = process.env.CRON_SECRET;
  const authHeader = req.headers.authorization;

  if (!cronSecret || !authHeader) {
    res.status(401).json({ message: 'Unauthorized: CRON_SECRET is not configured or auth header missing' });
    return false;
  }

  const expected = `Bearer ${cronSecret}`;
  const a = Buffer.from(authHeader, 'utf8');
  const b = Buffer.from(expected, 'utf8');

  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    res.status(401).json({ message: 'Unauthorized: Invalid cron authorization token' });
    return false;
  }
  return true;
}

// 5 default realistic archetypes
const DEFAULT_BOTS = [
  {
    name: 'Vikram Malhotra',
    username: 'vikram_m',
    email: 'bot_vikram@consistency.internal',
    profilePicture: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=200&h=200&fit=crop&crop=faces&auto=format&q=80',
    strategy: 'continuous',
    initialStreak: 89,
    highestStreak: 89,
    targetStreakMin: 60,
    targetStreakMax: 150,
    dropProbability: 0.0,
    taskPool: [
      {
        category: 'Deep Work',
        tasks: ['Code Review & Core Architecture', 'System Design Document draft', 'Optimize slow queries']
      },
      {
        category: 'Fitness & Health',
        tasks: ['5km Morning Run', 'Meditation (15m)', '100 pushups']
      }
    ]
  },
  {
    name: 'Aisha Chen',
    username: 'aishacodes',
    email: 'bot_aisha@consistency.internal',
    profilePicture: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=200&h=200&fit=crop&crop=faces&auto=format&q=80',
    strategy: 'continuous',
    initialStreak: 78,
    highestStreak: 78,
    targetStreakMin: 50,
    targetStreakMax: 120,
    dropProbability: 0.0,
    taskPool: [
      {
        category: 'Engineering',
        tasks: ['LeetCode Daily Problem', 'Implement Redis Cache pattern', 'Read 2 RFC articles']
      },
      {
        category: 'Wellbeing',
        tasks: ['Gym: Leg & Core day', 'Hydration Goal (3 Litres)', 'Evening reflection']
      }
    ]
  },
  {
    name: 'Rohan Sharma',
    username: 'rohan_dev',
    email: 'bot_rohan@consistency.internal',
    profilePicture: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=200&h=200&fit=crop&crop=faces&auto=format&q=80',
    strategy: 'fluctuating',
    initialStreak: 42,
    highestStreak: 65,
    targetStreakMin: 25,
    targetStreakMax: 50,
    dropProbability: 0.07,
    taskPool: [
      {
        category: 'Development',
        tasks: ['Fullstack Project features', 'University Exam Revision', 'Bug triage']
      },
      {
        category: 'Habits',
        tasks: ['10,000 steps walk', 'Guitar practice (20 mins)', 'Read 1 chapter']
      }
    ]
  },
  {
    name: 'Elena Rostova',
    username: 'elena_r',
    email: 'bot_elena@consistency.internal',
    profilePicture: 'https://images.unsplash.com/photo-1517841905240-472988babdf9?w=200&h=200&fit=crop&crop=faces&auto=format&q=80',
    strategy: 'fluctuating',
    initialStreak: 27,
    highestStreak: 48,
    targetStreakMin: 18,
    targetStreakMax: 40,
    dropProbability: 0.09,
    taskPool: [
      {
        category: 'Writing & Learning',
        tasks: ['Technical blog post draft', 'Duolingo Spanish (15m)', 'Note taking on productivity']
      },
      {
        category: 'Health',
        tasks: ['Pilates workout', '3L Water tracking', 'Screen-free bedtime (30m)']
      }
    ]
  },
  {
    name: 'Marcus Vance',
    username: 'marcus_v',
    email: 'bot_marcus@consistency.internal',
    profilePicture: 'https://images.unsplash.com/photo-1539571696357-5a69c17a67c6?w=200&h=200&fit=crop&crop=faces&auto=format&q=80',
    strategy: 'fluctuating',
    initialStreak: 16,
    highestStreak: 32,
    targetStreakMin: 12,
    targetStreakMax: 30,
    dropProbability: 0.12,
    taskPool: [
      {
        category: 'Design & Build',
        tasks: ['UI/UX Mobile Wireframes', 'Component library updates', 'Solve 1 algorithmic puzzle']
      },
      {
        category: 'Daily Discipline',
        tasks: ['Morning cold shower', 'Read 20 pages non-fiction', 'Stretching routine']
      }
    ]
  }
];

function getTodayString() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function getDateNDaysAgo(n) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/**
 * Generates realistic randomized tasks from the bot's task pool:
 * - Guaranteed at least 1 task completed (maintains valid streak activity).
 * - Avoids 100% completion so bots feel naturally human (completing 1 to total-1 tasks).
 */
function generateRealisticBotTasks(taskPool) {
  const pool = taskPool && taskPool.length > 0 ? taskPool : [
    { category: 'Daily Focus', tasks: ['Deep Work Sprint', 'Physical Exercise (30m)', 'Read 15 Pages'] }
  ];

  const allTasks = [];
  pool.forEach((cat, cIdx) => {
    (cat.tasks || []).forEach(t => {
      allTasks.push({ catName: cat.category, cIdx, taskTitle: t });
    });
  });

  if (allTasks.length === 0) {
    allTasks.push({ catName: 'Daily Focus', cIdx: 0, taskTitle: 'Consistent Deep Work Session' });
  }

  // Determine how many tasks are completed: at least 1, but never 100% if >1 tasks
  const total = allTasks.length;
  let targetCompletedCount = 1;
  if (total > 1) {
    // Randomly pick between 1 and total - 1
    targetCompletedCount = 1 + Math.floor(Math.random() * (total - 1));
  }

  // Shuffle task indices to randomly select which ones are completed
  const indices = allTasks.map((_, i) => i);
  for (let i = indices.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [indices[i], indices[j]] = [indices[j], indices[i]];
  }
  const completedIndicesSet = new Set(indices.slice(0, targetCompletedCount));

  // Re-group into category structure
  const categoriesMap = {};
  pool.forEach((cat, cIdx) => {
    categoriesMap[cat.category] = {
      name: cat.category,
      color: cIdx === 0 ? '#ffea79' : '#a855f7',
      tasks: []
    };
  });

  allTasks.forEach((item, globalIdx) => {
    const isCompleted = completedIndicesSet.has(globalIdx);
    if (!categoriesMap[item.catName]) {
      categoriesMap[item.catName] = {
        name: item.catName,
        color: '#ffea79',
        tasks: []
      };
    }
    categoriesMap[item.catName].tasks.push({
      title: item.taskTitle,
      text: item.taskTitle,
      completed: isCompleted,
      time: '08:30'
    });
  });

  return Object.values(categoriesMap).filter(cat => cat.tasks.length > 0);
}

/**
 * Generates historical Day records for a bot to accurately reflect both their
 * currentStreak and their highestStreak on their contribution graph and profile.
 * - Current streak: continuous active run ending today.
 * - If highestStreak > currentStreak: seeds a gap, then seeds the full previous highestStreak run!
 * - Also adds older intermittent activity so the contribution graph looks rich and human.
 */
async function generateBotHistoryDays(userId, taskPool, currentStreak, highestStreak) {
  // Clear any existing past day cards for this bot
  await Day.deleteMany({ userId });

  const dayDocs = [];
  const curr = Math.max(1, parseInt(currentStreak) || 1);
  const highest = Math.max(curr, parseInt(highestStreak) || curr);

  // 1. Current streak block: continuous run of `curr` days ending today (day 0)
  for (let i = curr - 1; i >= 0; i--) {
    const dateStr = getDateNDaysAgo(i);
    const categories = generateRealisticBotTasks(taskPool);
    dayDocs.push({
      userId,
      date: dateStr,
      summary: `Consistency session on ${dateStr}`,
      categories
    });
  }

  // 2. Previous peak streak block (if highest > curr)
  if (highest > curr) {
    // Gap of 2 days where the previous streak broke
    const gapDays = 2;
    const prevStreakStartAgo = curr + gapDays;
    const prevStreakEndAgo = prevStreakStartAgo + highest - 1;

    for (let i = prevStreakEndAgo; i >= prevStreakStartAgo; i--) {
      const dateStr = getDateNDaysAgo(i);
      const categories = generateRealisticBotTasks(taskPool);
      dayDocs.push({
        userId,
        date: dateStr,
        summary: `Consistency session on ${dateStr}`,
        categories
      });
    }

    // Additional older warmup block (10-15 days) separated by 3 days
    const olderGap = 3;
    const olderStartAgo = prevStreakEndAgo + olderGap + 1;
    const olderLength = Math.min(15, Math.max(6, Math.floor(highest * 0.3)));
    const olderEndAgo = olderStartAgo + olderLength - 1;

    for (let i = olderEndAgo; i >= olderStartAgo; i--) {
      const dateStr = getDateNDaysAgo(i);
      const categories = generateRealisticBotTasks(taskPool);
      dayDocs.push({
        userId,
        date: dateStr,
        summary: `Consistency session on ${dateStr}`,
        categories
      });
    }
  } else {
    // highest === curr: active streak IS the all-time highest streak.
    // Add a smaller prior streak (e.g. 20-30 days, strictly less than curr) separated by a gap
    const gapDays = 3;
    const priorStreakStartAgo = curr + gapDays;
    const priorStreakLength = Math.min(30, Math.max(10, Math.floor(curr * 0.4)));
    const priorStreakEndAgo = priorStreakStartAgo + priorStreakLength - 1;

    for (let i = priorStreakEndAgo; i >= priorStreakStartAgo; i--) {
      const dateStr = getDateNDaysAgo(i);
      const categories = generateRealisticBotTasks(taskPool);
      dayDocs.push({
        userId,
        date: dateStr,
        summary: `Consistency session on ${dateStr}`,
        categories
      });
    }
  }

  if (dayDocs.length > 0) {
    await Day.insertMany(dayDocs);
  }

  return dayDocs.length;
}

/**
 * Seed or Re-seed the 5 competitor bots and their historical Day records.
 */
async function seedBots(req, res) {
  try {
    const todayStr = getTodayString();
    const seededBots = [];

    for (const b of DEFAULT_BOTS) {
      let user = await User.findOne({ $or: [{ username: b.username }, { email: b.email }] });
      
      const randomPassword = crypto.randomBytes(16).toString('hex');
      const hashedPassword = await bcrypt.hash(randomPassword, 10);

      const botConfigData = {
        strategy: b.strategy,
        targetStreakMin: b.targetStreakMin,
        targetStreakMax: b.targetStreakMax,
        dropProbability: b.dropProbability,
        isActive: true,
        taskPool: b.taskPool
      };

      if (!user) {
        user = new User({
          name: b.name,
          username: b.username,
          email: b.email,
          password: hashedPassword,
          profilePicture: b.profilePicture,
          isBot: true,
          isEmailVerified: true,
          isPublicProfile: false, // Strict privacy: normal users cannot view their tasks
          showOnLeaderboard: true,
          botConfig: botConfigData,
          currentStreak: b.initialStreak,
          highestStreak: b.highestStreak,
          lastCompletedDate: todayStr,
          lastActiveAt: new Date()
        });
        await user.save();
      } else {
        user.isBot = true;
        user.isPublicProfile = false;
        // Strictly preserve custom name & custom uploaded profile DP
        if (!user.name) user.name = b.name;
        if (!user.profilePicture) user.profilePicture = b.profilePicture;

        // Preserve customized botConfig, falling back to defaults if not set
        user.botConfig = {
          strategy: user.botConfig?.strategy || b.strategy,
          targetStreakMin: user.botConfig?.targetStreakMin || b.targetStreakMin,
          targetStreakMax: user.botConfig?.targetStreakMax || b.targetStreakMax,
          dropProbability: user.botConfig?.dropProbability ?? b.dropProbability,
          isActive: user.botConfig?.isActive ?? true,
          taskPool: (user.botConfig?.taskPool && user.botConfig.taskPool.length > 0)
            ? user.botConfig.taskPool
            : b.taskPool
        };

        // Preserve custom streak values if they exist, or fall back to defaults
        if (user.currentStreak === undefined || user.currentStreak === null) {
          user.currentStreak = b.initialStreak;
        }
        if (user.highestStreak === undefined || user.highestStreak === null) {
          user.highestStreak = b.highestStreak;
        }

        user.lastCompletedDate = todayStr;
        user.lastActiveAt = new Date();
        await user.save();
      }

      const activeTaskPool = (user.botConfig?.taskPool && user.botConfig.taskPool.length > 0)
        ? user.botConfig.taskPool
        : b.taskPool;

      // Generate realistic past Day cards that reflect BOTH current streak and highest streak on the graph
      const daysSeededCount = await generateBotHistoryDays(
        user._id,
        activeTaskPool,
        user.currentStreak || b.initialStreak,
        user.highestStreak || b.highestStreak
      );

      seededBots.push({
        id: user._id,
        name: user.name,
        username: user.username,
        currentStreak: user.currentStreak,
        highestStreak: user.highestStreak,
        strategy: user.botConfig.strategy,
        daysSeeded: daysSeededCount
      });
    }

    res.json({
      success: true,
      message: `Successfully seeded ${seededBots.length} competitor bots with historical task logs.`,
      bots: seededBots
    });
  } catch (err) {
    console.error('[botController:seedBots] Error:', err);
    res.status(500).json({ success: false, message: 'Server error seeding bots', error: err.message });
  }
}

/**
 * Get all competitor bots for Admin Dashboard.
 */
async function getAdminBots(req, res) {
  try {
    const todayStr = getTodayString();
    const bots = await User.find({ isBot: true })
      .select('name username email profilePicture currentStreak highestStreak showOnLeaderboard lastCompletedDate lastActiveAt botConfig')
      .sort({ currentStreak: -1 });

    const enhancedBots = await Promise.all(bots.map(async (b) => {
      const loggedToday = b.lastCompletedDate === todayStr;
      const totalDaysLogged = await Day.countDocuments({ userId: b._id });
      return {
        _id: b._id,
        name: b.name,
        username: b.username,
        email: b.email,
        profilePicture: b.profilePicture,
        currentStreak: b.currentStreak,
        highestStreak: b.highestStreak,
        showOnLeaderboard: b.showOnLeaderboard !== false,
        lastCompletedDate: b.lastCompletedDate,
        lastActiveAt: b.lastActiveAt,
        loggedToday,
        totalDaysLogged,
        botConfig: b.botConfig || {}
      };
    }));

    res.json({ success: true, bots: enhancedBots });
  } catch (err) {
    console.error('[botController:getAdminBots] Error:', err);
    res.status(500).json({ success: false, message: 'Server error fetching bots', error: err.message });
  }
}

/**
 * Update an individual bot's configuration or status.
 */
async function updateBot(req, res) {
  try {
    const { id } = req.params;
    const {
      name,
      username,
      profilePicture,
      showOnLeaderboard,
      currentStreak,
      highestStreak,
      botConfig
    } = req.body;

    const bot = await User.findOne({ _id: id, isBot: true });
    if (!bot) {
      return res.status(404).json({ success: false, message: 'Bot not found' });
    }

    if (name !== undefined) bot.name = name.trim();
    if (username !== undefined) {
      const lowerUsername = username.trim().toLowerCase();
      const existing = await User.findOne({ username: lowerUsername, _id: { $ne: bot._id } });
      if (existing) {
        return res.status(400).json({ success: false, message: 'Username is already taken' });
      }
      bot.username = lowerUsername;
    }
    if (profilePicture !== undefined) bot.profilePicture = profilePicture;
    if (showOnLeaderboard !== undefined) bot.showOnLeaderboard = Boolean(showOnLeaderboard);
    let streakChanged = false;
    if (currentStreak !== undefined) {
      const newCurr = Math.max(0, parseInt(currentStreak) || 0);
      if (newCurr !== bot.currentStreak) {
        bot.currentStreak = newCurr;
        streakChanged = true;
      }
    }
    if (highestStreak !== undefined) {
      const newHigh = Math.max(bot.currentStreak, parseInt(highestStreak) || 0);
      if (newHigh !== bot.highestStreak) {
        bot.highestStreak = newHigh;
        streakChanged = true;
      }
    }

    if (botConfig && typeof botConfig === 'object') {
      bot.botConfig = {
        ...bot.botConfig?.toObject?.() || bot.botConfig || {},
        ...botConfig
      };
    }

    if (streakChanged) {
      const pool = bot.botConfig?.taskPool || [];
      await generateBotHistoryDays(bot._id, pool, bot.currentStreak, bot.highestStreak);
      bot.lastCompletedDate = getTodayString();
      bot.lastActiveAt = new Date();
    }

    await bot.save();
    res.json({ success: true, message: 'Bot updated successfully', bot });
  } catch (err) {
    console.error('[botController:updateBot] Error:', err);
    res.status(500).json({ success: false, message: 'Server error updating bot', error: err.message });
  }
}

/**
 * Delete a bot and its historical data.
 */
async function deleteBot(req, res) {
  try {
    const { id } = req.params;
    const bot = await User.findOne({ _id: id, isBot: true });
    if (!bot) return res.status(404).json({ success: false, message: 'Bot not found' });

    await Day.deleteMany({ userId: bot._id });
    await User.deleteOne({ _id: bot._id });

    res.json({ success: true, message: 'Bot deleted successfully' });
  } catch (err) {
    console.error('[botController:deleteBot] Error:', err);
    res.status(500).json({ success: false, message: 'Server error deleting bot', error: err.message });
  }
}

/**
 * Execute the simulation for today across all active bots.
 */
async function runBotSimulationLogic() {
  const todayStr = getTodayString();
  const bots = await User.find({ isBot: true });
  const results = [];

  for (const bot of bots) {
    const config = bot.botConfig || {};
    if (config.isActive === false) {
      results.push({ username: bot.username, status: 'skipped', reason: 'Bot is disabled' });
      continue;
    }

    // Check if already completed today
    const alreadyLogged = await Day.findOne({ userId: bot._id, date: todayStr });
    if (alreadyLogged) {
      results.push({ username: bot.username, status: 'already_completed', streak: bot.currentStreak });
      continue;
    }

    const isContinuous = config.strategy === 'continuous';
    let shouldLogToday = true;

    if (!isContinuous) {
      // Fluctuating Strategy: Check if it's above minimum threshold and rolls to drop streak
      const minStreak = config.targetStreakMin || 20;
      const dropProb = config.dropProbability || 0.08;

      if (bot.currentStreak >= minStreak && Math.random() < dropProb) {
        shouldLogToday = false;
      }
    }

    if (shouldLogToday) {
      // Build task categories with realistic human completion variance (>=1 task completed, not 100%)
      const taskPool = config.taskPool && config.taskPool.length > 0 ? config.taskPool : [
        { category: 'Daily Focus', tasks: ['Consistent Deep Work Session', 'Physical Exercise (30m)', 'Read 15 Pages'] }
      ];

      const categories = generateRealisticBotTasks(taskPool);

      await Day.create({
        userId: bot._id,
        date: todayStr,
        summary: `Consistent session completed on ${todayStr}`,
        categories
      });

      bot.currentStreak = (bot.currentStreak || 0) + 1;
      if (bot.currentStreak > (bot.highestStreak || 0)) {
        bot.highestStreak = bot.currentStreak;
      }
      bot.lastCompletedDate = todayStr;
      bot.lastActiveAt = new Date();
      await bot.save();

      results.push({ username: bot.username, status: 'logged', newStreak: bot.currentStreak });
    } else {
      // Simulated miss: Bot takes a realistic rest day. Reset streak to 1 to begin rebuilding next day.
      bot.currentStreak = 1;
      bot.lastActiveAt = new Date();
      await bot.save();

      results.push({ username: bot.username, status: 'rest_day', newStreak: bot.currentStreak });
    }
  }

  return { today: todayStr, results };
}

/**
 * Admin manual trigger endpoint
 */
async function runBotSimulation(req, res) {
  try {
    const aiServiceUrl = process.env.AI_SERVICE_URL;
    if (aiServiceUrl) {
      try {
        const authSecret = process.env.CRON_SECRET || process.env.AI_SERVICE_SECRET || '';
        const resp = await fetch(`${aiServiceUrl}/api/cron/simulate-bots`, {
          headers: { Authorization: `Bearer ${authSecret}` }
        });
        const data = await resp.json();
        return res.status(resp.status).json(data);
      } catch (proxyErr) {
        console.warn('[botController:runBotSimulation] Render proxy failed, falling back to local run:', proxyErr.message);
      }
    }
    const outcome = await runBotSimulationLogic();
    res.json({ success: true, message: 'Simulation executed for today', ...outcome });
  } catch (err) {
    console.error('[botController:runBotSimulation] Error:', err);
    res.status(500).json({ success: false, message: 'Simulation failed', error: err.message });
  }
}

/**
 * Cron scheduled trigger endpoint
 */
async function runBotSimulationCron(req, res) {
  if (!checkCronAuth(req, res)) return;
  try {
    const outcome = await runBotSimulationLogic();
    res.json({ success: true, message: 'Cron bot simulation finished', ...outcome });
  } catch (err) {
    console.error('[botController:runBotSimulationCron] Error:', err);
    res.status(500).json({ success: false, message: 'Cron simulation failed', error: err.message });
  }
}

/**
 * Get recent Day logs for a specific bot (for admin inspection)
 */
async function getBotDays(req, res) {
  try {
    const { id } = req.params;
    const bot = await User.findOne({ _id: id, isBot: true });
    if (!bot) return res.status(404).json({ success: false, message: 'Bot not found' });

    const days = await Day.find({ userId: bot._id })
      .sort({ date: -1 })
      .limit(30);

    res.json({ success: true, bot: { name: bot.name, username: bot.username }, days });
  } catch (err) {
    console.error('[botController:getBotDays] Error:', err);
    res.status(500).json({ success: false, message: 'Error fetching bot days', error: err.message });
  }
}

module.exports = {
  seedBots,
  getAdminBots,
  updateBot,
  deleteBot,
  runBotSimulation,
  runBotSimulationCron,
  getBotDays
};
