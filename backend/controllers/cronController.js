const nodemailer = require('nodemailer');
const User = require('../models/User');
const Day = require('../models/Day');
const CronLog = require('../models/CronLog');

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
        emailsToSend.push({
          mailOptions: {
            to: user.email,
            subject: '🔥 Don\'t break your streak!',
            text: `Hi ${user.name},\n\nYou have an active streak of ${user.currentStreak} days on Consistency Tracker!\nDon't forget to log your progress today to keep the fire burning.\n\nKeep pushing!\nThe Consistency Tracker Team`,
            html: `<p>Hi ${user.name},</p><p>You have an active streak of <strong>${user.currentStreak} days</strong> on Consistency Tracker!</p><p>Don't forget to log your progress today to keep the fire burning.</p><p>Keep pushing!<br/>The Consistency Tracker Team</p>`
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
      return {
        mailOptions: {
          to: user.email,
          subject: '👋 We miss you at Consistency Tracker!',
          text: `Hi ${user.name},\n\nIt's been a while since you logged your daily progress. Consistency is the key to success!\nCome back and build your next streak today.\n\nSee you soon!\nThe Consistency Tracker Team`,
          html: `<p>Hi ${user.name},</p><p>It's been a while since you logged your daily progress. Consistency is the key to success!</p><p>Come back and build your next streak today.</p><p>See you soon!<br/>The Consistency Tracker Team</p>`
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

module.exports = { sendStreakReminders, sendInactiveReminders };
