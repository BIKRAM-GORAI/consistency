const axios = require('axios');
const jwt = require('jsonwebtoken');
const Day = require('../models/Day');
const User = require('../models/User');
const WeeklySummary = require('../models/WeeklySummary');
const Achievement = require('../models/Achievement');
const AppLimit = require('../models/AppLimit');

/**
 * Gets the daily limit configured in the environment variables, defaulting to 15.
 */
const getAiDailyLimit = () => {
  const limitVal = parseInt(process.env.AI_DAILY_LIMIT, 10);
  return isNaN(limitVal) ? 15 : limitVal;
};

/**
 * Checks the user's daily AI summary generation count, resetting it if a calendar day has passed.
 */
const checkAiLimit = async (userId) => {
  const user = await User.findById(userId);
  if (!user) {
    const err = new Error('User not found.');
    err.status = 404;
    throw err;
  }

  const now = new Date();
  const lastReset = user.aiGenerationResetTime ? new Date(user.aiGenerationResetTime) : new Date(0);

  // Compare calendar days
  if (now.toDateString() !== lastReset.toDateString()) {
    user.aiGenerationCount = 0;
    user.aiGenerationResetTime = now;
    await user.save();
  }

  const limit = getAiDailyLimit();
  const generationsLeft = Math.max(0, limit - user.aiGenerationCount);
  return { user, generationsLeft, limit };
};

/**
 * Increments the user's daily AI summary generation count upon successful generation.
 */
const incrementAiLimit = async (user) => {
  user.aiGenerationCount += 1;
  await user.save();
  const limit = getAiDailyLimit();
  return Math.max(0, limit - user.aiGenerationCount);
};

/**
 * GET /api/ai/generations-left
 * Fetches the remaining daily AI generations count.
 */
exports.getGenerationsLeft = async (req, res) => {
  try {
    const userId = req.user.userId;
    const { generationsLeft, limit } = await checkAiLimit(userId);
    res.status(200).json({ generationsLeft, limit });
  } catch (error) {
    console.error('[Vercel-Backend] getGenerationsLeft error:', error.message);
    res.status(error.status || 500).json({ message: error.message || 'Internal Server Error' });
  }
};

/**
 * Generates an AI productivity summary for a single day, persisting it in the Day model.
 */
