const express = require('express');
const router = express.Router();
const devHubController = require('../controllers/devHubController');
const { authenticateToken } = require('../middleware/auth');

// Bookmarks routes
router.get('/bookmarks', authenticateToken, devHubController.getBookmarks);
router.post('/bookmarks', authenticateToken, devHubController.addBookmark);
router.delete('/bookmarks/:id', authenticateToken, devHubController.deleteBookmark);

// BYO API Keys management
router.get('/keys', authenticateToken, devHubController.getUserKeys);
router.post('/keys', authenticateToken, devHubController.updateUserKeys);
router.delete('/keys/:service', authenticateToken, devHubController.deleteUserKey);

// YouTube Study Mode & AI Notes
router.post('/youtube-search', authenticateToken, devHubController.searchYouTube);
router.post('/ai-notes', authenticateToken, devHubController.generateAINotes);

module.exports = router;
