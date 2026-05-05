const express = require('express');
const router = express.Router();
const userController = require('../controllers/userController');
const { userSearchValidation } = require('../middleware/validation');

const { authenticateTokenOptional } = require('../middleware/auth');

// Search users
router.get('/search', userSearchValidation, userController.searchUsers);

// Get public profile
router.get('/:username', authenticateTokenOptional, userController.getPublicProfile);

module.exports = router;
