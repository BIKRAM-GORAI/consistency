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
    const owner = await User.findById(docs[0].userId).select('achievementsPublic');
    // If owner explicitly set private, return empty to member callers.
    // The owner themselves always sees their own data — no auth layer here,
    // so we use a query param ?own=1 from the frontend to bypass the check.
    if (owner && owner.achievementsPublic === false && !req.query.own) {
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
    const owner = await User.findById(req.params.userId).select('achievementsPublic');
    if (!owner) return res.status(404).json({ message: 'User not found' });

    // undefined means the field never existed (old user) → treat as public
    if (owner.achievementsPublic === false) {
      return res.status(403).json({ message: 'PRIVATE', achievementsPublic: false });
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
    const { title, description, links } = req.body;

    const achievement = await Achievement.findById(req.params.id);
    if (!achievement) return res.status(404).json({ message: 'Achievement not found' });

    // Verify ownership - only the owner can update their own achievements
    if (achievement.userId.toString() !== userId.toString()) {
      return res.status(403).json({ message: 'Access denied. You can only update your own achievements.' });
    }

    const normLinks = normalizeLinks(links);
    const updated = await Achievement.findByIdAndUpdate(
      req.params.id,
      { $set: { title, description: description || '', links: normLinks } },
      { new: true, runValidators: true }
    );
    res.json(sanitizeAchievement(updated));
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
};

/**
 * DELETE /api/achievements/:id
 * Delete an achievement
 * Only the owner of the achievement can delete it
 */
const deleteAchievement = async (req, res) => {
  try {
    // Get userId from authenticated user (from JWT token)
    const userId = req.user.userId;

    const achievement = await Achievement.findById(req.params.id);
    if (!achievement) return res.status(404).json({ message: 'Achievement not found' });

    // Verify ownership - only the owner can delete their own achievements
    if (achievement.userId.toString() !== userId.toString()) {
      return res.status(403).json({ message: 'Access denied. You can only delete your own achievements.' });
    }

    await Achievement.findByIdAndDelete(req.params.id);
    res.json({ message: 'Achievement deleted' });
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
};

module.exports = {
  getAllAchievements,
  getAchievementsByDay,
  getAchievementsByUser,
  createAchievement,
  updateAchievement,
  deleteAchievement,
};
