const express = require('express');
const router = express.Router();
const userController = require('../controllers/userController');
const { userSearchValidation } = require('../middleware/validation');
const { authenticateToken, authenticateTokenOptional } = require('../middleware/auth');

// Get public config
router.get('/config', userController.getPublicConfig);

// Search users
router.get('/search', userSearchValidation, userController.searchUsers);

// Global Leaderboard
router.get('/leaderboard', userController.getLeaderboard);

// Get public profile
router.get('/:username', authenticateTokenOptional, userController.getPublicProfile);
router.get('/:username/days', userController.getPublicProfileDays);
router.get('/:username/achievements', userController.getPublicProfileAchievements);

// Log profile share
router.post('/log-share', authenticateToken, userController.logProfileShare);

// Badges
router.get('/badges/all', authenticateToken, userController.getAllBadges);
router.get('/badges/claimed', authenticateToken, userController.getClaimedBadges);
router.post('/badges/claim/:badgeId', authenticateToken, userController.claimBadge);

module.exports = router;
