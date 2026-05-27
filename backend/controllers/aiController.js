const axios = require('axios');
const Day = require('../models/Day');
const User = require('../models/User');
const WeeklySummary = require('../models/WeeklySummary');
const Achievement = require('../models/Achievement');

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

    // Formulate Groq/LLM prompts
    const systemPrompt = 
      "You are a highly analytical, realistic, and candid productivity coach. " +
      "Analyze the user's daily task completion data and achievements for the date provided, and write a candid, honest daily summary in a bulleted point format (exactly 3 to 4 short, punchy bullet points). " +
      "Do NOT write in paragraph format. " +
      "Every single bullet point MUST occupy its own separate line starting with a standard hyphen and a space (e.g. '- Your point here'). Do NOT bundle multiple bullet points together or write them in a continuous paragraph. " +
      "The first 1 to 2 bullet points MUST showcase the good things (achievements, completed productive tasks, positive streak updates). " +
      "The last 1 to 2 bullet points MUST showcase the bad/focus/critique things (uncompleted important tasks, cheat streak-maintaining box-ticking behavior like tasks named 'streak'/'maintain'/'tick'/'ok' while slacking on real work, or areas needing serious improvement). " +
      "If there are no achievements or bad things, focus on constructive feedback for next steps. " +
      "Maintain a premium, direct, and candid tone. Do NOT use introductory filler. Start directly with the bullet points (using standard '-' hyphens).";

    const userPrompt = 
      `Date: ${date}\n` +
      `Completion Rate: ${completionRate}% (${completedTasks} completed out of ${totalTasks} total tasks)\n\n` +
      `Logged Achievements for Today:\n${achievementsStr || '(None logged)'}\n\n` +
      `Tasks Accomplished & Pending:\n${taskListStr}`;

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
    day.summary = summaryText;
    await day.save();

    res.status(200).json({
      date,
      completionRate,
      summary: summaryText
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

    const systemPrompt = 
      "You are an elite, modern productivity analyst. Your job is to analyze the user's completed and pending " +
      "tasks across a 7-day period and write a high-impact, professional, and highly motivating weekly wrap-up summary " +
      "(exactly 3 to 4 short sentences total) to be displayed in a standalone card in their feed. " +
      "Highlight their consistency style, identify their top achievements, and give an actionable insight to keep their momentum. " +
      "Do NOT use conversational prefaces or title headings. Start directly.";

    const userPrompt = 
      `Date Range: ${rangeText}\n` +
      `Days Count: ${consolidatedDays.length} days analyzed\n` +
      `Completion Rate: ${completionRate}% (${completedTasks} completed out of ${totalTasks} total tasks)\n\n` +
      `Historical Logs:\n${taskListStr}`;

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

    res.status(200).json(savedSummary);

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

