const Day = require('../models/Day');
const Goal = require('../models/Goal');
const Achievement = require('../models/Achievement');
const Group = require('../models/Group');
const Template = require('../models/Template');
const Badge = require('../models/Badge');

/**
 * GET /api/sync/audit
 * Returns a list of all valid _ids for major entities owned by or associated with the user.
 * Used by the PWA to prune "zombie" data from local IndexedDB.
 */
const syncAudit = async (req, res) => {
  try {
    const userId = req.user.userId;

    // Fetch all IDs in parallel for maximum performance
    const [days, goals, achievements, groups, templates, badges] = await Promise.all([
      Day.find({ userId }).select('_id'),
      Goal.find({ userId }).select('_id'),
      Achievement.find({ userId }).select('_id'),
      Group.find({ members: userId }).select('_id'),
      Template.find({ userId }).select('_id'),
      Badge.find({}).select('_id') // Badges are global
    ]);

    res.json({
      days: days.map(d => d._id),
      goals: goals.map(g => g._id),
      achievements: achievements.map(a => a._id),
      groups: groups.map(gr => gr._id),
      templates: templates.map(t => t._id),
      badges: badges.map(b => b._id)
    });
  } catch (error) {
    console.error('Sync audit error:', error);
    res.status(500).json({ 
      message: 'Server error during sync audit', 
      error: error.message 
    });
  }
};

module.exports = { syncAudit };
