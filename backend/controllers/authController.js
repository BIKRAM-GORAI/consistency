const User = require('../models/User');

/**
 * POST /api/auth/register
 * Register a new user with name, email, and password
 */
const register = async (req, res) => {
  try {
    const { name, email, password } = req.body;

    if (!name || !email || !password) {
      return res.status(400).json({ message: 'Name, email, and password are required' });
    }

    // Check if email already taken
    const existing = await User.findOne({ email: email.toLowerCase().trim() });
    if (existing) {
      return res.status(400).json({ message: 'An account with this email already exists' });
    }

    const user = new User({ name, email: email.toLowerCase().trim(), password });
    const saved = await user.save();

    res.status(201).json({ _id: saved._id, name: saved.name, email: saved.email });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

/**
 * POST /api/auth/login
 * Login with email and password — returns user info or 401
 */
const login = async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ message: 'Email and password are required' });
    }

    const user = await User.findOne({ email: email.toLowerCase().trim(), password });
    if (!user) {
      return res.status(401).json({ message: 'Invalid email or password' });
    }

    user.lastActiveAt = new Date();
    await user.save();

    res.json({ _id: user._id, name: user.name, email: user.email });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};


/**
 * GET /api/auth/:userId/achievements-privacy
 * Returns { achievementsPublic: Boolean }
 */
async function getAchievementPrivacy(req, res) {
  try {
    const user = await User.findById(req.params.userId).select('achievementsPublic');
    if (!user) return res.status(404).json({ message: 'User not found' });
    // Existing users have no field yet — treat as true (public)
    res.json({ achievementsPublic: user.achievementsPublic !== false });
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
}

/**
 * PATCH /api/auth/:userId/achievements-privacy
 * Body: { achievementsPublic: Boolean }
 */
async function setAchievementPrivacy(req, res) {
  try {
    const { achievementsPublic } = req.body;
    if (typeof achievementsPublic !== 'boolean') {
      return res.status(400).json({ message: 'achievementsPublic must be a boolean' });
    }
    const updated = await User.findByIdAndUpdate(
      req.params.userId,
      { achievementsPublic },
      { new: true }
    ).select('achievementsPublic');
    if (!updated) return res.status(404).json({ message: 'User not found' });
    res.json({ achievementsPublic: updated.achievementsPublic });
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
}

/**
 * GET /api/auth/:userId/settings
 */
async function getProfileSettings(req, res) {
  try {
    const user = await User.findById(req.params.userId).select('emailNotifications achievementsPublic');
    if (!user) return res.status(404).json({ message: 'User not found' });
    res.json({ 
      emailNotifications: user.emailNotifications !== false,
      achievementsPublic: user.achievementsPublic !== false
    });
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
}

/**
 * PATCH /api/auth/:userId/settings
 */
async function setProfileSettings(req, res) {
  try {
    const { emailNotifications } = req.body;
    if (typeof emailNotifications !== 'boolean') {
      return res.status(400).json({ message: 'emailNotifications must be a boolean' });
    }
    const updated = await User.findByIdAndUpdate(
      req.params.userId,
      { emailNotifications },
      { new: true }
    ).select('emailNotifications');
    if (!updated) return res.status(404).json({ message: 'User not found' });
    res.json({ emailNotifications: updated.emailNotifications });
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
}

module.exports = { register, login, getAchievementPrivacy, setAchievementPrivacy, getProfileSettings, setProfileSettings };