exports.generateDailySummary = async (req, res) => {
  try {
    const { date } = req.params;
    const userId = req.user.userId; // From auth middleware

    if (!date) {
      return res.status(400).json({ message: 'Date parameter is required (format: YYYY-MM-DD).' });
    }

    // 1. Enforce Daily AI Summary Rate Limiting
    const { user, generationsLeft, limit } = await checkAiLimit(userId);
    if (generationsLeft <= 0) {
      return res.status(429).json({
        message: `Daily AI generation limit reached. You can generate up to ${limit} insights per day.`
      });
    }

    // Retrieve the Day document
    const day = await Day.findOne({ userId, date });
    if (!day) {
      return res.status(404).json({ message: 'No day sheet found for this date. Please create tasks first.' });
    }

    // Retrieve achievements logged for this day
    const achievements = await Achievement.find({ userId, dayId: day._id });
    let achievementsStr = '';
    if (achievements && achievements.length > 0) {
      achievementsStr = achievements.map(a => `- ${a.title}`).join('\n');
    }

    // Process and format tasks for the prompt
    let totalTasks = 0;
    let completedTasks = 0;
    let taskListStr = '';

    if (day.categories && day.categories.length > 0) {
      day.categories.forEach(cat => {
        taskListStr += `\nCategory: ${cat.name}\n`;
        if (cat.tasks && cat.tasks.length > 0) {
          cat.tasks.forEach(t => {
            totalTasks++;
            if (t.completed) completedTasks++;
            taskListStr += `- [${t.completed ? 'x' : ' '}] ${t.title}\n`;
          });
        } else {
          taskListStr += `  (No tasks)\n`;
        }
      });
    }

    if (totalTasks === 0) {
      return res.status(400).json({ message: 'No tasks registered for today. Cannot generate AI insights.' });
    }

    const completionRate = Math.round((completedTasks / totalTasks) * 100);

    // Fetch distraction app limits and actual screen times
    const appLimits = await AppLimit.findOne({ userId });
    let distractionStatsStr = '';
    if (appLimits && appLimits.apps && appLimits.apps.length > 0) {
      distractionStatsStr += `\nDistraction Limits Configuration (no matter enabled/disabled toggle status):\n`;
      appLimits.apps.forEach(app => {
        let actualMinutes = 0;
        if (day.screenTimeStats && typeof day.screenTimeStats === 'object') {
          if (Array.isArray(day.screenTimeStats)) {
            const found = day.screenTimeStats.find(a => a.packageName === app.packageName);
            if (found) actualMinutes = found.actualMinutes || 0;
          } else {
            actualMinutes = day.screenTimeStats[app.packageName] !== undefined ? day.screenTimeStats[app.packageName] : 0;
          }
        }
        const exceeded = actualMinutes > app.limitMinutes;
        distractionStatsStr += `- ${app.appName}: used ${actualMinutes} minutes (configured limit: ${app.limitMinutes} minutes) ${exceeded ? '[LIMIT EXCEEDED!]' : '[COMPLIANT/WITHIN LIMIT]'}\n`;
      });

      // Calculate total screen time foreground sum
      let totalMinutes = 0;
      if (day.screenTimeStats && typeof day.screenTimeStats === 'object') {
        if (Array.isArray(day.screenTimeStats)) {
          day.screenTimeStats.forEach(app => {
            totalMinutes += app.actualMinutes || 0;
          });
        } else {
          for (const pkg in day.screenTimeStats) {
            totalMinutes += day.screenTimeStats[pkg] || 0;
          }
        }
      }
      distractionStatsStr += `Total Mobile Screen Time Today: ${totalMinutes} minutes\n`;
    } else {
      distractionStatsStr += `\nNo distracting app limits configured for today.\n`;
    }

    // Formulate Groq/LLM prompts
    const systemPrompt = 
      "You are a highly analytical, realistic, and candid productivity coach. " +
      "Analyze the user's daily task completion data, achievements, and distraction screen time statistics for the date provided, and write a candid, honest, and highly concise daily summary. " +
      "Your response MUST start with a productivity score line on the first line in the exact format: '🏆 Productivity Rating: X/5' (where X is a score between 1 and 5). " +
      "Rate the day realistically: 5/5 means outstanding task completion rate, high achievements, and perfect distraction limit compliance (little or no distraction time). " +
      "Penalize the score heavily if task completion is low, if there are slacking behaviors, if total mobile screen time is excessive, or if any distraction app limits were exceeded. " +
      "Immediately following the productivity rating line, write exactly 3 to 4 short, punchy bullet points of maximum 1 to 2 sentences each analyzing the day. " +
      "Do NOT write in paragraph format. " +
      "Every single bullet point MUST occupy its own separate line starting with a standard hyphen and a space (e.g. '- Your point here'). Do NOT bundle multiple bullet points together or write them in a continuous paragraph. " +
      "The first 1 to 2 bullet points MUST showcase actual good accomplishments (completed productive tasks, high-quality focus hours). Do NOT count low-effort tasks like 'streak', 'maintain', 'tick', 'ok', 't' as achievements or good things; treat them strictly as empty filler tasks. " +
      "The last 1 to 2 bullet points MUST showcase realistic, direct, and slightly brutal critique/slacking warnings. Call out uncompleted important tasks, cheat streak-maintaining box-ticking behavior, excessive screen time, or blown distraction limits as a clear negative. " +
      "IMPORTANT: If there are no achievements logged for the day, DO NOT criticize or mention the lack of achievements in the critique/bad points. Treat achievements as purely optional bonuses: if logged, praise them; if missing, completely ignore them and skip any mention of achievements, focusing instead on other productive work completed or pending. " +
      "Maintain a premium, direct, and candid tone. Do NOT use introductory filler. Start directly with the '🏆 Productivity Rating: X/5' line.";

    const userPrompt = 
      `Date: ${date}\n` +
      `Completion Rate: ${completionRate}% (${completedTasks} completed out of ${totalTasks} total tasks)\n\n` +
      `Logged Achievements for Today:\n${achievementsStr || '(None logged)'}\n\n` +
      `Tasks Accomplished & Pending:\n${taskListStr}\n` +
      `${distractionStatsStr}`;

    const aiServiceUrl = process.env.AI_SERVICE_URL || 'http://localhost:5002';
    const aiServiceSecret = process.env.AI_SERVICE_SECRET;

    if (!aiServiceSecret) {
      console.error('[Vercel-Backend] Shared secret AI_SERVICE_SECRET is missing from environment.');
      return res.status(500).json({ message: 'AI configuration error on server.' });
    }

    console.log(`[Vercel-Backend] Proxying daily-summary for ${date} to AI service at ${aiServiceUrl}`);

    // Call Render AI Microservice
    const aiResponse = await axios.post(`${aiServiceUrl}/api/ai/generate`, {
      systemPrompt,
      userPrompt
    }, {
      headers: {
        'x-ai-service-secret': aiServiceSecret,
        'Content-Type': 'application/json'
      },
      timeout: 25000 // 25s timeout for AI response
    });

    const summaryText = aiResponse.data.result;
    if (!summaryText) {
      return res.status(502).json({ message: 'Failed to retrieve summary content from AI service.' });
    }

    // Save summary in MongoDB
    day.aiSummary = summaryText;
    await day.save();

    // 2. Increment Daily AI Summary counter upon successful generation
    const remaining = await incrementAiLimit(user);

    res.status(200).json({
      date,
      completionRate,
      summary: summaryText,
      aiSummary: summaryText,
      generationsLeft: remaining
    });

  } catch (error) {
    console.error('[Vercel-Backend] generateDailySummary error:', error.message);
    if (error.response) {
      console.error('[Vercel-Backend] AI service error response:', error.response.data);
      return res.status(error.response.status).json({
        message: 'AI Service Exception',
        details: error.response.data.error || error.response.data
      });
    }
    res.status(500).json({ message: 'Internal Server Error while generating daily insights.' });
  }
};

/**
 * Generates an AI-driven public productivity bio based on the user's task history over the last 7 days.
 */
