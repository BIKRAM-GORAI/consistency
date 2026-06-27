const express = require('express');
const router = express.Router();
const { sendStreakReminders, sendInactiveReminders, autoSyncLeetcodeSubmissions } = require('../controllers/cronController');

// GET /api/cron/streak-reminders
router.get('/streak-reminders', sendStreakReminders);

// GET /api/cron/inactive-reminders
router.get('/inactive-reminders', sendInactiveReminders);

// GET /api/cron/sync-leetcode
router.get('/sync-leetcode', autoSyncLeetcodeSubmissions);

module.exports = router;
