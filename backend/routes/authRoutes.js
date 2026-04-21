const express = require('express');
const router = express.Router();
const { register, login, getAchievementPrivacy, setAchievementPrivacy } = require('../controllers/authController');

// POST /api/auth/register
router.post('/register', register);

// POST /api/auth/login
router.post('/login', login);

// GET/PATCH achievement privacy toggle
router.get('/:userId/achievements-privacy',  getAchievementPrivacy);
router.patch('/:userId/achievements-privacy', setAchievementPrivacy);

module.exports = router;
