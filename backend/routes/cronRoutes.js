const express = require('express');
const router = express.Router();
const { sendStreakReminders, sendInactiveReminders } = require('../controllers/cronController');

// GET /api/cron/streak-reminders
router.get('/streak-reminders', sendStreakReminders);

// GET /api/cron/inactive-reminders
router.get('/inactive-reminders', sendInactiveReminders);

module.exports = router;
