const express = require('express');
const router = express.Router();
const { register, login, getAchievementPrivacy, setAchievementPrivacy, getProfileSettings, setProfileSettings, uploadProfilePicture } = require('../controllers/authController');
const { upload } = require('../config/cloudinary');

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

// POST upload profile picture
router.post('/:userId/profile-picture', upload.single('image'), uploadProfilePicture);

module.exports = router;
