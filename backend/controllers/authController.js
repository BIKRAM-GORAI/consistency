const User = require('../models/User');
const { cloudinary } = require('../config/cloudinary');
const bcrypt = require('bcrypt');
const { generateToken } = require('../middleware/auth');
const { incrementFailedAttempts, resetFailedAttempts } = require('../middleware/accountLockout');
const saltRounds = 10; // Number of salt rounds for bcrypt hashing

/**
 * POST /api/auth/register
 * Register a new user with name, email, and password
 * Password is hashed using bcrypt before storage
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

    // Hash the password using bcrypt
    const hashedPassword = await bcrypt.hash(password, saltRounds);

    const user = new User({
      name,
      username: username.toLowerCase().trim(),
      email: email.toLowerCase().trim(),
      password: hashedPassword
    });
    const saved = await user.save();

    // Generate JWT token for the new user
    const token = generateToken(saved._id, saved.email);

    res.status(201).json({
      _id: saved._id,
      name: saved.name,
      email: saved.email,
      profilePicture: saved.profilePicture,
      token
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

/**
 * POST /api/auth/login
 * Login with email and password — returns user info or 401
 * Password is verified using bcrypt.compare
 * Implements account lockout after 5 failed attempts
 */
const login = async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ message: 'Email and password are required' });
    }

    const user = await User.findOne({ email: email.toLowerCase().trim() });
    if (!user) {
      return res.status(401).json({ message: 'Invalid email or password' });
    }

    // Verify password using bcrypt.compare
    const isPasswordValid = await bcrypt.compare(password, user.password);
    if (!isPasswordValid) {
      // Increment failed login attempts
      await incrementFailedAttempts(user);

      // Check if this was the final attempt that locked the account
      const updatedUser = await User.findById(user._id);
      if (updatedUser.lockUntil && updatedUser.lockUntil > Date.now()) {
        const remainingTime = Math.ceil((updatedUser.lockUntil - Date.now()) / 1000 / 60);
        return res.status(423).json({
          message: `Account locked due to too many failed login attempts. Please try again in ${remainingTime} minutes.`,
          locked: true,
          remainingTime
        });
      }

      return res.status(401).json({ message: 'Invalid email or password' });
    }

    // Reset failed login attempts on successful login
    await resetFailedAttempts(user._id);

    user.lastActiveAt = new Date();
    await user.save();

    // Generate JWT token for the authenticated user
    const token = generateToken(user._id, user.email);

    res.json({
      _id: user._id,
      name: user.name,
      email: user.email,
      profilePicture: user.profilePicture,
      token
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};


/**
 * GET /api/auth/achievements-privacy
 * Returns { achievementsPublic: Boolean } for the authenticated user
 */
async function getAchievementPrivacy(req, res) {
  try {
    // Get userId from authenticated user (from JWT token)
    const userId = req.user.userId;

    const user = await User.findById(userId).select('achievementsPublic');
    if (!user) return res.status(404).json({ message: 'User not found' });
    // Existing users have no field yet — treat as true (public)
    res.json({ achievementsPublic: user.achievementsPublic !== false });
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
}

/**
 * PATCH /api/auth/achievements-privacy
 * Body: { achievementsPublic: Boolean }
 */
async function setAchievementPrivacy(req, res) {
  try {
    // Get userId from authenticated user (from JWT token)
    const userId = req.user.userId;
    const { achievementsPublic } = req.body;
    if (typeof achievementsPublic !== 'boolean') {
      return res.status(400).json({ message: 'achievementsPublic must be a boolean' });
    }
    const updated = await User.findByIdAndUpdate(
      userId,
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
 * GET /api/auth/settings
 * Get profile settings for the authenticated user
 */
async function getProfileSettings(req, res) {
  try {
    // Get userId from authenticated user (from JWT token)
    const userId = req.user.userId;

    const user = await User.findById(userId).select('emailNotifications achievementsPublic email username profilePicture isPublicProfile');
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
 * PATCH /api/auth/settings
 * Update profile settings for the authenticated user
 */
async function setProfileSettings(req, res) {
  try {
    // Get userId from authenticated user (from JWT token)
    const userId = req.user.userId;
    const { emailNotifications, isPublicProfile, username, oldPassword, newPassword } = req.body;

    const user = await User.findById(userId);
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
      // Verify current password using bcrypt.compare
      const isCurrentPasswordValid = await bcrypt.compare(oldPassword, user.password);
      if (!isCurrentPasswordValid) {
        return res.status(400).json({ message: 'Incorrect current password' });
      }
      // Hash the new password before storing
      updates.password = await bcrypt.hash(newPassword, saltRounds);
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
 * POST /api/auth/profile-picture
 * Upload profile picture for the authenticated user
 */
async function uploadProfilePicture(req, res) {
  try {
    // Get userId from authenticated user (from JWT token)
    const userId = req.user.userId;

    const user = await User.findById(userId);
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