exports.generateProductivityBio = async (req, res) => {
  try {
    const userId = req.user.userId;

    // Fetch the last 7 days of cards
    const pastDays = await Day.find({ userId }).sort({ date: -1 }).limit(7);
    if (!pastDays || pastDays.length === 0) {
      return res.status(400).json({ message: 'No task logs found. Complete tasks for a few days to generate an AI productivity profile!' });
    }

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ message: 'User not found.' });
    }

    // Compile historical metrics
    let totalTasks = 0;
    let completedTasks = 0;
    const categoryCounts = {};
    let activeDaysCount = pastDays.length;

    pastDays.forEach(day => {
      if (day.categories) {
        day.categories.forEach(cat => {
          categoryCounts[cat.name] = (categoryCounts[cat.name] || 0) + 1;
          if (cat.tasks) {
            cat.tasks.forEach(t => {
              totalTasks++;
              if (t.completed) completedTasks++;
            });
          }
        });
      }
    });

    if (totalTasks === 0) {
      return res.status(400).json({ message: 'No tasks found in past 7 days to analyze.' });
    }

    const avgCompletion = Math.round((completedTasks / totalTasks) * 100);
    
    // Sort categories by frequency
    const topCategories = Object.keys(categoryCounts)
      .sort((a, b) => categoryCounts[b] - categoryCounts[a])
      .slice(0, 3)
      .join(', ');

    const systemPrompt = 
      "You are an elite, modern productivity analyst. Analyze the user's weekly metrics and streak and " +
      "write a high-impact, professional productivity biography (1 to 2 short paragraphs, maximum 4 sentences total) " +
      "for their public profile. Highlight their work style, key strengths based on active categories, average completion rate, " +
      "and active streak status. Make it sound extremely professional, sleek, and premium (ideal for a developer/builder profile). " +
      "Start the bio immediately. Do not use conversational prefaces or title tags.";

    const userPrompt = 
      `User Profile Name: ${user.name}\n` +
      `Weekly Task Completion Rate: ${avgCompletion}%\n` +
      `Total Tasks Logged: ${totalTasks} (${completedTasks} completed)\n` +
      `Active Days Tracked: ${activeDaysCount} / 7 days\n` +
      `Primary Categories Focus: ${topCategories || 'General Tasks'}\n` +
      `Current Active Streak: ${user.currentStreak || 0} days\n` +
      `Highest Historical Streak: ${user.highestStreak || 0} days`;

    const aiServiceUrl = process.env.AI_SERVICE_URL || 'http://localhost:5002';
    const aiServiceSecret = process.env.AI_SERVICE_SECRET;

    if (!aiServiceSecret) {
      console.error('[Vercel-Backend] Shared secret AI_SERVICE_SECRET is missing from environment.');
      return res.status(500).json({ message: 'AI configuration error on server.' });
    }

    console.log(`[Vercel-Backend] Proxying productivity-bio for ${user.username || user.name} to AI service`);

    // Call Render AI Microservice
    const aiResponse = await axios.post(`${aiServiceUrl}/api/ai/generate`, {
      systemPrompt,
      userPrompt
    }, {
      headers: {
        'x-ai-service-secret': aiServiceSecret,
        'Content-Type': 'application/json'
      },
      timeout: 25000
    });

    const bioText = aiResponse.data.result;
    if (!bioText) {
      return res.status(502).json({ message: 'Failed to retrieve bio content from AI service.' });
    }

    // Save bio in MongoDB
    user.productivityBio = bioText;
    await user.save();

    res.status(200).json({
      username: user.username,
      productivityBio: bioText
    });

  } catch (error) {
    console.error('[Vercel-Backend] generateProductivityBio error:', error.message);
    if (error.response) {
      console.error('[Vercel-Backend] AI service error response:', error.response.data);
      return res.status(error.response.status).json({
        message: 'AI Service Exception',
        details: error.response.data.error || error.response.data
      });
    }
    res.status(500).json({ message: 'Internal Server Error while generating productivity profile.' });
  }
};

/**
 * Helper function to format date strings YYYY-MM-DD into "Month Date" (e.g. "May 24")
 */
function formatDateLabel(dateStr) {
  try {
    const [year, month, day] = dateStr.split('-');
    const date = new Date(year, month - 1, day);
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  } catch (err) {
    return dateStr;
  }
}

/**
 * Combines up to 7 preceding Day logs and triggers a single AI call to create a standalone WeeklySummary card.
 */
