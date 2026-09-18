const Achievement = require('../models/Achievement');
const { sanitizeAchievement } = require('../utils/sanitizer');

/** Ensure every URL has a protocol prefix */
function normalizeLinks(links = []) {
  return links
    .map(l => l.trim())
    .filter(Boolean)
    .map(l => (/^https?:\/\//i.test(l) ? l : `https://${l}`));
}

/** Merge old single-link field into links array for backward compat */
function effectiveLinks(doc) {
  const arr = Array.isArray(doc.links) ? [...doc.links] : [];
  if (doc.link && !arr.includes(doc.link)) arr.push(doc.link);
  return arr;
}

/**
 * GET /api/achievements?page=1&limit=10
 * Get paginated achievements for the authenticated user
 * Default: 10 achievements per page
 */
const getAllAchievements = async (req, res) => {
  try {
    // Get userId from authenticated user (from JWT token)
    const userId = req.user.userId;

    // Get pagination parameters from query string
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;

    // Validate pagination parameters
    if (page < 1) {
      return res.status(400).json({ message: 'Page number must be greater than 0' });
    }
    if (limit < 1 || limit > 50) {
      return res.status(400).json({ message: 'Limit must be between 1 and 50' });
    }

    // Calculate skip value for pagination
    const skip = (page - 1) * limit;

    // Get total count of achievements for the user
    const total = await Achievement.countDocuments({ userId });

    // Get paginated achievements
    const docs = await Achievement.find({ userId })
      .sort({ date: -1, createdAt: -1 })
      .skip(skip)
      .limit(limit);

    // Sanitize achievements to remove internal IDs
    const results = docs.map(d => sanitizeAchievement(d));

    // Calculate pagination metadata
    const totalPages = Math.ceil(total / limit);
    const hasNextPage = page < totalPages;
    const hasPrevPage = page > 1;

    res.json({
      achievements: results,
      pagination: {
        currentPage: page,
        totalPages,
        totalItems: total,
        itemsPerPage: limit,
        hasNextPage,
        hasPrevPage
      }
    });
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
};

/**
 * GET /api/achievements/day/:dayId
 * Returns [] (empty) if the day's owner has set their achievements to private.
 */
const getAchievementsByDay = async (req, res) => {
  try {
    const docs = await Achievement.find({ dayId: req.params.dayId }).sort({ createdAt: 1 });
    if (!docs.length) return res.json([]);

    // Check owner privacy (take userId from first doc)
    const User = require('../models/User');
    const Group = require('../models/Group');
    const ownerId = docs[0].userId;
    const requesterId = req.user.userId;

    const isOwner = String(ownerId) === String(requesterId);
    let canView = isOwner;

    if (!canView) {
      // Check shared groups
      const sharedGroups = await Group.find({
        members: { $all: [ownerId, requesterId] }
      });
      if (sharedGroups.length > 0) {
        const owner = await User.findById(ownerId).select('achievementsPublic');
        if (owner && owner.achievementsPublic !== false) {
          canView = true;
        }
      }
    }

    if (!canView) {
      return res.json([]);
    }

    const results = docs.map(d => sanitizeAchievement(d));
    res.json(results);
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
};

/**
 * GET /api/achievements/user/:userId  — public (group member view)
 * Blocked if the user has set their achievements to private.
 */
const getAchievementsByUser = async (req, res) => {
  try {
    const User = require('../models/User');
    const ProfileShare = require('../models/ProfileShare');
    const owner = await User.findById(req.params.userId).select('achievementsPublic isPublicProfile');
    if (!owner) return res.status(404).json({ message: 'User not found' });

    const requesterId = req.user ? req.user.userId : null;
    const isOwner = requesterId && String(requesterId) === String(owner._id);

    // undefined means the field never existed (old user) → treat as public
    if (owner.achievementsPublic === false && !isOwner) {
      return res.status(403).json({ message: 'PRIVATE', achievementsPublic: false });
    }

    let canView = isOwner || owner.isPublicProfile !== false;
    const { code } = req.query;
    if (!canView && code) {
      const validShare = await ProfileShare.findOne({
        userId: owner._id,
        shareCode: code,
        expiresAt: { $gt: new Date() }
      });
      if (validShare) {
        canView = true;
      }
    }

    if (!canView) {
      return res.status(403).json({ message: 'This profile is private' });
    }

    const docs = await Achievement
      .find({ userId: req.params.userId })
      .sort({ date: -1, createdAt: -1 });
    const results = docs.map(d => sanitizeAchievement(d));
    res.json(results);
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
};

/**
 * POST /api/achievements
 * Create a new achievement for the authenticated user
 */
const createAchievement = async (req, res) => {
  try {
    // Get userId from authenticated user (from JWT token)
    const userId = req.user.userId;
    const { dayId, date, title, description, links } = req.body;
    if (!dayId || !date || !title) {
      return res.status(400).json({ message: 'dayId, date and title are required' });
    }

    const normLinks = normalizeLinks(links);
    const achievement = new Achievement({
      userId, dayId, date, title,
      description: description || '',
      links: normLinks,
    });
    const saved = await achievement.save();
    res.status(201).json(sanitizeAchievement(saved));
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
};

/**
 * PUT /api/achievements/:id
 * Update an achievement
 * Only the owner of the achievement can update it
 */
const updateAchievement = async (req, res) => {
  try {
    // Get userId from authenticated user (from JWT token)
    const userId = req.user.userId;
    const { title, description, links, caption, photoId } = req.body;

    const achievement = await Achievement.findById(req.params.id);
    if (!achievement) return res.status(404).json({ message: 'Achievement not found' });

    // Verify ownership - only the owner can update their own achievements
    if (achievement.userId.toString() !== userId.toString()) {
      return res.status(403).json({ message: 'Access denied. You can only update your own achievements.' });
    }

    const normLinks = links !== undefined ? normalizeLinks(links) : achievement.links;
    const finalTitle = (title !== undefined && title.trim()) ? title.trim().slice(0, 30) : achievement.title;
    const finalDesc = description !== undefined ? description : (caption !== undefined ? caption : achievement.description);

    let updatedPhotos = achievement.photos || [];
    if (caption !== undefined) {
      if (photoId) {
        updatedPhotos = updatedPhotos.map(p => {
          const obj = p.toObject ? p.toObject() : { ...p };
          if (String(obj._id) === String(photoId)) {
            obj.caption = caption;
          }
          return obj;
        });
      } else if (updatedPhotos.length > 0) {
        const first = updatedPhotos[0].toObject ? updatedPhotos[0].toObject() : { ...updatedPhotos[0] };
        first.caption = caption;
        updatedPhotos[0] = first;
      }
    }

    const updated = await Achievement.findByIdAndUpdate(
      req.params.id,
      { $set: { title: finalTitle, description: finalDesc, links: normLinks, photos: updatedPhotos } },
      { new: true, runValidators: true }
    );
    res.json(sanitizeAchievement(updated));
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
};

function getEffectiveToday(req) {
  const clientDate = req.headers['x-client-date'];
  if (clientDate && /^\d{4}-\d{2}-\d{2}$/.test(clientDate)) {
    return clientDate;
  }
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/**
 * GET /api/achievements/photo-quota
 * Returns remaining daily photo upload quota for today
 */
const getPhotoQuota = async (req, res) => {
  try {
    const userId = req.user.userId;
    const todayStr = getEffectiveToday(req);
    const dayId = req.query.dayId || req.headers['x-day-id'];
    const cardDate = req.query.cardDate || req.headers['x-card-date'] || todayStr;
    const User = require('../models/User');
    const user = await User.findById(userId).select('subscriptionTier subscriptionExpiresAt');
    const isPremium = user?.subscriptionTier === 'premium' && (!user.subscriptionExpiresAt || new Date(user.subscriptionExpiresAt) > new Date());

    const limit = isPremium
      ? (parseInt(process.env.PREMIUM_DAILY_ACHIEVEMENT_PHOTOS_LIMIT, 10) || 3)
      : (parseInt(process.env.FREE_DAILY_ACHIEVEMENT_PHOTOS_LIMIT, 10) || 3);

    const mongoose = require('mongoose');
    let query = { userId, type: 'photo' };
    if (dayId && mongoose.Types.ObjectId.isValid(dayId)) {
      query.dayId = dayId;
    } else {
      query.date = cardDate;
    }

    const cardAchievements = await Achievement.find(query);
    const used = cardAchievements.reduce((acc, a) => acc + (a.photos ? a.photos.length : 0), 0);
    const remaining = Math.max(0, limit - used);

    res.json({
      used,
      limit,
      remaining,
      cardDate,
      todayDate: todayStr
    });
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
};

/**
 * POST /api/achievements/photo
 * Upload up to 3 compressed photos for an active daily card (today or within 36-hour window / grace)
 */
const createPhotoAchievement = async (req, res) => {
  const { deleteFromAchievementCloudinary, uploadToAchievementCloudinary } = require('../config/cloudinary');
  const uploadedPublicIds = []; // track for cleanup on error
  try {
    const userId = req.user.userId;
    const { dayId, date, title, description } = req.body;
    const todayStr = getEffectiveToday(req);

    if (!dayId || !date) {
      return res.status(400).json({ message: 'dayId and date are required' });
    }

    const Day = require('../models/Day');
    const day = await Day.findOne({ _id: dayId, userId });
    if (!day) {
      return res.status(404).json({ message: 'Day card not found or unauthorized.' });
    }

    const cardDateNormalized = (day.date || date).split('T')[0];

    // Reject future dates
    if (cardDateNormalized > todayStr) {
      return res.status(400).json({ message: 'Photo achievements cannot be logged for future cards.' });
    }

    // Check 36-hour window (until 12:00 noon next day) for past dates
    let isWithinWindow = false;
    if (cardDateNormalized < todayStr) {
      const offsetHeader = req.headers['x-client-timezone-offset'];
      if (offsetHeader !== undefined && !isNaN(parseInt(offsetHeader, 10))) {
        const offsetMinutes = parseInt(offsetHeader, 10);
        const clientLocalNow = new Date(Date.now() - offsetMinutes * 60000);
        const [cy, cm, cd] = cardDateNormalized.split('-').map(Number);
        const cardStartLocal = new Date(Date.UTC(cy, cm - 1, cd, 0, 0, 0, 0));
        const diffHours = (clientLocalNow - cardStartLocal) / (1000 * 60 * 60);
        isWithinWindow = diffHours <= 36;
      } else {
        const [cy, cm, cd] = cardDateNormalized.split('-').map(Number);
        const [ty, tm, td] = todayStr.split('-').map(Number);
        const diffDays = Math.round((Date.UTC(ty, tm - 1, td) - Date.UTC(cy, cm - 1, cd)) / (24 * 3600 * 1000));
        if (diffDays === 1) {
          const now = new Date();
          const cardDateObj = new Date(cardDateNormalized);
          const serverDiffHours = (now - cardDateObj) / (1000 * 60 * 60);
          isWithinWindow = serverDiffHours <= 40;
        }
      }
    }

    if (cardDateNormalized !== todayStr && !isWithinWindow && !day.graceApplied) {
      return res.status(400).json({
        message: 'Photo achievements can only be logged for active cards within the 36-hour window (until 12:00 noon the next day).'
      });
    }

    const files = req.files || [];
    if (!files.length) {
      return res.status(400).json({ message: 'At least one photo is required.' });
    }

    const User = require('../models/User');
    const user = await User.findById(userId).select('subscriptionTier subscriptionExpiresAt');
    const isPremium = user?.subscriptionTier === 'premium' && (!user.subscriptionExpiresAt || new Date(user.subscriptionExpiresAt) > new Date());
    const limit = isPremium
      ? (parseInt(process.env.PREMIUM_DAILY_ACHIEVEMENT_PHOTOS_LIMIT, 10) || 3)
      : (parseInt(process.env.FREE_DAILY_ACHIEVEMENT_PHOTOS_LIMIT, 10) || 3);

    const cardAchievements = await Achievement.find({ userId, dayId, type: 'photo' });
    const currentUsed = cardAchievements.reduce((acc, a) => acc + (a.photos ? a.photos.length : 0), 0);

    if (currentUsed + files.length > limit) {
      return res.status(400).json({
        message: `Daily limit reached. You can only upload ${Math.max(0, limit - currentUsed)} more photo(s) for this card.`,
        remaining: Math.max(0, limit - currentUsed)
      });
    }

    // Upload each buffer to Cloudinary with achievement credentials concurrently
    const uploadResults = await Promise.all(
      files.map(f =>
        uploadToAchievementCloudinary(f.buffer, {
          resource_type: 'image',
          transformation: [{ quality: 'auto', fetch_format: 'auto' }]
        })
      )
    );

    const photos = [];
    for (const result of uploadResults) {
      uploadedPublicIds.push(result.public_id);
      const rawUrl = result.secure_url;
      const thumbUrl = rawUrl.replace('/upload/', '/upload/c_limit,w_800,q_auto,f_auto/');
      const fullUrl = rawUrl.replace('/upload/', '/upload/c_limit,w_1600,q_auto,f_auto/');
      photos.push({
        url: fullUrl,
        thumbnailUrl: thumbUrl,
        publicId: result.public_id,
        caption: (description && description.trim()) || '',
        uploadedAt: new Date()
      });
    }

    // If a photo achievement already exists for this day card, append photos to it
    let existingAch = await Achievement.findOne({ userId, dayId, type: 'photo' });
    if (existingAch) {
      existingAch.photos.push(...photos);
      if (description && description.trim()) {
        existingAch.description = existingAch.description
          ? `${existingAch.description}\n${description.trim()}`
          : description.trim();
      }
      const saved = await existingAch.save();
      return res.status(200).json(sanitizeAchievement(saved));
    }

    const achievement = new Achievement({
      userId,
      dayId,
      date: cardDateNormalized,
      title: (title && title.trim()) ? title.trim() : '',
      description: (description && description.trim()) || '',
      type: 'photo',
      photos
    });

    const saved = await achievement.save();
    res.status(201).json(sanitizeAchievement(saved));
  } catch (err) {
    // Clean up any Cloudinary photos that were already uploaded before the error
    if (uploadedPublicIds.length) {
      for (const pid of uploadedPublicIds) {
        await deleteFromAchievementCloudinary(pid).catch(() => {});
      }
    }
    console.error('[createPhotoAchievement] Error:', err);
    res.status(500).json({ message: 'Server error', error: err.message });
  }
};

/**
 * DELETE /api/achievements/:id
 * Delete an achievement and clean up Cloudinary photos
 */
const deleteAchievement = async (req, res) => {
  try {
    const userId = req.user.userId;
    const mongoose = require('mongoose');

    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(200).json({ message: 'Achievement deleted', deletedPhotosCount: 0 });
    }

    const achievement = await Achievement.findById(req.params.id);
    if (!achievement) return res.status(404).json({ message: 'Achievement not found' });

    if (achievement.userId.toString() !== userId.toString()) {
      return res.status(403).json({ message: 'Access denied. You can only delete your own achievements.' });
    }

    const deletedPhotosCount = achievement.photos ? achievement.photos.length : 0;
    if (achievement.photos && achievement.photos.length > 0) {
      const { deleteFromAchievementCloudinary } = require('../config/cloudinary');
      for (const p of achievement.photos) {
        if (p.publicId) {
          await deleteFromAchievementCloudinary(p.publicId);
        }
      }
    }

    await Achievement.findByIdAndDelete(req.params.id);
    res.json({ message: 'Achievement deleted', deletedPhotosCount });
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
};

/**
 * DELETE /api/achievements/:id/photos/:photoId
 * Delete a single photo from an achievement, freeing quota
 */
const deletePhotoFromAchievement = async (req, res) => {
  try {
    const userId = req.user.userId;
    const { id, photoId } = req.params;

    const achievement = await Achievement.findById(id);
    if (!achievement) return res.status(404).json({ message: 'Achievement not found' });

    if (achievement.userId.toString() !== userId.toString()) {
      return res.status(403).json({ message: 'Access denied.' });
    }

    const photoIndex = (achievement.photos || []).findIndex(p => p._id.toString() === photoId);
    if (photoIndex === -1) return res.status(404).json({ message: 'Photo not found in achievement' });

    const photoToDelete = achievement.photos[photoIndex];
    if (photoToDelete.publicId) {
      const { deleteFromAchievementCloudinary } = require('../config/cloudinary');
      await deleteFromAchievementCloudinary(photoToDelete.publicId);
    }

    achievement.photos.splice(photoIndex, 1);

    if (achievement.photos.length === 0 && achievement.type === 'photo') {
      await Achievement.findByIdAndDelete(id);
      return res.json({ message: 'Photo deleted and empty achievement removed', deletedAchievementId: id });
    }

    await achievement.save();
    res.json(sanitizeAchievement(achievement));
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
};

/**
 * POST /api/achievements/days-batch
 * Fetch achievements for multiple day IDs in one request (Optimization)
 */
const getAchievementsByDaysBatch = async (req, res) => {
  try {
    const { dayIds } = req.body;
    if (!dayIds || !Array.isArray(dayIds)) {
      return res.status(400).json({ message: 'dayIds array is required' });
    }

    const requesterId = req.user.userId;

    const docs = await Achievement.find({ dayId: { $in: dayIds }, userId: requesterId }).sort({ createdAt: 1 });
    if (!docs.length) return res.json([]);

    const results = docs.map(d => sanitizeAchievement(d));
    res.json(results);
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
};

module.exports = {
  getAllAchievements,
  getAchievementsByDay,
  getAchievementsByDaysBatch,
  getAchievementsByUser,
  getPhotoQuota,
  createAchievement,
  createPhotoAchievement,
  updateAchievement,
  deleteAchievement,
  deletePhotoFromAchievement,
};
