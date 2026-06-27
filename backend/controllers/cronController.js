const nodemailer = require('nodemailer');
const User = require('../models/User');
const Day = require('../models/Day');
const CronLog = require('../models/CronLog');
const { getUserAcceptedSubmissions, getProblemDetails } = require('./leetcodeController');
const { updateUserStreakAndActivity } = require('./dayController');

// Helper to check authorization
function checkAuth(req, res) {
  const authHeader = req.headers.authorization;
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    res.status(401).json({ message: 'Unauthorized' });
    return false;
  }
  return true;
}

// Nodemailer transporter setup
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.GMAIL_EMAIL,
    pass: process.env.GMAIL_APP_PASSWORD,
  },
});

/**
 * GET /api/cron/streak-reminders
 */
const sendStreakReminders = async (req, res) => {
  if (!checkAuth(req, res)) return;

  try {
    const d = new Date();
    const todayStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

    // Active users: lastActiveAt within the last 10 days
    const tenDaysAgo = new Date();
    tenDaysAgo.setDate(tenDaysAgo.getDate() - 10);

    const activeUsers = await User.find({
      emailNotifications: true,
      currentStreak: { $gt: 0 },
      lastActiveAt: { $gt: tenDaysAgo }
    });

    const emailsToSend = [];

    for (const user of activeUsers) {
      const todayDay = await Day.findOne({ userId: user._id, date: todayStr });
      
      let isTodayCompleted = false;
      if (todayDay) {
        for (const cat of todayDay.categories) {
          if (cat.tasks.some(t => t.completed)) {
            isTodayCompleted = true;
            break;
          }
        }
      }

      if (!isTodayCompleted) {
        const currentTime = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
        emailsToSend.push({
          mailOptions: {
            to: user.email,
            subject: '🔥 Don\'t break your streak!',
            text: `Hi ${user.name},\n\nYou have an active streak of ${user.currentStreak} days on Consistency Tracker!\nDon't forget to log your progress today to keep the fire burning.\n\nKeep pushing!\nThe Consistency Tracker Team`,
            html: `
              <div style="font-family: Arial, sans-serif; padding: 24px; color: #000000; max-width: 500px; margin: 0 auto; border-top: 3px solid #000000; border-left: 3px solid #000000; border-right: 8px solid #000000; border-bottom: 8px solid #000000; border-radius: 8px; background-color: #faf7f2;">
                <div style="text-align: center; margin-bottom: 24px;">
                  <span style="font-size: 20px; font-weight: 900; text-transform: uppercase; margin: 0; background-color: #FFD60A; display: inline-block; padding: 10px 18px; border-top: 2px solid #000000; border-left: 2px solid #000000; border-right: 5px solid #000000; border-bottom: 5px solid #000000;">
                    ⚡ Consistency Tracker
                  </span>
                </div>
                <h2 style="font-size: 22px; font-weight: 900; margin-top: 0; color: #FF6B35; text-transform: uppercase;">🔥 Keep the fire burning!</h2>
                <p style="font-size: 16px; line-height: 1.6; font-weight: bold;">Hi ${user.name},</p>
                <p style="font-size: 16px; line-height: 1.6;">You are currently on an amazing streak of <strong>${user.currentStreak} days</strong>!</p>
                <p style="font-size: 16px; line-height: 1.6; margin-bottom: 24px;">Don't forget to log your progress today so you don't lose your momentum. It only takes a minute!</p>
                
                <div style="text-align: center; margin-bottom: 24px;">
                  <a href="${process.env.FRONTEND_URL || (process.env.VERCEL_PROJECT_PRODUCTION_URL ? 'https://' + process.env.VERCEL_PROJECT_PRODUCTION_URL : 'http://localhost:5001')}/index.html" style="background-color: #000000; color: #FFD60A; padding: 14px 28px; display: inline-block; border-radius: 6px; font-size: 16px; font-weight: bold; text-decoration: none; border-bottom: 5px solid #FF6B35; border-right: 5px solid #FF6B35; text-transform: uppercase; letter-spacing: 1px;">Log Today's Tasks →</a>
                </div>

                <div style="background-color: #FFF0F0; padding: 16px; border-top: 2px solid #EF4444; border-left: 2px solid #EF4444; border-right: 5px solid #EF4444; border-bottom: 5px solid #EF4444; border-radius: 6px; text-align: center; margin-bottom: 24px;">
                  <p style="font-size: 14px; color: #000000; margin: 0; font-style: italic; font-weight: bold;">"Small disciplines repeated with consistency every day lead to great achievements gained slowly over time."</p>
                </div>

                <div style="background-color: #f5f5f5; padding: 12px; border: 2px solid #ddd; border-radius: 4px; text-align: center;">
                  <p style="font-size: 12px; color: #666; margin: 0; font-weight: bold;">
                    Generated at: ${currentTime} | Ref: ${Date.now().toString().slice(-6)}
                  </p>
                </div>
              </div>
            `
          },
          meta: { email: user.email, streak: user.currentStreak }
        });
      }
    }

    if (emailsToSend.length === 0) {
      return res.json({ message: 'No streak reminders to send today.' });
    }

    // Send concurrently
    const results = await Promise.allSettled(
      emailsToSend.map(item => transporter.sendMail({
        from: `"Consistency Tracker" <${process.env.GMAIL_EMAIL}>`,
        ...item.mailOptions
      }))
    );

    const successfulEmails = [];
    const userAgent = req.headers['user-agent'] || 'unknown';

    for (let i = 0; i < results.length; i++) {
      if (results[i].status === 'fulfilled') {
        successfulEmails.push(emailsToSend[i].meta);
      }
    }

    if (successfulEmails.length > 0) {
      await CronLog.create({
        type: 'streak',
        userAgent,
        emails: successfulEmails
      });
    }

    res.json({ message: `Successfully sent ${successfulEmails.length}/${emailsToSend.length} streak reminders.` });

  } catch (error) {
    console.error('Streak reminder error:', error);
    res.status(500).json({ message: 'Internal Server Error' });
  }
};