exports.generateWeeklySummary = async (req, res) => {
  try {
    const { dayId } = req.params;
    const userId = req.user.userId;

    if (!dayId) {
      return res.status(400).json({ message: 'Anchor Day ID parameter is required.' });
    }

    // 1. Enforce Daily AI Summary Rate Limiting
    const { user, generationsLeft, limit } = await checkAiLimit(userId);
    if (generationsLeft <= 0) {
      return res.status(429).json({
        message: `Daily AI generation limit reached. You can generate up to ${limit} insights per day.`
      });
    }

    // Retrieve the anchor Day document
    const anchorDay = await Day.findOne({ _id: dayId, userId });
    if (!anchorDay) {
      return res.status(404).json({ message: 'Anchor day card not found.' });
    }

    // Fetch the 6 chronologically preceding days (plus the anchor itself, totaling up to 7 cards)
    const consolidatedDays = await Day.find({
      userId,
      date: { $lte: anchorDay.date }
    })
    .sort({ date: -1 })
    .limit(7);

    if (!consolidatedDays || consolidatedDays.length === 0) {
      return res.status(404).json({ message: 'No cards found to summarize.' });
    }

    // Sort consolidated days chronologically oldest to newest for prompt consistency
    consolidatedDays.reverse();

    const oldestDate = consolidatedDays[0].date;
    const newestDate = consolidatedDays[consolidatedDays.length - 1].date;
    const rangeText = `${formatDateLabel(oldestDate)} - ${formatDateLabel(newestDate)}`;

    // Compile tasks and categories for prompt payload
    let totalTasks = 0;
    let completedTasks = 0;
    let taskListStr = '';
    const dayIds = [];

    consolidatedDays.forEach(day => {
      dayIds.push(day._id);
      taskListStr += `\n📅 Date: ${day.date}\n`;
      if (day.categories && day.categories.length > 0) {
        day.categories.forEach(cat => {
          taskListStr += `Category: ${cat.name}\n`;
          if (cat.tasks && cat.tasks.length > 0) {
            cat.tasks.forEach(t => {
              totalTasks++;
              if (t.completed) completedTasks++;
              taskListStr += `- [${t.completed ? 'x' : ' '}] ${t.title}\n`;
            });
          } else {
            taskListStr += `  (No tasks)\n`;
          }
        });
      }
    });

    if (totalTasks === 0) {
      return res.status(400).json({ message: 'No tasks found across the selected 7 days. Cannot generate AI wrap-up.' });
    }

    const completionRate = Math.round((completedTasks / totalTasks) * 100);

    // Fetch distraction app limits and compile screen times across these 7 days (regardless of active toggle status)
    const appLimits = await AppLimit.findOne({ userId });
    let distractionStatsStr = '';

    if (appLimits && appLimits.apps && appLimits.apps.length > 0) {
      distractionStatsStr += `\nDistraction Limits & Screen Time Compliance across the 7-day period (evaluated regardless of tracking toggle status):\n`;
      consolidatedDays.forEach(day => {
        let totalMinutes = 0;
        if (day.screenTimeStats && typeof day.screenTimeStats === 'object') {
          if (Array.isArray(day.screenTimeStats)) {
            day.screenTimeStats.forEach(app => {
              totalMinutes += app.actualMinutes || 0;
            });
          } else {
            for (const pkg in day.screenTimeStats) {
              totalMinutes += day.screenTimeStats[pkg] || 0;
            }
          }
        }
        distractionStatsStr += `Date: ${day.date} | Total Screen Time: ${totalMinutes} minutes\n`;
        appLimits.apps.forEach(app => {
          let actualMinutes = 0;
          if (day.screenTimeStats && typeof day.screenTimeStats === 'object') {
            if (Array.isArray(day.screenTimeStats)) {
              const found = day.screenTimeStats.find(a => a.packageName === app.packageName);
              if (found) actualMinutes = found.actualMinutes || 0;
            } else {
              actualMinutes = day.screenTimeStats[app.packageName] !== undefined ? day.screenTimeStats[app.packageName] : 0;
            }
          }
          const exceeded = actualMinutes > app.limitMinutes;
          distractionStatsStr += `- ${app.appName}: used ${actualMinutes}m (limit: ${app.limitMinutes}m) ${exceeded ? '[LIMIT EXCEEDED!]' : '[COMPLIANT/WITHIN LIMIT]'}\n`;
        });
      });
    } else {
      distractionStatsStr += `\nNo distracting app limits configured for the user.\n`;
    }

    const systemPrompt = 
      "You are an elite, modern productivity analyst. Your job is to analyze the user's completed and pending " +
      "tasks, achievements, and daily distraction screen time compliance across a 7-day period and write a highly concise, direct, and candid weekly wrap-up summary in a bulleted point format (exactly 3 to 4 short, punchy bullet points of maximum 1 to 2 sentences each). " +
      "Your response MUST start with a productivity score line on the first line in the exact format: '📊 Productivity Rating: X/10' (where X is a score between 1 and 10). " +
      "Rate the week realistically: 10/10 means outstanding task completion rate across the week, high achievements, and perfect distraction limit compliance (little or no distraction time, zero limits exceeded). " +
      "Penalize the rating out of 10 heavily if there are slacking behaviors, low task completions, high screen times, or exceeded distraction limits on any days. " +
      "Immediately following the productivity rating line, write exactly 3 to 4 short, punchy bullet points of maximum 1 to 2 sentences each analyzing the week. " +
      "Do NOT write in paragraph format. " +
      "Every single bullet point MUST occupy its own separate line starting with a standard hyphen and a space (e.g. '- Your point here'). Do NOT bundle multiple bullet points together or write them in a continuous paragraph. " +
      "The first 1 to 2 bullet points MUST showcase true accomplishments and highlight focus areas (completed high-impact categories, excellent consistency). Do NOT count empty, low-effort tasks (e.g. 'streak', 'maintain', 'tick', 'ok', 't') as positive consistency; ignore them. " +
      "The last 1 to 2 bullet points MUST showcase realistic and slightly brutal critique on slacking patterns, empty streak-maintaining behaviors (avoiding real, productive tasks while logging meaningless tasks just to keep a streak alive), excessive screen time, or blown distraction limits across the week. " +
      "IMPORTANT: If there are no achievements or major milestones completed, DO NOT write a negative point about the lack of achievements. Simply ignore any mention of achievements and focus on analyzing other completed work or actionable insights for the upcoming week. " +
      "Do NOT use conversational prefaces or title headings. Start directly with the '📊 Productivity Rating: X/10' line.";

    const userPrompt = 
      `Date Range: ${rangeText}\n` +
      `Days Count: ${consolidatedDays.length} days analyzed\n` +
      `Completion Rate: ${completionRate}% (${completedTasks} completed out of ${totalTasks} total tasks)\n\n` +
      `Historical Logs:\n${taskListStr}\n` +
      `${distractionStatsStr}`;

    const aiServiceUrl = process.env.AI_SERVICE_URL || 'http://localhost:5002';
    const aiServiceSecret = process.env.AI_SERVICE_SECRET;

    if (!aiServiceSecret) {
      console.error('[Vercel-Backend] Shared secret AI_SERVICE_SECRET is missing from environment.');
      return res.status(500).json({ message: 'AI configuration error on server.' });
    }

    console.log(`[Vercel-Backend] Proxying weekly-summary for anchor ${anchorDay.date} to AI service`);

    // Call Render AI Microservice
    const aiResponse = await axios.post(`${aiServiceUrl}/api/ai/generate`, {
      systemPrompt,
      userPrompt
    }, {
      headers: {
        'x-ai-service-secret': aiServiceSecret,
        'Content-Type': 'application/json'
      },
      timeout: 25000
    });

    const wrapUpText = aiResponse.data.result;
    if (!wrapUpText) {
      return res.status(502).json({ message: 'Failed to retrieve wrap-up content from AI service.' });
    }

    // Save standalone WeeklySummary document in MongoDB
    const weeklySummary = new WeeklySummary({
      userId,
      date: anchorDay.date, // anchor day YYYY-MM-DD
      summaryText: wrapUpText,
      rangeText,
      daysCount: consolidatedDays.length,
      dayIds
    });
    
    const savedSummary = await weeklySummary.save();

    // 2. Increment Daily AI Summary counter upon successful generation
    const remaining = await incrementAiLimit(user);

    res.status(200).json({
      ...savedSummary.toObject(),
      generationsLeft: remaining
    });

  } catch (error) {
    console.error('[Vercel-Backend] generateWeeklySummary error:', error.message);
    if (error.response) {
      console.error('[Vercel-Backend] AI service error response:', error.response.data);
      return res.status(error.response.status).json({
        message: 'AI Service Exception',
        details: error.response.data.error || error.response.data
      });
    }
    res.status(500).json({ message: 'Internal Server Error while generating weekly wrap-up.' });
  }
};

/**
 * Deletes a standalone WeeklySummary document by ID.
 */
