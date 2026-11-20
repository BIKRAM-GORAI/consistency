const express = require('express');
const router = express.Router();
const { sendStreakReminders, sendInactiveReminders } = require('../controllers/cronController');
const { runBotSimulationCron } = require('../controllers/botController');

// GET /api/cron/streak-reminders
router.get('/streak-reminders', sendStreakReminders);

// GET /api/cron/inactive-reminders
router.get('/inactive-reminders', sendInactiveReminders);

/**
 * GET /api/cron/simulate-bots
 * Proxies to the Render AI microservice (no execution timeout limits).
 * Falls back to local execution if Render is temporarily unreachable.
 */
router.get('/simulate-bots', async (req, res) => {
  const aiServiceUrl = process.env.AI_SERVICE_URL;
  if (aiServiceUrl) {
    try {
      const response = await fetch(`${aiServiceUrl}/api/cron/simulate-bots`, {
        headers: { Authorization: req.headers.authorization || '' }
      });
      const data = await response.json();
      return res.status(response.status).json(data);
    } catch (err) {
      console.warn('[cronRoutes] Failed to proxy simulate-bots to Render, falling back to local:', err.message);
    }
  }
  // Local fallback
  return runBotSimulationCron(req, res);
});

/**
 * GET /api/cron/sync-leetcode
 * Proxies to the AI microservice (Render) which has no timeout limit.
 * The AI service handles the full async work and responds directly.
 */
router.get('/sync-leetcode', async (req, res) => {
  const aiServiceUrl = process.env.AI_SERVICE_URL;
  if (!aiServiceUrl) {
    return res.status(503).json({ message: 'AI_SERVICE_URL not configured' });
  }
  try {
    const response = await fetch(`${aiServiceUrl}/api/cron/sync-leetcode`, {
      headers: { Authorization: req.headers.authorization || '' }
    });
    const data = await response.json();
    res.status(response.status).json(data);
  } catch (err) {
    console.error('[cronRoutes] Failed to proxy sync-leetcode to AI service:', err.message);
    res.status(502).json({ message: 'Failed to reach AI service', error: err.message });
  }
});

module.exports = router;