/**
 * GET /api/cron/inactive-reminders
 */
const sendInactiveReminders = async (req, res) => {
  if (!checkAuth(req, res)) return;

  try {
    const tenDaysAgoEnd = new Date();
    tenDaysAgoEnd.setDate(tenDaysAgoEnd.getDate() - 10);
    tenDaysAgoEnd.setHours(23, 59, 59, 999);

    const inactiveUsers = await User.find({
      emailNotifications: true,
      lastActiveAt: { $lte: tenDaysAgoEnd }
    });

    if (inactiveUsers.length === 0) {
      return res.json({ message: 'No inactive reminders to send today.' });
    }

    const emailsToSend = inactiveUsers.map(user => {
      const daysInactive = Math.floor((Date.now() - new Date(user.lastActiveAt).getTime()) / (1000 * 60 * 60 * 24));
      const currentTime = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
      return {
        mailOptions: {
          to: user.email,
          subject: '👋 We miss you at Consistency Tracker!',
          text: `Hi ${user.name},\n\nIt's been a while since you logged your daily progress. Consistency is the key to success!\nCome back and build your next streak today.\n\nSee you soon!\nThe Consistency Tracker Team`,
          html: `
            <div style="font-family: Arial, sans-serif; padding: 24px; color: #000000; max-width: 500px; margin: 0 auto; border-top: 3px solid #000000; border-left: 3px solid #000000; border-right: 8px solid #000000; border-bottom: 8px solid #000000; border-radius: 8px; background-color: #faf7f2;">
              <div style="text-align: center; margin-bottom: 24px;">
                <span style="font-size: 20px; font-weight: 900; text-transform: uppercase; margin: 0; background-color: #FFD60A; display: inline-block; padding: 10px 18px; border-top: 2px solid #000000; border-left: 2px solid #000000; border-right: 5px solid #000000; border-bottom: 5px solid #000000;">
                  ⚡ Consistency Tracker
                </span>
              </div>
              <h2 style="font-size: 22px; font-weight: 900; margin-top: 0; color: #00C9A7; text-transform: uppercase;">👋 We miss you!</h2>
              <p style="font-size: 16px; line-height: 1.6; font-weight: bold;">Hi ${user.name},</p>
              <p style="font-size: 16px; line-height: 1.6;">It's been a few days since you last logged your progress.</p>
              <p style="font-size: 16px; line-height: 1.6; margin-bottom: 24px;">Building consistency isn't about never missing a day, it's about <strong>never missing two</strong>. Come back and start building your next streak today!</p>
              
              <div style="text-align: center; margin-bottom: 24px;">
                <a href="${process.env.FRONTEND_URL || (process.env.VERCEL_PROJECT_PRODUCTION_URL ? 'https://' + process.env.VERCEL_PROJECT_PRODUCTION_URL : 'http://localhost:5001')}/index.html" style="background-color: #000000; color: #00C9A7; padding: 14px 28px; display: inline-block; border-radius: 6px; font-size: 16px; font-weight: bold; text-decoration: none; border-bottom: 5px solid #00C9A7; border-right: 5px solid #00C9A7; text-transform: uppercase; letter-spacing: 1px;">Start a New Streak →</a>
              </div>

              <div style="background-color: #f5f5f5; padding: 12px; border: 2px solid #ddd; border-radius: 4px; text-align: center;">
                <p style="font-size: 12px; color: #666; margin: 0; font-weight: bold;">
                  Generated at: ${currentTime} | Ref: ${Date.now().toString().slice(-6)}
                </p>
              </div>
            </div>
          `
        },
        meta: { email: user.email, daysInactive }
      };
    });

    const results = await Promise.allSettled(
      emailsToSend.map(item => transporter.sendMail({
        from: `"Consistency Tracker" <${process.env.GMAIL_EMAIL}>`,
        ...item.mailOptions
      }))
    );

    const successfulEmails = [];
    const userAgent = req.headers['user-agent'] || 'unknown';

    for (let i = 0; i < results.length; i++) {
      if (results[i].status === 'fulfilled') {
        successfulEmails.push(emailsToSend[i].meta);
      }
    }

    if (successfulEmails.length > 0) {
      await CronLog.create({
        type: 'inactive',
        userAgent,
        emails: successfulEmails
      });
    }

    res.json({ message: `Successfully sent ${successfulEmails.length}/${emailsToSend.length} inactive reminders.` });

  } catch (error) {
    console.error('Inactive reminder error:', error);
    res.status(500).json({ message: 'Internal Server Error' });
  }
};

