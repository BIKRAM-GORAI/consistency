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
 */
const getAchievementsByDay = async (req, res) => {
  try {
    const docs = await Achievement.find({ dayId: req.params.dayId }).sort({ createdAt: 1 });
    const results = docs.map(d => ({ ...d.toObject(), links: effectiveLinks(d) }));
    res.json(results);
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
};

/**
 * GET /api/achievements/user/:userId  — public (group member view)
 */
const getAchievementsByUser = async (req, res) => {
  try {
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
