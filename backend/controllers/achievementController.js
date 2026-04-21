const Achievement = require('../models/Achievement');

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
 * GET /api/achievements?userId=...
 */
const getAllAchievements = async (req, res) => {
  try {
    const { userId } = req.query;
    if (!userId) return res.status(400).json({ message: 'userId is required' });

    const docs = await Achievement.find({ userId }).sort({ date: -1, createdAt: -1 });
    const results = docs.map(d => ({ ...d.toObject(), links: effectiveLinks(d) }));
    res.json(results);
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

    const results = docs.map(d => ({ ...d.toObject(), links: effectiveLinks(d) }));
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
    const results = docs.map(d => ({ ...d.toObject(), links: effectiveLinks(d) }));
    res.json(results);
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
};

/**
 * POST /api/achievements
 */
const createAchievement = async (req, res) => {
  try {
    const { userId, dayId, date, title, description, links } = req.body;
    if (!userId || !dayId || !date || !title) {
      return res.status(400).json({ message: 'userId, dayId, date and title are required' });
    }

    const normLinks = normalizeLinks(links);
    const achievement = new Achievement({
      userId, dayId, date, title,
      description: description || '',
      links: normLinks,
    });
    const saved = await achievement.save();
    res.status(201).json({ ...saved.toObject(), links: effectiveLinks(saved) });
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
};

/**
 * PUT /api/achievements/:id
 */
const updateAchievement = async (req, res) => {
  try {
    const { title, description, links } = req.body;
    const normLinks = normalizeLinks(links);
    const updated = await Achievement.findByIdAndUpdate(
      req.params.id,
      { $set: { title, description: description || '', links: normLinks } },
      { new: true, runValidators: true }
    );
    if (!updated) return res.status(404).json({ message: 'Achievement not found' });
    res.json({ ...updated.toObject(), links: effectiveLinks(updated) });
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
};

/**
 * DELETE /api/achievements/:id
 */
const deleteAchievement = async (req, res) => {
  try {
    const deleted = await Achievement.findByIdAndDelete(req.params.id);
    if (!deleted) return res.status(404).json({ message: 'Achievement not found' });
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