/**
 * GET /api/cron/sync-leetcode
 */
const autoSyncLeetcodeSubmissions = async (req, res) => {
  if (!checkAuth(req, res)) return;

  try {
    const today = new Date();
    // Yesterday in server timezone
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);

    const targetYear = yesterday.getFullYear();
    const targetMonth = yesterday.getMonth(); // 0-indexed
    const targetDay = yesterday.getDate();

    // YYYY-MM-DD string
    const yesterdayStr = `${targetYear}-${String(targetMonth + 1).padStart(2, '0')}-${String(targetDay).padStart(2, '0')}`;

    console.log(`[LeetCode Auto-Sync] Syncing for date: ${yesterdayStr}`);

    // Find all premium users with auto-sync enabled and connected username
    const premiumUsers = await User.find({
      subscriptionTier: 'premium',
      leetcodeUsername: { $ne: null },
      leetcodeAutoSync: true
    });

    console.log(`[LeetCode Auto-Sync] Found ${premiumUsers.length} premium users to process.`);

    const results = [];

    for (const user of premiumUsers) {
      console.log(`[LeetCode Auto-Sync] Syncing user: ${user.username} (${user.leetcodeUsername})`);
      
      // Throttle delay to respect LeetCode rate limit (e.g. 500ms between requests)
      await new Promise(resolve => setTimeout(resolve, 500));

      try {
        // Fetch user's accepted submissions
        const submissions = await getUserAcceptedSubmissions(user.leetcodeUsername);
        
        // Filter submissions accepted yesterday (server time)
        const yesterdaySubmissions = submissions.filter(sub => {
          if (sub.statusDisplay !== 'Accepted') return false;
          
          const subDate = new Date(parseInt(sub.timestamp) * 1000);
          return subDate.getFullYear() === targetYear &&
                 subDate.getMonth() === targetMonth &&
                 subDate.getDate() === targetDay;
        });

        console.log(`[LeetCode Auto-Sync] User ${user.username} solved ${yesterdaySubmissions.length} problems yesterday.`);

        if (yesterdaySubmissions.length === 0) {
          results.push({ username: user.username, synced: 0, status: 'No submissions found' });
          continue;
        }

        // Load or create Day document for yesterday
        let dayDoc = await Day.findOne({ userId: user._id, date: yesterdayStr });
        if (!dayDoc) {
          dayDoc = new Day({
            userId: user._id,
            date: yesterdayStr,
            categories: []
          });
        }

        // Find or create LeetCode category
        let leetcodeCategory = dayDoc.categories.find(cat => cat.name === 'LeetCode');
        if (!leetcodeCategory) {
          dayDoc.categories.push({ name: 'LeetCode', tasks: [] });
          leetcodeCategory = dayDoc.categories[dayDoc.categories.length - 1];
        }

        let tasksAddedCount = 0;

        for (const sub of yesterdaySubmissions) {
          const taskTitle = `🧠 LeetCode: ${sub.title}`;

          // Check if this problem is already present in yesterday's tasks
          const alreadyExists = leetcodeCategory.tasks.some(task => {
            const hasUrlMatch = task.metadata && task.metadata.problemUrl && 
                                task.metadata.problemUrl.includes(sub.titleSlug);
            const hasTitleMatch = task.title === taskTitle;
            return hasUrlMatch || hasTitleMatch;
          });

          if (alreadyExists) {
            console.log(`[LeetCode Auto-Sync] Task "${taskTitle}" already present. Skipping.`);
            continue;
          }

          // Fetch problem details for difficulty
          let difficulty = 'Medium';
          try {
            const details = await getProblemDetails(sub.titleSlug);
            if (details && details.difficulty) {
              difficulty = details.difficulty;
            }
          } catch (detailsErr) {
            console.warn(`[LeetCode Auto-Sync] Failed to fetch problem details for ${sub.titleSlug}:`, detailsErr.message);
          }

          const taskData = {
            title: taskTitle,
            completed: true,
            metadata: {
              problemUrl: `https://leetcode.com/problems/${sub.titleSlug}/`,
              difficulty,
              acceptedDate: yesterdayStr,
              submissionCount: 1,
              verified: true,
              autoSynced: true
            }
          };

          leetcodeCategory.tasks.push(taskData);
          tasksAddedCount++;
        }

        if (tasksAddedCount > 0) {
          await dayDoc.save();
          // Recalculate streak
          await updateUserStreakAndActivity(user._id, yesterdayStr);
          console.log(`[LeetCode Auto-Sync] Saved ${tasksAddedCount} auto-synced tasks for ${user.username}.`);
        }

        results.push({ username: user.username, synced: tasksAddedCount, status: 'Success' });

      } catch (userErr) {
        console.error(`[LeetCode Auto-Sync] Failed to sync user ${user.username}:`, userErr);
        results.push({ username: user.username, synced: 0, status: 'Failed', error: userErr.message });
      }
    }

    res.json({
      message: `LeetCode auto-sync completed.`,
      date: yesterdayStr,
      processedCount: premiumUsers.length,
      results
    });

  } catch (error) {
    console.error('[LeetCode Auto-Sync] Global error during auto-sync:', error);
    res.status(500).json({ message: 'Internal Server Error', error: error.message });
  }
};

module.exports = {
  sendStreakReminders,
  sendInactiveReminders,
  autoSyncLeetcodeSubmissions
};