exports.deleteWeeklySummary = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.userId;

    if (!id) {
      return res.status(400).json({ message: 'Summary card ID is required.' });
    }

    const deletedSummary = await WeeklySummary.findOneAndDelete({ _id: id, userId });
    if (!deletedSummary) {
      return res.status(404).json({ message: 'Summary card not found or unauthorized.' });
    }

    res.status(200).json({ message: 'Weekly summary deleted successfully.', deletedId: id });

  } catch (error) {
    console.error('[Vercel-Backend] deleteWeeklySummary error:', error.message);
    res.status(500).json({ message: 'Internal Server Error while deleting weekly summary card.' });
  }
};

/**
 * Fetches all standalone WeeklySummary documents for the authenticated user.
 */
exports.getWeeklySummaries = async (req, res) => {
  try {
    const userId = req.user.userId;
    const summaries = await WeeklySummary.find({ userId }).sort({ date: -1 });
    res.status(200).json(summaries);
  } catch (error) {
    console.error('[Vercel-Backend] getWeeklySummaries error:', error.message);
    res.status(500).json({ message: 'Internal Server Error while retrieving weekly summaries.' });
  }
};

/**
 * Combines up to 30 preceding Day logs and triggers an AI call to create a standalone 30-day (Monthly) Summary card.
 */
exports.generateMonthlySummary = async (req, res) => {
  try {
    const { dayId } = req.params;
    const userId = req.user.userId;

    if (!dayId) {
      return res.status(400).json({ message: 'Anchor Day ID parameter is required.' });
    }

    // 1. Enforce Daily AI Summary Rate Limiting
    const { user, generationsLeft, limit } = await checkAiLimit(userId);
    if (generationsLeft <= 0) {
      return res.status(429).json({
        message: `Daily AI generation limit reached. You can generate up to ${limit} insights per day.`
      });
    }

    // Retrieve the anchor Day document
    const anchorDay = await Day.findOne({ _id: dayId, userId });
    if (!anchorDay) {
      return res.status(404).json({ message: 'Anchor day card not found.' });
    }

    // Fetch up to 30 chronologically preceding days (including the anchor itself)
    const consolidatedDays = await Day.find({
      userId,
      date: { $lte: anchorDay.date }
    })
    .sort({ date: -1 })
    .limit(30);

    if (!consolidatedDays || consolidatedDays.length === 0) {
      return res.status(404).json({ message: 'No cards found to summarize.' });
    }

    // Sort consolidated days chronologically oldest to newest for prompt consistency
    consolidatedDays.reverse();

    const oldestDate = consolidatedDays[0].date;
    const newestDate = consolidatedDays[consolidatedDays.length - 1].date;
    const rangeText = `${formatDateLabel(oldestDate)} - ${formatDateLabel(newestDate)}`;

    // Compile tasks and categories for prompt payload
    let totalTasks = 0;
    let completedTasks = 0;
    let taskListStr = '';
    const dayIds = [];

    consolidatedDays.forEach(day => {
      dayIds.push(day._id);
      taskListStr += `\n📅 Date: ${day.date}\n`;
      if (day.categories && day.categories.length > 0) {
        day.categories.forEach(cat => {
          taskListStr += `Category: ${cat.name}\n`;
          if (cat.tasks && cat.tasks.length > 0) {
            cat.tasks.forEach(t => {
              totalTasks++;
              if (t.completed) completedTasks++;
              taskListStr += `- [${t.completed ? 'x' : ' '}] ${t.title}\n`;
            });
          } else {
            taskListStr += `  (No tasks)\n`;
          }
        });
      }
    });

    if (totalTasks === 0) {
      return res.status(400).json({ message: 'No tasks found across the selected 30 days. Cannot generate AI monthly summary.' });
    }

    // Fetch all achievements logged across these 30 days
    const achievements = await Achievement.find({ userId, dayId: { $in: dayIds } });
    let achievementsStr = '';
    if (achievements && achievements.length > 0) {
      achievementsStr = achievements.map(a => `- ${a.title}`).join('\n');
    }

    const completionRate = Math.round((completedTasks / totalTasks) * 100);

    // Fetch distraction app limits and compile screen times across these 30 days (regardless of active toggle status)
    const appLimits = await AppLimit.findOne({ userId });
    let distractionStatsStr = '';

    if (appLimits && appLimits.apps && appLimits.apps.length > 0) {
      distractionStatsStr += `\nDistraction Limits & Screen Time Compliance across the 30-day period (evaluated regardless of tracking toggle status):\n`;
      consolidatedDays.forEach(day => {
        let totalMinutes = 0;
        if (day.screenTimeStats && typeof day.screenTimeStats === 'object') {
          if (Array.isArray(day.screenTimeStats)) {
            day.screenTimeStats.forEach(app => {
              totalMinutes += app.actualMinutes || 0;
            });
          } else {
            for (const pkg in day.screenTimeStats) {
              totalMinutes += day.screenTimeStats[pkg] || 0;
            }
          }
        }
        distractionStatsStr += `Date: ${day.date} | Total Screen Time: ${totalMinutes} minutes\n`;
        appLimits.apps.forEach(app => {
          let actualMinutes = 0;
          if (day.screenTimeStats && typeof day.screenTimeStats === 'object') {
            if (Array.isArray(day.screenTimeStats)) {
              const found = day.screenTimeStats.find(a => a.packageName === app.packageName);
              if (found) actualMinutes = found.actualMinutes || 0;
            } else {
              actualMinutes = day.screenTimeStats[app.packageName] !== undefined ? day.screenTimeStats[app.packageName] : 0;
            }
          }
          const exceeded = actualMinutes > app.limitMinutes;
          distractionStatsStr += `- ${app.appName}: used ${actualMinutes}m (limit: ${app.limitMinutes}m) ${exceeded ? '[LIMIT EXCEEDED!]' : '[COMPLIANT/WITHIN LIMIT]'}\n`;
        });
      });
    } else {
      distractionStatsStr += `\nNo distracting app limits configured for the user.\n`;
    }

    // Formulate a premium system prompt for detailed monthly summaries with exactly three sections
    const systemPrompt = 
      "You are an elite, modern productivity analyst and senior lifestyle coach. Your job is to analyze the user's completed/pending tasks, achievements, and daily distraction screen time compliance across a 30-day period and write a detailed, highly professional, and slightly brutal monthly review. " +
      "Your response MUST start with a productivity score line on the very first line in the exact format: '📊 Productivity Rating: X/10' (where X is a score between 1 and 10). " +
      "Rate the 30-day period realistically: 10/10 means outstanding task completion rate across the month, high achievements, and perfect distraction limit compliance (little or no distraction time, zero limits exceeded). " +
      "Penalize the rating out of 10 heavily if there are slacking behaviors, low task completions, high screen times, or exceeded distraction limits across the month. " +
      "Immediately following the productivity rating line, you MUST structure your response into exactly three distinct sections separated by empty lines. Do NOT use markdown code blocks for the sections. Use exactly these section headers:\n\n" +
      "🏆 THE GOOD\n" +
      "Write 2 to 3 detailed bullet points celebrating wins, high-priority accomplishments, and highlights. Mention and praise any logged achievements beautifully. If no achievements are logged, ignore achievements entirely and focus on other positive task completions and categories (do NOT write negative critiques about a lack of achievements).\n\n" +
      "📈 AREAS FOR IMPROVEMENT / UP-THE-BAT\n" +
      "Write 2 to 3 bullet points analyzing low-effort routine filler tasks (like 'streak', 'maintain', 'ok', 'tick') and warning the user about slacking habits, avoidance behaviors, or minor performance drops.\n\n" +
      "🚨 CRITICAL RED ALERTS\n" +
      "Write 1 to 2 powerful, direct bullet points calling out critical regressions, incomplete high-impact tasks, excessive screen time, or blown distraction limits across the month.\n\n" +
      "Every bullet point MUST occupy its own separate line starting with a standard hyphen and a space (e.g. '- Your point here'). Maintain a premium, executive, and candid tone. Do NOT include introductory filler or conversational prefaces. Start directly with the '📊 Productivity Rating: X/10' line.";

    const userPrompt = 
      `Date Range: ${rangeText}\n` +
      `Days Count: ${consolidatedDays.length} days analyzed\n` +
      `Completion Rate: ${completionRate}% (${completedTasks} completed out of ${totalTasks} total tasks)\n\n` +
      `Logged Achievements in Past 30 Days:\n${achievementsStr || '(None logged)'}\n\n` +
      `Historical Logs:\n${taskListStr}\n` +
      `${distractionStatsStr}`;

    const aiServiceUrl = process.env.AI_SERVICE_URL || 'http://localhost:5002';
    const aiServiceSecret = process.env.AI_SERVICE_SECRET;

    if (!aiServiceSecret) {
      console.error('[Vercel-Backend] Shared secret AI_SERVICE_SECRET is missing from environment.');
      return res.status(500).json({ message: 'AI configuration error on server.' });
    }

    console.log(`[Vercel-Backend] Proxying monthly-summary for anchor ${anchorDay.date} to AI service`);

    // Call Render AI Microservice
    const aiResponse = await axios.post(`${aiServiceUrl}/api/ai/generate`, {
      systemPrompt,
      userPrompt
    }, {
      headers: {
        'x-ai-service-secret': aiServiceSecret,
        'Content-Type': 'application/json'
      },
      timeout: 25000
    });

    const wrapUpText = aiResponse.data.result;
    if (!wrapUpText) {
      return res.status(502).json({ message: 'Failed to retrieve monthly summary content from AI service.' });
    }

    // Save standalone WeeklySummary document in MongoDB with daysCount: 30
    const monthlySummary = new WeeklySummary({
      userId,
      date: anchorDay.date,
      summaryText: wrapUpText,
      rangeText,
      daysCount: consolidatedDays.length, // typically 30
      dayIds
    });
    
    const savedSummary = await monthlySummary.save();

    // 2. Increment Daily AI Summary counter upon successful generation
    const remaining = await incrementAiLimit(user);

    res.status(200).json({
      ...savedSummary.toObject(),
      generationsLeft: remaining
    });

  } catch (error) {
    console.error('[Vercel-Backend] generateMonthlySummary error:', error.message);
    if (error.response) {
      console.error('[Vercel-Backend] AI service error response:', error.response.data);
      return res.status(error.response.status).json({
        message: 'AI Service Exception',
        details: error.response.data.error || error.response.data
      });
    }
    res.status(500).json({ message: 'Internal Server Error while generating monthly summary.' });
  }
};

