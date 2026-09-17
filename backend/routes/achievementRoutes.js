const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/achievementController');
const { createAchievementValidation, updateAchievementValidation } = require('../middleware/validation');
const { authenticateToken } = require('../middleware/auth');
const { checkEmailVerified } = require('../middleware/emailVerification');
const { uploadAchievementPhoto } = require('../config/cloudinary');

// Multer error handling wrapper for strict 1.5MB size constraint
const handleAchievementUpload = (req, res, next) => {
  const maxPhotos = Math.max(
    parseInt(process.env.PREMIUM_DAILY_ACHIEVEMENT_PHOTOS_LIMIT, 10) || 3,
    parseInt(process.env.FREE_DAILY_ACHIEVEMENT_PHOTOS_LIMIT, 10) || 3,
    10
  );
  uploadAchievementPhoto.array('photos', maxPhotos)(req, res, (err) => {
    if (err) {
      if (err.code === 'LIMIT_FILE_SIZE') {
        return res.status(413).json({ message: 'File too large. Maximum allowed photo size is 1.5MB.' });
      }
      if (err.message && (err.message.includes('403') || err.http_code === 403)) {
        return res.status(403).json({ 
          message: 'Cloudinary 403 Forbidden: Missing "create" upload permission on this API key. In Cloudinary Settings -> Access Keys, edit this key and enable "Create / Upload" permissions (or use the Master API Key from your Cloudinary Dashboard).' 
        });
      }
      if (err.message && (err.message.includes('cloud_name') || err.http_code === 401)) {
        return res.status(400).json({ 
          message: `Cloudinary error: "${err.message}". In .env, ACHIEVEMENT_CLOUDINARY_CLOUD_NAME must be your Cloud Name from your Cloudinary Dashboard header (not the Key Name).` 
        });
      }
      return res.status(400).json({ message: err.message || 'Image upload error' });
    }
    next();
  });
};

// Fast pre-check to reject requests if daily quota is already exhausted before streaming to Cloudinary
const preCheckPhotoQuota = async (req, res, next) => {
  try {
    const userId = req.user.userId;
    const clientDate = req.headers['x-client-date'];
    const d = new Date();
    const serverToday = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    const effectiveToday = (clientDate && /^\d{4}-\d{2}-\d{2}$/.test(clientDate)) ? clientDate : serverToday;

    const User = require('../models/User');
    const user = await User.findById(userId).select('subscriptionTier subscriptionExpiresAt');
    const isPremium = user?.subscriptionTier === 'premium' && (!user.subscriptionExpiresAt || new Date(user.subscriptionExpiresAt) > new Date());
    const limit = isPremium
      ? (parseInt(process.env.PREMIUM_DAILY_ACHIEVEMENT_PHOTOS_LIMIT, 10) || 3)
      : (parseInt(process.env.FREE_DAILY_ACHIEVEMENT_PHOTOS_LIMIT, 10) || 3);

    const Achievement = require('../models/Achievement');
    const todayAchievements = await Achievement.find({ userId, date: effectiveToday, type: 'photo' });
    const used = todayAchievements.reduce((acc, a) => acc + (a.photos ? a.photos.length : 0), 0);

    if (used >= limit) {
      return res.status(400).json({
        message: `Daily photo upload quota reached (${limit}/${limit}). Delete an existing photo to free up quota.`,
        remaining: 0
      });
    }
    next();
  } catch (err) {
    next();
  }
};

router.get('/', authenticateToken, ctrl.getAllAchievements);
router.get('/photo-quota', authenticateToken, ctrl.getPhotoQuota);
router.get('/day/:dayId', authenticateToken, ctrl.getAchievementsByDay);
router.post('/days-batch', authenticateToken, ctrl.getAchievementsByDaysBatch);
router.get('/user/:userId', authenticateToken, ctrl.getAchievementsByUser);

router.post('/', authenticateToken, checkEmailVerified, createAchievementValidation, ctrl.createAchievement);
router.post('/photo', authenticateToken, checkEmailVerified, preCheckPhotoQuota, handleAchievementUpload, ctrl.createPhotoAchievement);
router.put('/:id', authenticateToken, checkEmailVerified, updateAchievementValidation, ctrl.updateAchievement);
router.delete('/:id', authenticateToken, checkEmailVerified, ctrl.deleteAchievement);
router.delete('/:id/photos/:photoId', authenticateToken, checkEmailVerified, ctrl.deletePhotoFromAchievement);

module.exports = router;
