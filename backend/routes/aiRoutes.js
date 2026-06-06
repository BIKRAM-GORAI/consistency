const express = require('express');
const router = express.Router();
const aiController = require('../controllers/aiController');
const { authenticateToken } = require('../middleware/auth');

// Route to generate or refresh a daily productivity summary
router.post('/daily-summary/:date', authenticateToken, aiController.generateDailySummary);

// New routes for direct client-to-Render AI summary flow
router.post('/authorize-daily-summary/:date', authenticateToken, aiController.authorizeDailySummary);
router.post('/commit-daily-summary', authenticateToken, aiController.commitDailySummary);

// Route for direct client-to-Render image-to-task scanning
router.post('/authorize-task-extraction', authenticateToken, aiController.authorizeTaskExtraction);
router.get('/photo-limits', authenticateToken, aiController.getPhotoLimits);

// Routes for direct client-to-Render voice-to-task parsing
router.post('/authorize-voice-to-task', authenticateToken, aiController.authorizeVoiceToTask);
router.get('/voice-limits', authenticateToken, aiController.getVoiceLimits);

// Route for direct client-to-Render AI Canvas flow ticket authorization
router.post('/authorize-canvas', authenticateToken, aiController.authorizeCanvasFlow);

// Canvas AI daily message limit tracking
router.get('/canvas-msg-limits', authenticateToken, aiController.getCanvasMsgLimits);
router.post('/commit-canvas-msg', authenticateToken, aiController.commitCanvasMsg);


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
