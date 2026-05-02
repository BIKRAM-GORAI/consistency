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

    const user = await User.findById(userId).select('emailNotifications achievementsPublic email username profilePicture isPublicProfile leetcodeUsername leetcodePendingUsername leetcodeVerificationCode leetcodeVerificationExpiry leetcodeLastVerifiedAt leetcodeUsernameChangeCount leetcodeProfilePicture leetcodeVerificationStatus leetcodeRetryScheduledAt');
    if (!user) return res.status(404).json({ message: 'User not found' });
    res.json({
      email: user.email,
      username: user.username || '',
      profilePicture: user.profilePicture || '',
      emailNotifications: user.emailNotifications !== false,
      achievementsPublic: user.achievementsPublic !== false,
      isPublicProfile: user.isPublicProfile !== false,
      leetcodeUsername: user.leetcodeUsername || null,
      leetcodePendingUsername: user.leetcodePendingUsername || null,
      leetcodeVerificationCode: user.leetcodeVerificationCode || null,
      leetcodeVerificationExpiry: user.leetcodeVerificationExpiry || null,
      leetcodeLastVerifiedAt: user.leetcodeLastVerifiedAt || null,
      leetcodeUsernameChangeCount: user.leetcodeUsernameChangeCount || 0,
      leetcodeProfilePicture: user.leetcodeProfilePicture || '',
      leetcodeVerificationStatus: user.leetcodeVerificationStatus || 'none',
      leetcodeRetryScheduledAt: user.leetcodeRetryScheduledAt || null
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

const crypto = require('crypto');
const { sendEmail } = require('../utils/email');

/**
 * POST /api/auth/forgot-password-otp
 * Generates a 6-digit OTP, saves hash to DB, and emails it
 */
async function forgotPasswordOtp(req, res) {
  try {
    const { email } = req.body;
    if (!email) return res.status(400).json({ message: 'Email is required' });

    const user = await User.findOne({ email: email.toLowerCase().trim() });
    if (!user) return res.status(404).json({ message: 'No account found with that email' });

    // Generate 6-digit OTP
    const otp = crypto.randomInt(100000, 999999).toString();
    const salt = await bcrypt.genSalt(10);
    const hashedOtp = await bcrypt.hash(otp, salt);

    user.resetOtp = hashedOtp;
    user.resetOtpExpire = Date.now() + 5 * 60 * 1000; // 5 mins
    user.resetOtpAttempts = 0;
    await user.save();

    const htmlMessage = `
      <div style="font-family: 'Inter', sans-serif; padding: 24px; color: #333; max-width: 500px; margin: 0 auto; border: 2px solid #ddd; border-radius: 8px;">
        <h2 style="color: #0a0a0a; margin-top: 0;">Password Reset Request</h2>
        <p style="font-size: 16px; line-height: 1.5;">You requested a password reset for your account. This email was sent to you directly by the <strong>Consistency Tracker App</strong>.</p>
        <p style="font-size: 16px; line-height: 1.5; margin-bottom: 24px;">Your one-time password (OTP) is:</p>
        
        <div style="text-align: center; margin-bottom: 24px;">
          <div style="background-color: #0a0a0a; color: #FFD60A; padding: 16px 24px; display: inline-block; border-radius: 6px; font-size: 28px; font-weight: 900; letter-spacing: 6px; font-family: monospace;">
            ${otp}
          </div>
        </div>

        <p style="color: #EF4444; font-weight: bold; font-size: 15px; text-align: center;">This code is valid for 5 minutes.</p>
        
        <hr style="border: none; border-top: 1px dashed #ccc; margin: 24px 0;" />
        <p style="font-size: 13px; color: #777; margin-bottom: 0;">If you did not request this, please ignore this email. Your password will remain unchanged.</p>
      </div>
    `;

    await sendEmail({
      to: user.email,
      subject: 'Your Password Reset OTP — Consistency Tracker',
      html: htmlMessage
    });

    res.json({ message: 'OTP sent successfully' });
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
}

/**
 * POST /api/auth/validate-otp
 * Validates the OTP purely for frontend UI flow (unlocking password fields)
 */
async function validateOtp(req, res) {
  try {
    const { email, otp } = req.body;
    if (!email || !otp) return res.status(400).json({ message: 'Email and OTP are required' });

    const user = await User.findOne({ email: email.toLowerCase().trim() });
    if (!user || !user.resetOtp || !user.resetOtpExpire) {
      return res.status(400).json({ message: 'Invalid or expired OTP' });
    }

    // Check expiry
    if (Date.now() > user.resetOtpExpire) {
      user.resetOtp = undefined;
      user.resetOtpExpire = undefined;
      user.resetOtpAttempts = 0;
      await user.save();
      return res.status(400).json({ message: 'OTP has expired' });
    }

    const isMatch = await bcrypt.compare(otp.toString(), user.resetOtp);
    if (!isMatch) {
      user.resetOtpAttempts += 1;
      if (user.resetOtpAttempts >= 5) {
        user.resetOtp = undefined;
        user.resetOtpExpire = undefined;
        user.resetOtpAttempts = 0;
        await user.save();
        return res.status(400).json({ message: 'Too many failed attempts. OTP invalidated.' });
      }
      await user.save();
      return res.status(400).json({ message: 'Invalid OTP' });
    }

    res.json({ message: 'OTP is valid' });
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
}

/**
 * POST /api/auth/reset-password
 * Final step: takes email, otp, newPassword. Re-validates OTP and resets.
 */
async function resetPassword(req, res) {
  try {
    const { email, otp, newPassword } = req.body;
    if (!email || !otp || !newPassword) return res.status(400).json({ message: 'All fields are required' });

    const user = await User.findOne({ email: email.toLowerCase().trim() });
    if (!user || !user.resetOtp || !user.resetOtpExpire) {
      return res.status(400).json({ message: 'Invalid or expired OTP' });
    }

    if (Date.now() > user.resetOtpExpire) {
      user.resetOtp = undefined;
      user.resetOtpExpire = undefined;
      await user.save();
      return res.status(400).json({ message: 'OTP has expired' });
    }

    const isMatch = await bcrypt.compare(otp.toString(), user.resetOtp);
    if (!isMatch) {
      user.resetOtpAttempts += 1;
      if (user.resetOtpAttempts >= 5) {
        user.resetOtp = undefined;
        user.resetOtpExpire = undefined;
      }
      await user.save();
      return res.status(400).json({ message: 'Invalid OTP' });
    }

    // Update password
    const salt = await bcrypt.genSalt(10);
    user.password = await bcrypt.hash(newPassword, salt);
    
    // Clear OTP fields
    user.resetOtp = undefined;
    user.resetOtpExpire = undefined;
    user.resetOtpAttempts = 0;
    await user.save();

    res.json({ message: 'Password updated successfully' });
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
}

module.exports = { register, login, getAchievementPrivacy, setAchievementPrivacy, getProfileSettings, setProfileSettings, uploadProfilePicture, forgotPasswordOtp, validateOtp, resetPassword };
