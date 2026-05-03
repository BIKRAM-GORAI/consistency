const express = require('express');
const router = express.Router();
const rateLimit = require('express-rate-limit');
const { register, login, oauthLogin, getAchievementPrivacy, setAchievementPrivacy, getProfileSettings, setProfileSettings, uploadProfilePicture, forgotPasswordOtp, validateOtp, resetPassword } = require('../controllers/authController');
const { upload } = require('../config/cloudinary');
const { authenticateToken } = require('../middleware/auth');
const { registerValidation, loginValidation, updateProfileValidation, achievementPrivacyValidation } = require('../middleware/validation');
const { checkAccountLockout } = require('../middleware/accountLockout');

// Rate limit for sending OTPs: max 3 per 15 minutes
const otpSendLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 3,
  message: { message: 'Too many OTP requests from this IP, please try again after 15 minutes.' }
});

// Rate limit for validating OTPs / resetting: max 10 per 15 minutes
const otpValidateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: { message: 'Too many validation attempts from this IP, please try again after 15 minutes.' }
});

// POST /api/auth/register (public)
router.post('/register', registerValidation, register);

// POST /api/auth/login (public) with account lockout check
router.post('/login', loginValidation, checkAccountLockout, login);

// POST /api/auth/oauth-login (public)
router.post('/oauth-login', oauthLogin);

// POST /api/auth/forgot-password-otp
router.post('/forgot-password-otp', otpSendLimiter, forgotPasswordOtp);

// POST /api/auth/validate-otp
router.post('/validate-otp', otpValidateLimiter, validateOtp);

// POST /api/auth/reset-password
router.post('/reset-password', otpValidateLimiter, resetPassword);

// GET/PATCH achievement privacy toggle (requires authentication)
router.get('/achievements-privacy', authenticateToken, getAchievementPrivacy);
router.patch('/achievements-privacy', authenticateToken, achievementPrivacyValidation, setAchievementPrivacy);

// GET/PATCH profile settings (requires authentication)
router.get('/settings', authenticateToken, getProfileSettings);
router.get('/me', authenticateToken, getProfileSettings); // Alias for /settings
router.patch('/settings', authenticateToken, updateProfileValidation, setProfileSettings);

// POST upload profile picture (requires authentication)
router.post('/profile-picture', authenticateToken, upload.single('image'), uploadProfilePicture);

module.exports = router;