/**
 * POST /api/ai/authorize-daily-summary/:date
 * Validates user limits, compiles prompts, and issues a 5-minute signed JWT token
 */
exports.authorizeDailySummary = async (req, res) => {
  try {
    const { date } = req.params;
    const userId = req.user.userId;

    if (!date) {
      return res.status(400).json({ message: 'Date parameter is required (format: YYYY-MM-DD).' });
    }

    // 1. Enforce Daily AI Summary Rate Limiting
    const { user, generationsLeft, limit } = await checkAiLimit(userId);
    if (generationsLeft <= 0) {
      return res.status(429).json({
        message: `Daily AI generation limit reached. You can generate up to ${limit} insights per day.`
      });
    }

    // Retrieve the Day document
    const day = await Day.findOne({ userId, date });
    if (!day) {
      return res.status(404).json({ message: 'No day sheet found for this date. Please create tasks first.' });
    }

    // Retrieve achievements logged for this day
    const achievements = await Achievement.find({ userId, dayId: day._id });
    let achievementsStr = '';
    if (achievements && achievements.length > 0) {
      achievementsStr = achievements.map(a => `- ${a.title}`).join('\n');
    }

    // Process and format tasks for the prompt
    let totalTasks = 0;
    let completedTasks = 0;
    let taskListStr = '';

    if (day.categories && day.categories.length > 0) {
      day.categories.forEach(cat => {
        taskListStr += `\nCategory: ${cat.name}\n`;
        if (cat.tasks && cat.tasks.length > 0) {
          cat.tasks.forEach(t => {
            totalTasks++;
            if (t.completed) completedTasks++;
            taskListStr += `- [${t.completed ? 'x' : ' '}] ${t.title}\n`;
          });
        } else {
          taskListStr += `  (No tasks)\n`;
        }
      });
    }

    if (totalTasks === 0) {
      return res.status(400).json({ message: 'No tasks registered for today. Cannot generate AI insights.' });
    }

    const completionRate = Math.round((completedTasks / totalTasks) * 100);

    // Fetch distraction app limits and actual screen times
    const appLimits = await AppLimit.findOne({ userId });
    let distractionStatsStr = '';
    if (appLimits && appLimits.apps && appLimits.apps.length > 0) {
      distractionStatsStr += `\nDistraction Limits Configuration (no matter enabled/disabled toggle status):\n`;
      appLimits.apps.forEach(app => {
        let actualMinutes = 0;
        if (day.screenTimeStats && typeof day.screenTimeStats === 'object') {
          if (Array.isArray(day.screenTimeStats)) {
            const found = day.screenTimeStats.find(a => a.packageName === app.packageName);
            if (found) actualMinutes = found.actualMinutes || 0;
          } else {
            actualMinutes = day.screenTimeStats[app.packageName] !== undefined ? day.screenTimeStats[app.packageName] : 0;
          }
        }
        const exceeded = actualMinutes > app.limitMinutes;
        distractionStatsStr += `- ${app.appName}: used ${actualMinutes} minutes (configured limit: ${app.limitMinutes} minutes) ${exceeded ? '[LIMIT EXCEEDED!]' : '[COMPLIANT/WITHIN LIMIT]'}\n`;
      });

      // Calculate total screen time foreground sum
      let totalMinutes = 0;
      if (day.screenTimeStats && typeof day.screenTimeStats === 'object') {
        if (Array.isArray(day.screenTimeStats)) {
          day.screenTimeStats.forEach(app => {
            totalMinutes += app.actualMinutes || 0;
          });
        } else {
          for (const pkg in day.screenTimeStats) {
            totalMinutes += day.screenTimeStats[pkg] || 0;
          }
        }
      }
      distractionStatsStr += `Total Mobile Screen Time Today: ${totalMinutes} minutes\n`;
    } else {
      distractionStatsStr += `\nNo distracting app limits configured for today.\n`;
    }

    // Formulate Groq/LLM prompts
    const systemPrompt = 
      "You are a highly analytical, realistic, and candid productivity coach. " +
      "Analyze the user's daily task completion data, achievements, and distraction screen time statistics for the date provided, and write a candid, honest, and highly concise daily summary. " +
      "Your response MUST start with a productivity score line on the first line in the exact format: '🏆 Productivity Rating: X/5' (where X is a score between 1 and 5). " +
      "Rate the day realistically: 5/5 means outstanding task completion rate, high achievements, and perfect distraction limit compliance (little or no distraction time). " +
      "Penalize the score heavily if task completion is low, if there are slacking behaviors, if total mobile screen time is excessive, or if any distraction app limits were exceeded. " +
      "Immediately following the productivity rating line, write exactly 3 to 4 short, punchy bullet points of maximum 1 to 2 sentences each analyzing the day. " +
      "Do NOT write in paragraph format. " +
      "Every single bullet point MUST occupy its own separate line starting with a standard hyphen and a space (e.g. '- Your point here'). Do NOT bundle multiple bullet points together or write them in a continuous paragraph. " +
      "The first 1 to 2 bullet points MUST showcase actual good accomplishments (completed productive tasks, high-quality focus hours). Do NOT count low-effort tasks like 'streak', 'maintain', 'tick', 'ok', 't' as achievements or good things; treat them strictly as empty filler tasks. " +
      "The last 1 to 2 bullet points MUST showcase realistic, direct, and slightly brutal critique/slacking warnings. Call out uncompleted important tasks, cheat streak-maintaining box-ticking behavior, excessive screen time, or blown distraction limits as a clear negative. " +
      "IMPORTANT: If there are no achievements logged for the day, DO NOT criticize or mention the lack of achievements in the critique/bad points. Treat achievements as purely optional bonuses: if logged, praise them; if missing, completely ignore them and skip any mention of achievements, focusing instead on other productive work completed or pending. " +
      "Maintain a premium, direct, and candid tone. Do NOT use introductory filler. Start directly with the '🏆 Productivity Rating: X/5' line.";

    const userPrompt = 
      `Date: ${date}\n` +
      `Completion Rate: ${completionRate}% (${completedTasks} completed out of ${totalTasks} total tasks)\n\n` +
      `Logged Achievements for Today:\n${achievementsStr || '(None logged)'}\n\n` +
      `Tasks Accomplished & Pending:\n${taskListStr}\n` +
      `${distractionStatsStr}`;

    const jwtSecret = process.env.JWT_SECRET;
    if (!jwtSecret) {
      console.error('[Vercel-Backend] JWT_SECRET is missing from environment.');
      return res.status(500).json({ message: 'AI configuration error on server.' });
    }

    // Sign the 5-minute single-use generation token
    const generationToken = jwt.sign(
      {
        userId,
        date,
        dayId: day._id,
        action: 'generate-daily-summary'
      },
      jwtSecret,
      { expiresIn: '5m' }
    );

    res.status(200).json({
      generationToken,
      systemPrompt,
      userPrompt,
      aiServiceUrl: process.env.AI_SERVICE_URL || 'http://localhost:5002'
    });

  } catch (error) {
    console.error('[Vercel-Backend] authorizeDailySummary error:', error.message);
    res.status(500).json({ message: 'Internal Server Error while authorizing daily insights.' });
  }
};

