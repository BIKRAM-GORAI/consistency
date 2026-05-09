const express = require('express');
const router = express.Router();
const rateLimit = require('express-rate-limit');
const { register, login, oauthLogin, getAchievementPrivacy, setAchievementPrivacy, getProfileSettings, setProfileSettings, uploadProfilePicture, forgotPasswordOtp, validateOtp, resetPassword, deleteAccount, getFirebaseToken, getMediaUploadLimit } = require('../controllers/authController');
const { uploadProfile, uploadChat } = require('../config/cloudinary');
const { authenticateToken } = require('../middleware/auth');
const { mediaUploadLimiter } = require('../middleware/rateLimit');
const { dbMediaRateLimiter } = require('../middleware/dbRateLimit');
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

// DELETE account (requires authentication)
router.delete('/account', authenticateToken, deleteAccount);

// GET current media upload limit status
router.get('/media-upload-limit', authenticateToken, getMediaUploadLimit);

// POST upload profile picture (requires authentication)
router.post('/profile-picture', authenticateToken, dbMediaRateLimiter, uploadProfile.single('image'), uploadProfilePicture);

// POST upload chat media (requires authentication)
router.post('/chat-media', authenticateToken, dbMediaRateLimiter, uploadChat.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ message: 'No file uploaded' });
  // Minimize data sent to frontend: only return the secure URL
  res.json({ secure_url: req.file.path });
});

// DELETE chat media from Cloudinary
router.delete('/chat-media', authenticateToken, async (req, res) => {
  const { urls } = req.body; // Expects an array of URLs
  if (!urls || !Array.isArray(urls)) return res.status(400).json({ message: 'URLs array is required' });
  
  try {
    const { deleteFromCloudinary } = require('../config/cloudinary');
    for (const url of urls) {
      await deleteFromCloudinary(url);
    }
    res.json({ message: 'Media deleted successfully' });
  } catch (err) {
    res.status(500).json({ message: 'Error deleting media', error: err.message });
  }
});

// GET firebase token for chat authentication (requires authentication)
router.get('/firebase-token', authenticateToken, getFirebaseToken);

module.exports = router;
