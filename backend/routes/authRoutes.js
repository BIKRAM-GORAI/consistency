const express = require('express');
const router = express.Router();
const { register, login, getAchievementPrivacy, setAchievementPrivacy, getProfileSettings, setProfileSettings, uploadProfilePicture } = require('../controllers/authController');
const { upload } = require('../config/cloudinary');
const { authenticateToken } = require('../middleware/auth');
const { registerValidation, loginValidation, updateProfileValidation, achievementPrivacyValidation } = require('../middleware/validation');
const { checkAccountLockout } = require('../middleware/accountLockout');

// POST /api/auth/register (public)
router.post('/register', registerValidation, register);

// POST /api/auth/login (public) with account lockout check
router.post('/login', loginValidation, checkAccountLockout, login);

// GET/PATCH achievement privacy toggle (requires authentication)
router.get('/achievements-privacy', authenticateToken, getAchievementPrivacy);
router.patch('/achievements-privacy', authenticateToken, achievementPrivacyValidation, setAchievementPrivacy);

// GET/PATCH profile settings (requires authentication)
router.get('/settings', authenticateToken, getProfileSettings);
router.patch('/settings', authenticateToken, updateProfileValidation, setProfileSettings);

// POST upload profile picture (requires authentication)
router.post('/profile-picture', authenticateToken, upload.single('image'), uploadProfilePicture);

module.exports = router;
