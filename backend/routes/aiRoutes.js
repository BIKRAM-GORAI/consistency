const express = require('express');
const router = express.Router();
const aiController = require('../controllers/aiController');
const { authenticateToken } = require('../middleware/auth');

// Route to generate or refresh a daily productivity summary
router.post('/daily-summary/:date', authenticateToken, aiController.generateDailySummary);

// Route to generate or refresh the public profile productivity biography
router.post('/productivity-bio', authenticateToken, aiController.generateProductivityBio);

// Route to compile and generate a standalone 7-day wrap-up summary card
router.post('/weekly-summary/:dayId', authenticateToken, aiController.generateWeeklySummary);

// Route to fetch all weekly summaries for the authenticated user
router.get('/weekly-summaries', authenticateToken, aiController.getWeeklySummaries);

// Route to fetch remaining daily AI summary generations left
router.get('/generations-left', authenticateToken, aiController.getGenerationsLeft);

// Route to compile and generate a standalone 30-day (Monthly) summary card
router.post('/monthly-summary/:dayId', authenticateToken, aiController.generateMonthlySummary);

// Route to delete a weekly summary card by ID
router.delete('/weekly-summary/:id', authenticateToken, aiController.deleteWeeklySummary);

module.exports = router;