/**
 * POST /api/ai/commit-daily-summary
 * Validates the single-use JWT generationToken, saves the summary, and decrements AI credit
 */
exports.commitDailySummary = async (req, res) => {
  try {
    const { generationToken, summary } = req.body;
    const userId = req.user.userId;

    if (!generationToken || !summary) {
      return res.status(400).json({ message: 'generationToken and summary content are required.' });
    }

    const jwtSecret = process.env.JWT_SECRET;
    if (!jwtSecret) {
      console.error('[Vercel-Backend] JWT_SECRET is missing from environment.');
      return res.status(500).json({ message: 'AI configuration error on server.' });
    }

    let decoded;
    try {
      decoded = jwt.verify(generationToken, jwtSecret);
    } catch (err) {
      console.warn(`[Vercel-Backend] Generation token verification failed: ${err.message}`);
      return res.status(401).json({ message: 'Invalid or expired generation token. Please try again.' });
    }

    if (decoded.action !== 'generate-daily-summary') {
      return res.status(403).json({ message: 'Forbidden: Invalid action for this token.' });
    }

    if (decoded.userId !== userId) {
      return res.status(403).json({ message: 'Forbidden: User mismatch.' });
    }

    // Double check AI limit
    const { user, generationsLeft, limit } = await checkAiLimit(userId);
    if (generationsLeft <= 0) {
      return res.status(429).json({
        message: `Daily AI generation limit reached. You can generate up to ${limit} insights per day.`
      });
    }

    // Retrieve the Day document
    const day = await Day.findOne({ _id: decoded.dayId, userId: decoded.userId });
    if (!day) {
      return res.status(404).json({ message: 'Day sheet not found.' });
    }

    // Save summary in MongoDB
    day.aiSummary = summary;
    await day.save();

    // Increment Daily AI Summary counter (deduct credit)
    const remaining = await incrementAiLimit(user);

    // Compute completion rate for returning payload (UI expectation)
    let totalTasks = 0;
    let completedTasks = 0;
    if (day.categories && day.categories.length > 0) {
      day.categories.forEach(cat => {
        if (cat.tasks && cat.tasks.length > 0) {
          cat.tasks.forEach(t => {
            totalTasks++;
            if (t.completed) completedTasks++;
          });
        }
      });
    }
    const completionRate = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;

    res.status(200).json({
      date: decoded.date,
      completionRate,
      summary: summary,
      aiSummary: summary,
      generationsLeft: remaining
    });

  } catch (error) {
    console.error('[Vercel-Backend] commitDailySummary error:', error.message);
    res.status(500).json({ message: 'Internal Server Error while saving daily insights.' });
  }
};

