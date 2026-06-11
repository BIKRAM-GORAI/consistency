const express = require('express');
const router = express.Router();
const rateLimit = require('express-rate-limit');
const { register, login, oauthLogin, getAchievementPrivacy, setAchievementPrivacy, getProfileSettings, setProfileSettings, uploadProfilePicture, forgotPasswordOtp, validateOtp, resetPassword, deleteAccount, getFirebaseToken, getMediaUploadLimit, getChangelogList, markChangelogViewed, sendVerificationOtp, verifyEmail } = require('../controllers/authController');
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

// Public Changelog Routes
router.get('/changelog', getChangelogList);
router.post('/changelog/view', authenticateToken, markChangelogViewed);

// DELETE account (requires authentication)
router.delete('/account', authenticateToken, deleteAccount);

// GET current media upload limit status
router.get('/media-upload-limit', authenticateToken, getMediaUploadLimit);

// POST upload profile picture (requires authentication)
router.post('/profile-picture', authenticateToken, dbMediaRateLimiter, uploadProfile.single('image'), uploadProfilePicture);

// POST upload chat media (requires authentication & friendship verification)
router.post('/chat-media', authenticateToken, dbMediaRateLimiter, async (req, res, next) => {
  const recipientId = req.headers['x-recipient-id'];
  const senderId = req.user.userId;

  if (recipientId) {
    try {
      const User = require('../models/User');
      const { isFriendsCached } = require('../utils/friendshipCache');
      const isFriend = await isFriendsCached(senderId, recipientId, User);
      if (!isFriend) {
        return res.status(403).json({ message: 'Access denied: You must be friends to upload media for this user.' });
      }
    } catch (err) {
      console.error('Friendship verification check failed in /chat-media:', err);
      return res.status(500).json({ message: 'Error checking friendship status', error: err.message });
    }
  }

  uploadChat.single('file')(req, res, (err) => {
    if (err) {
      console.error('Upload error in /chat-media:', err);
      return res.status(500).json({ message: 'Upload failed', error: err.message });
    }
    if (!req.file) return res.status(400).json({ message: 'No file uploaded' });
    res.json({ secure_url: req.file.path });
  });
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

const { checkEmailVerified } = require('../middleware/emailVerification');

// POST /api/auth/send-verification-otp
router.post('/send-verification-otp', authenticateToken, sendVerificationOtp);

// POST /api/auth/verify-email
router.post('/verify-email', authenticateToken, verifyEmail);

// GET firebase token for chat authentication (requires authentication)
router.get('/firebase-token', authenticateToken, checkEmailVerified, getFirebaseToken);

module.exports = router;
