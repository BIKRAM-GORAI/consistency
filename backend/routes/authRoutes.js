const express = require('express');
const router = express.Router();
const { register, login, getAchievementPrivacy, setAchievementPrivacy, getProfileSettings, setProfileSettings } = require('../controllers/authController');

// POST /api/auth/register
router.post('/register', register);

// POST /api/auth/login
router.post('/login', login);

// GET/PATCH achievement privacy toggle
router.get('/:userId/achievements-privacy',  getAchievementPrivacy);
router.patch('/:userId/achievements-privacy', setAchievementPrivacy);

// GET/PATCH profile settings
router.get('/:userId/settings', getProfileSettings);
router.patch('/:userId/settings', setProfileSettings);

module.exports = router;
