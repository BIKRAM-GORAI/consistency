const express = require('express');
const router = express.Router();
const userController = require('../controllers/userController');
const { userSearchValidation } = require('../middleware/validation');

// Search users
router.get('/search', userSearchValidation, userController.searchUsers);

// Get public profile
router.get('/:username', userController.getPublicProfile);

module.exports = router;
