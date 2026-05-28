const AppLimit = require('../models/AppLimit');

/**
 * GET /api/applimits
 * Retrieve the app limits for the authenticated user
 */
const getAppLimits = async (req, res) => {
  try {
    const userId = req.user.userId;
    let limits = await AppLimit.findOne({ userId });
    
    if (!limits) {
      return res.json({ userId, enabled: false, apps: [] });
    }
    
    res.json(limits);
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

/**
 * PUT /api/applimits
 * Update or create the app limits for the authenticated user
 */
const updateAppLimits = async (req, res) => {
  try {
    const userId = req.user.userId;
    const { enabled, apps } = req.body;

    let limits = await AppLimit.findOne({ userId });
    if (!limits) {
      limits = new AppLimit({ userId, enabled: enabled !== false, apps: apps || [] });
    } else {
      limits.enabled = enabled !== false;
      limits.apps = apps || [];
    }

    const saved = await limits.save();
    res.json(saved);
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

module.exports = { getAppLimits, updateAppLimits };
