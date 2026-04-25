const User = require('../models/User');
const { cloudinary } = require('../config/cloudinary');

/**
 * POST /api/auth/register
 * Register a new user with name, email, and password
 */
const register = async (req, res) => {
  try {
    const { name, email, password, username } = req.body;

    if (!name || !email || !password || !username) {
      return res.status(400).json({ message: 'Name, username, email, and password are required' });
    }

    // Check if email already taken
    const existing = await User.findOne({ email: email.toLowerCase().trim() });
    if (existing) {
      return res.status(400).json({ message: 'An account with this email already exists' });
    }

    // Check if username already taken
    const existingUser = await User.findOne({ username: username.toLowerCase().trim() });
    if (existingUser) {
      return res.status(400).json({ message: 'This username is already taken' });
    }

    const user = new User({ name, username: username.toLowerCase().trim(), email: email.toLowerCase().trim(), password });
    const saved = await user.save();

    res.status(201).json({ _id: saved._id, name: saved.name, email: saved.email, profilePicture: saved.profilePicture });
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

    res.json({ _id: user._id, name: user.name, email: user.email, profilePicture: user.profilePicture });
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
    const user = await User.findById(req.params.userId).select('emailNotifications achievementsPublic email username profilePicture isPublicProfile');
    if (!user) return res.status(404).json({ message: 'User not found' });
    res.json({ 
      email: user.email,
      username: user.username || '',
      profilePicture: user.profilePicture || '',
      emailNotifications: user.emailNotifications !== false,
      achievementsPublic: user.achievementsPublic !== false,
      isPublicProfile: user.isPublicProfile !== false
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
    const { emailNotifications, isPublicProfile, username, oldPassword, newPassword } = req.body;
    
    const user = await User.findById(req.params.userId);
    if (!user) return res.status(404).json({ message: 'User not found' });

    let updates = {};

    if (typeof emailNotifications === 'boolean') {
      updates.emailNotifications = emailNotifications;
    }
    if (typeof isPublicProfile === 'boolean') {
      updates.isPublicProfile = isPublicProfile;
    }

    if (username !== undefined && username !== user.username) {
      if (user.username) {
        return res.status(400).json({ message: 'Username cannot be changed once set' });
      }
      if (username !== '') {
        const existingUser = await User.findOne({ username: username.toLowerCase().trim() });
        if (existingUser && existingUser._id.toString() !== user._id.toString()) {
          return res.status(400).json({ message: 'This username is already taken' });
        }
        updates.username = username.toLowerCase().trim();
      }
    }

    if (newPassword) {
      if (user.password !== oldPassword) {
        return res.status(400).json({ message: 'Incorrect current password' });
      }
      updates.password = newPassword;
    }

    if (Object.keys(updates).length > 0) {
      Object.assign(user, updates);
      await user.save();
    }
    
    res.json({ 
      emailNotifications: user.emailNotifications, 
      isPublicProfile: user.isPublicProfile,
      username: user.username,
      message: 'Profile updated successfully'
    });
  } catch (err) {
    if (err.name === 'ValidationError') {
      const messages = Object.values(err.errors).map(val => val.message);
      return res.status(400).json({ message: messages.join(', ') });
    }
    res.status(500).json({ message: 'Server error', error: err.message });
  }
}

/**
 * POST /api/auth/:userId/profile-picture
 */
async function uploadProfilePicture(req, res) {
  try {
    const user = await User.findById(req.params.userId);
    if (!user) return res.status(404).json({ message: 'User not found' });

    if (!req.file) {
      return res.status(400).json({ message: 'No file uploaded' });
    }

    if (user.profilePictureId) {
      await cloudinary.uploader.destroy(user.profilePictureId);
    }

    user.profilePicture = req.file.path;
    user.profilePictureId = req.file.filename;
    await user.save();

    res.json({ profilePicture: user.profilePicture, message: 'Profile picture updated successfully' });
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
}

module.exports = { register, login, getAchievementPrivacy, setAchievementPrivacy, getProfileSettings, setProfileSettings, uploadProfilePicture };