/**
 * Gets the daily photo upload limit configured in the environment variables, defaulting to 5.
 */
const getAiPhotoLimit = () => {
  const limitVal = parseInt(process.env.AI_PHOTO_LIMIT, 10);
  return isNaN(limitVal) ? 5 : limitVal;
};

/**
 * Checks the user's daily AI photo scan count, resetting it if a calendar day has passed.
 */
const checkAiPhotoLimit = async (userId) => {
  const user = await User.findById(userId);
  if (!user) {
    const err = new Error('User not found.');
    err.status = 404;
    throw err;
  }

  const now = new Date();
  const lastReset = user.aiPhotoExtractionResetTime ? new Date(user.aiPhotoExtractionResetTime) : new Date(0);

  // Compare calendar days
  if (now.toDateString() !== lastReset.toDateString()) {
    user.aiPhotoExtractionCount = 0;
    user.aiPhotoExtractionResetTime = now;
    await user.save();
  }

  const limit = getAiPhotoLimit();
  const generationsLeft = Math.max(0, limit - user.aiPhotoExtractionCount);
  return { user, generationsLeft, limit };
};

/**
 * Increments the user's daily AI photo scan count.
 */
const incrementAiPhotoLimit = async (user) => {
  user.aiPhotoExtractionCount += 1;
  await user.save();
  const limit = getAiPhotoLimit();
  return Math.max(0, limit - user.aiPhotoExtractionCount);
};

/**
 * POST /api/ai/authorize-task-extraction
 * Validates user daily photo limits and issues a 5-minute signed JWT generation token
 */
exports.authorizeTaskExtraction = async (req, res) => {
  try {
    const userId = req.user.userId;

    // Enforce Daily AI Photo rate limiting
    const { user, generationsLeft, limit } = await checkAiPhotoLimit(userId);
    if (generationsLeft <= 0) {
      return res.status(429).json({
        message: `Daily AI photo upload limit reached. You can scan up to ${limit} photos per day.`
      });
    }

    // Increment (deduct credit immediately on authorization ticket issue)
    const remaining = await incrementAiPhotoLimit(user);

    const jwtSecret = process.env.JWT_SECRET;
    if (!jwtSecret) {
      console.error('[Vercel-Backend] JWT_SECRET is missing from environment.');
      return res.status(500).json({ message: 'AI configuration error on server.' });
    }

    // Sign the 5-minute single-use generation token
    const generationToken = jwt.sign(
      {
        userId,
        action: 'extract-tasks-from-image'
      },
      jwtSecret,
      { expiresIn: '5m' }
    );

    res.status(200).json({
      generationToken,
      aiServiceUrl: process.env.AI_SERVICE_URL || 'http://localhost:5002',
      generationsLeft: remaining
    });

  } catch (error) {
    console.error('[Vercel-Backend] authorizeTaskExtraction error:', error.message);
    res.status(500).json({ message: 'Internal Server Error while authorizing task image scan.' });
  }
};

/**
 * GET /api/ai/photo-limits
 * Fetches remaining daily photo scans limit for the user
 */
exports.getPhotoLimits = async (req, res) => {
  try {
    const userId = req.user.userId;
    const { generationsLeft, limit } = await checkAiPhotoLimit(userId);
    res.status(200).json({ generationsLeft, limit });
  } catch (error) {
    console.error('[Vercel-Backend] getPhotoLimits error:', error.message);
    res.status(error.status || 500).json({ message: error.message || 'Internal Server Error' });
  }
};

