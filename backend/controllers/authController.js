const User = require('../models/User');
const Day = require('../models/Day');
const Goal = require('../models/Goal');
const Template = require('../models/Template');
const Achievement = require('../models/Achievement');
const Group = require('../models/Group');
const Review = require('../models/Review');
const { cloudinary } = require('../config/cloudinary');
const bcrypt = require('bcrypt');
const { generateToken } = require('../middleware/auth');
const { incrementFailedAttempts, resetFailedAttempts } = require('../middleware/accountLockout');
const admin = require('../config/firebase');
const crypto = require('crypto');
const { sendEmail } = require('../utils/email');
const saltRounds = 10;

/**
 * POST /api/auth/register
 */
const register = async (req, res) => {
  try {
    const { name, email, password, username, profilePicture } = req.body;
    if (!name || !email || !password || !username || !profilePicture) {
      return res.status(400).json({ message: 'All fields are required' });
    }
    const existing = await User.findOne({ email: email.toLowerCase().trim() });
    if (existing) return res.status(400).json({ message: 'Email already exists' });
    const existingUser = await User.findOne({ username: username.toLowerCase().trim() });
    if (existingUser) return res.status(400).json({ message: 'Username already taken' });

    const hashedPassword = await bcrypt.hash(password, saltRounds);
    let profileUrl = '';
    let profileId = '';
    if (profilePicture && profilePicture.startsWith('data:image')) {
      const result = await cloudinary.uploader.upload(profilePicture, { folder: 'consistency_app_profiles' });
      profileUrl = result.secure_url;
      profileId = result.public_id;
    }
    const user = new User({ name, username: username.toLowerCase().trim(), email: email.toLowerCase().trim(), password: hashedPassword, profilePicture: profileUrl, profilePictureId: profileId });
    const saved = await user.save();
    const token = generateToken(saved._id, saved.email);
    res.status(201).json({ _id: saved._id, name: saved.name, email: saved.email, profilePicture: saved.profilePicture, token });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

/**
 * POST /api/auth/login
 */
const login = async (req, res) => {
  try {
    const { email, password } = req.body;
    const user = await User.findOne({ email: email.toLowerCase().trim() });
    if (!user) return res.status(401).json({ message: 'Invalid email or password' });

    if (user.isBlacklisted) {
      if (!user.blacklistedUntil || user.blacklistedUntil > Date.now()) {
        return res.status(403).json({ message: 'Account blacklisted' });
      }
      user.isBlacklisted = false;
      await user.save();
    }

    if (!user.password) return res.status(401).json({ message: 'Login via Social Provider instead' });

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      await incrementFailedAttempts(user);
      return res.status(401).json({ message: 'Invalid email or password' });
    }

    await resetFailedAttempts(user._id);
    user.lastActiveAt = new Date();
    await user.save();
    const token = generateToken(user._id, user.email);
    res.json({ _id: user._id, name: user.name, email: user.email, profilePicture: user.profilePicture, username: user.username, currentStreak: user.currentStreak || 0, highestStreak: user.highestStreak || 0, token });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

/**
 * POST /api/auth/oauth-login
 */
const oauthLogin = async (req, res) => {
  try {
    const { idToken, email, name, provider, uid } = req.body;
    const decodedToken = await admin.auth().verifyIdToken(idToken);
    if (decodedToken.uid !== uid) return res.status(401).json({ message: 'Invalid token' });

    const normalizedEmail = email.toLowerCase().trim();
    let user = await User.findOne({ email: normalizedEmail });
    const googlePhotoUrl = decodedToken.picture;

    if (user) {
      const providerExists = user.authProviders.some(p => p.provider === provider);
      if (!providerExists) {
        user.authProviders.push({ provider, uid });
      }
      
      // If the existing user doesn't have a profile picture set yet, import and compress it from Google
      if (!user.profilePicture && googlePhotoUrl) {
        try {
          const result = await cloudinary.uploader.upload(googlePhotoUrl, {
            folder: 'consistency_app_profiles',
            transformation: [
              { width: 150, height: 150, crop: 'fill', quality: 'auto', fetch_format: 'auto' }
            ]
          });
          user.profilePicture = result.secure_url;
          user.profilePictureId = result.public_id;
        } catch (cloudinaryErr) {
          console.error('Error uploading Google profile photo to Cloudinary:', cloudinaryErr);
          // Fallback to raw Google photo URL if Cloudinary upload fails
          user.profilePicture = googlePhotoUrl;
        }
      }
      await user.save();
    } else {
      user = new User({ name: name || 'User', email: normalizedEmail, authProviders: [{ provider, uid }] });
      
      // Import and compress Google profile photo for new user
      if (googlePhotoUrl) {
        try {
          const result = await cloudinary.uploader.upload(googlePhotoUrl, {
            folder: 'consistency_app_profiles',
            transformation: [
              { width: 150, height: 150, crop: 'fill', quality: 'auto', fetch_format: 'auto' }
            ]
          });
          user.profilePicture = result.secure_url;
          user.profilePictureId = result.public_id;
        } catch (cloudinaryErr) {
          console.error('Error uploading Google profile photo to Cloudinary:', cloudinaryErr);
          // Fallback to raw Google photo URL if Cloudinary upload fails
          user.profilePicture = googlePhotoUrl;
        }
      }
      await user.save();
    }
    const token = generateToken(user._id, user.email);
    res.json({ _id: user._id, name: user.name, email: user.email, profilePicture: user.profilePicture, username: user.username, currentStreak: user.currentStreak || 0, highestStreak: user.highestStreak || 0, token });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

async function getAchievementPrivacy(req, res) {
  try {
    const user = await User.findById(req.user.userId).select('achievementsPublic');
    res.json({ achievementsPublic: user.achievementsPublic !== false });
  } catch (err) { res.status(500).json({ message: 'Server error' }); }
}

async function setAchievementPrivacy(req, res) {
  try {
    const updated = await User.findByIdAndUpdate(req.user.userId, { achievementsPublic: req.body.achievementsPublic }, { new: true });
    res.json({ achievementsPublic: updated.achievementsPublic });
  } catch (err) { res.status(500).json({ message: 'Server error' }); }
}

async function getProfileSettings(req, res) {
  try {
    const user = await User.findById(req.user.userId);
    res.json({
      name: user.name,
      email: user.email,
      username: user.username || '',
      profilePicture: user.profilePicture || '',
      emailNotifications: user.emailNotifications !== false,
      achievementsPublic: user.achievementsPublic !== false,
      isPublicProfile: user.isPublicProfile !== false,
      showOnLeaderboard: user.showOnLeaderboard !== false,
      theme: user.theme || 'light',
      leetcodeUsername: user.leetcodeUsername || null,
      leetcodePendingUsername: user.leetcodePendingUsername || null,
      leetcodeVerificationCode: user.leetcodeVerificationCode || null,
      leetcodeVerificationStatus: user.leetcodeVerificationStatus || 'none',
      leetcodeLastVerifiedAt: user.leetcodeLastVerifiedAt || null,
      leetcodeProfilePicture: user.leetcodeProfilePicture || '',
      leetcodeUsernameChangeCount: user.leetcodeUsernameChangeCount || 0,
      currentStreak: user.currentStreak || 0,
      highestStreak: user.highestStreak || 0,
      mutedGroups: user.mutedGroups || []
    });
  } catch (err) { res.status(500).json({ message: 'Server error' }); }
}

async function setProfileSettings(req, res) {
  try {
    const user = await User.findById(req.user.userId);
    const { emailNotifications, isPublicProfile, showOnLeaderboard, theme, profilePicture, newPassword, oldPassword } = req.body;

    if (typeof emailNotifications === 'boolean') user.emailNotifications = emailNotifications;
    if (typeof isPublicProfile === 'boolean') user.isPublicProfile = isPublicProfile;
    if (typeof showOnLeaderboard === 'boolean') user.showOnLeaderboard = showOnLeaderboard;
    if (theme) user.theme = theme;

    if (profilePicture && profilePicture.startsWith('data:image')) {
      if (user.profilePictureId) await cloudinary.uploader.destroy(user.profilePictureId);
      const result = await cloudinary.uploader.upload(profilePicture, { folder: 'consistency_app_profiles' });
      user.profilePicture = result.secure_url;
      user.profilePictureId = result.public_id;
    }

    if (newPassword) {
      const isMatch = await bcrypt.compare(oldPassword, user.password);
      if (!isMatch) return res.status(400).json({ message: 'Incorrect old password' });
      user.password = await bcrypt.hash(newPassword, 10);
    }

    await user.save();
    res.json({ message: 'Profile updated' });
  } catch (err) { res.status(500).json({ message: 'Server error' }); }
}

async function uploadProfilePicture(req, res) {
  try {
    const user = await User.findById(req.user.userId);
    if (user.profilePictureId) await cloudinary.uploader.destroy(user.profilePictureId);
    user.profilePicture = req.file.path;
    user.profilePictureId = req.file.filename;
    await user.save();
    res.json({ profilePicture: user.profilePicture });
  } catch (err) { res.status(500).json({ message: 'Server error' }); }
}

async function forgotPasswordOtp(req, res) {
  try {
    const { email } = req.body;
    const user = await User.findOne({ email: email.toLowerCase().trim() });
    if (!user) return res.status(404).json({ message: 'User not found' });

    const otp = crypto.randomInt(100000, 999999).toString();
    user.resetOtp = await bcrypt.hash(otp, 10);
    user.resetOtpExpire = Date.now() + 5 * 60 * 1000;
    await user.save();

    await sendEmail({
      to: user.email,
      subject: 'Password Reset OTP',
      html: `<p>Your OTP is <b>${otp}</b>. Expires in 5 minutes.</p>`
    });
    res.json({ message: 'OTP sent' });
  } catch (err) { res.status(500).json({ message: 'Server error' }); }
}

async function validateOtp(req, res) {
  try {
    const { email, otp } = req.body;
    const user = await User.findOne({ email: email.toLowerCase().trim() });
    if (!user || !user.resetOtp) return res.status(400).json({ message: 'Invalid request' });
    if (Date.now() > user.resetOtpExpire) return res.status(400).json({ message: 'OTP expired' });

    const isMatch = await bcrypt.compare(otp.toString(), user.resetOtp);
    if (!isMatch) return res.status(400).json({ message: 'Invalid OTP' });

    res.json({ message: 'OTP valid' });
  } catch (err) { res.status(500).json({ message: 'Server error' }); }
}

async function resetPassword(req, res) {
  try {
    const { email, otp, newPassword } = req.body;
    const user = await User.findOne({ email: email.toLowerCase().trim() });
    if (!user || Date.now() > user.resetOtpExpire) return res.status(400).json({ message: 'Invalid or expired OTP' });

    const isMatch = await bcrypt.compare(otp.toString(), user.resetOtp);
    if (!isMatch) return res.status(400).json({ message: 'Invalid OTP' });

    user.password = await bcrypt.hash(newPassword, 10);
    user.resetOtp = undefined;
    user.resetOtpExpire = undefined;
    await user.save();
    res.json({ message: 'Password reset successful' });
  } catch (err) { res.status(500).json({ message: 'Server error' }); }
}

async function deleteAccount(req, res) {
  try {
    const userId = req.user.userId;
    await Day.deleteMany({ userId });
    await Goal.deleteMany({ userId });
    await Template.deleteMany({ userId });
    await Achievement.deleteMany({ userId });
    await Group.updateMany({ members: userId }, { $pull: { members: userId } });
    const user = await User.findByIdAndDelete(userId);
    if (user.profilePictureId) await cloudinary.uploader.destroy(user.profilePictureId);
    res.json({ message: 'Account deleted' });
  } catch (err) { res.status(500).json({ message: 'Server error' }); }
}

async function getFirebaseToken(req, res) {
  try {
    const token = await admin.auth().createCustomToken(req.user.userId.toString());
    res.json({ token });
  } catch (err) { res.status(500).json({ message: 'Firebase error' }); }
}

async function getMediaUploadLimit(req, res) {
  try {
    const user = await User.findById(req.user.userId);
    if (!user) return res.status(404).json({ message: 'User not found' });

    const now = new Date();
    const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);

    let imageCount = user.imageUploadCount || 0;
    let audioCount = user.audioUploadCount || 0;
    let audioFileCount = user.audioFileUploadCount || 0;
    let reset = user.mediaResetTime || now;

    if (reset < oneHourAgo) {
      imageCount = 0;
      audioCount = 0;
      audioFileCount = 0;
      reset = now;
    }

    const MAX_IMAGE_LIMIT = parseInt(process.env.CHAT_IMAGE_LIMIT) || 20;
    const MAX_AUDIO_LIMIT = parseInt(process.env.CHAT_AUDIO_LIMIT) || 20;
    const MAX_AUDIO_FILE_LIMIT = parseInt(process.env.CHAT_AUDIO_FILE_LIMIT) || 5;

    res.json({
      imageLimit: MAX_IMAGE_LIMIT,
      audioLimit: MAX_AUDIO_LIMIT,
      audioFileLimit: MAX_AUDIO_FILE_LIMIT,
      imageRemaining: Math.max(0, MAX_IMAGE_LIMIT - imageCount),
      audioRemaining: Math.max(0, MAX_AUDIO_LIMIT - audioCount),
      audioFileRemaining: Math.max(0, MAX_AUDIO_FILE_LIMIT - audioFileCount),
      resetTime: new Date(reset.getTime() + 60 * 60 * 1000)
    });
  } catch (err) { res.status(500).json({ message: 'Server error' }); }
}

module.exports = {
  register,
  login,
  oauthLogin,
  getAchievementPrivacy,
  setAchievementPrivacy,
  getProfileSettings,
  setProfileSettings,
  uploadProfilePicture,
  forgotPasswordOtp,
  validateOtp,
  resetPassword,
  deleteAccount,
  getFirebaseToken,
  getMediaUploadLimit
};
