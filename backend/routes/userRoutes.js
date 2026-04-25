const express = require('express');
const router = express.Router();
const userController = require('../controllers/userController');

// Search users
router.get('/search', userController.searchUsers);

// Get public profile
router.get('/:username', userController.getPublicProfile);

module.exports = router;
