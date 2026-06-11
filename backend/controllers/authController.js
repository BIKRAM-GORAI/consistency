const User = require('../models/User');
const Day = require('../models/Day');
const Goal = require('../models/Goal');
const Template = require('../models/Template');
const Achievement = require('../models/Achievement');
const Changelog = require('../models/Changelog');
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
    const { name, email, password, username, profilePicture, referralCode: referralCodeUsed } = req.body;
    if (!name || !email || !password || !username || !profilePicture) {
      return res.status(400).json({ message: 'All fields are required' });
    }
    const existing = await User.findOne({ email: email.toLowerCase().trim() });
    if (existing) return res.status(400).json({ message: 'Email already exists' });
    const existingUser = await User.findOne({ username: username.toLowerCase().trim() });
    if (existingUser) return res.status(400).json({ message: 'Username already taken' });

    let referrerId = null;
    if (referralCodeUsed) {
      const referrer = await User.findOne({ referralCode: referralCodeUsed.toUpperCase().trim() });
      if (!referrer) {
        return res.status(400).json({ message: 'Invalid referral code' });
      }
      referrerId = referrer._id;
    }

    const { generateUniqueReferralCode } = require('../utils/pointsHelper');
    const referralCode = await generateUniqueReferralCode();

    const hashedPassword = await bcrypt.hash(password, saltRounds);
    let profileUrl = '';
    let profileId = '';
    if (profilePicture && profilePicture.startsWith('data:image')) {
      const result = await cloudinary.uploader.upload(profilePicture, { folder: 'consistency_app_profiles' });
      profileUrl = result.secure_url;
      profileId = result.public_id;
    }
    const user = new User({ 
      name, 
      username: username.toLowerCase().trim(), 
      email: email.toLowerCase().trim(), 
      password: hashedPassword, 
      profilePicture: profileUrl, 
      profilePictureId: profileId,
      referralCode,
      referredBy: referrerId,
      pointsBalance: referrerId ? 200 : 0
    });
    const saved = await user.save();

    if (referrerId) {
      const Referral = require('../models/Referral');
      const PointsLedger = require('../models/PointsLedger');
      
      const referral = new Referral({
        referrerId,
        referredId: saved._id,
        referralCode: referralCodeUsed.toUpperCase().trim(),
        streakReached: false,
        rewardReleased: false
      });
      await referral.save();
      
      await PointsLedger.create({
        userId: saved._id,
        points: 200,
        type: 'signup_bonus',
        description: `Welcome bonus for entering referral code ${referralCodeUsed.toUpperCase().trim()}`,
        referenceId: referral._id
      });
    }

    const token = generateToken(saved._id, saved.email);
    res.status(201).json({ 
      _id: saved._id, 
      name: saved.name, 
      email: saved.email, 
      profilePicture: saved.profilePicture, 
      pointsBalance: saved.pointsBalance || 0,
      referralCode: saved.referralCode,
      showReferralPrompt: !saved.referredBy && !saved.referralPromptDismissed,
      token 
    });
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
      if (!user.blacklistedUntil || new Date(user.blacklistedUntil) > new Date()) {
        const reasonStr = user.blacklistReason ? ` Reason: ${user.blacklistReason}` : '';
        const expiryStr = user.blacklistedUntil ? ` until ${new Date(user.blacklistedUntil).toLocaleDateString()}` : ' permanently';
        return res.status(403).json({ message: `Your account is blacklisted${expiryStr}.${reasonStr}`, isBlacklisted: true, blacklistReason: user.blacklistReason });
      }
      user.isBlacklisted = false;
      await user.save();
      await Group.updateOwnerBlacklistStatus(user._id, false);
    }

    if (!user.password) return res.status(401).json({ message: 'Login via Social Provider instead' });

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      await incrementFailedAttempts(user);
      return res.status(401).json({ message: 'Invalid email or password' });
    }

    await resetFailedAttempts(user._id);
    user.lastActiveAt = new Date();

    // Generate referral code for existing user if missing
    if (!user.referralCode) {
      const { generateUniqueReferralCode } = require('../utils/pointsHelper');
      user.referralCode = await generateUniqueReferralCode();
    }

    await User.updateOne(
      { _id: user._id },
      { $set: { lastActiveAt: user.lastActiveAt, referralCode: user.referralCode } }
    );
    const token = generateToken(user._id, user.email);
    res.json({ 
      _id: user._id, 
      name: user.name, 
      email: user.email, 
      profilePicture: user.profilePicture, 
      username: user.username, 
      currentStreak: user.currentStreak || 0, 
      highestStreak: user.highestStreak || 0, 
      pointsBalance: user.pointsBalance || 0,
      referralCode: user.referralCode,
      showReferralPrompt: !user.referredBy && !user.referralPromptDismissed,
      token 
    });
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

    if (user && user.isBlacklisted) {
      if (!user.blacklistedUntil || new Date(user.blacklistedUntil) > new Date()) {
        const reasonStr = user.blacklistReason ? ` Reason: ${user.blacklistReason}` : '';
        const expiryStr = user.blacklistedUntil ? ` until ${new Date(user.blacklistedUntil).toLocaleDateString()}` : ' permanently';
        return res.status(403).json({ message: `Your account is blacklisted${expiryStr}.${reasonStr}`, isBlacklisted: true, blacklistReason: user.blacklistReason });
      }
      user.isBlacklisted = false;
      await user.save();
      await Group.updateOwnerBlacklistStatus(user._id, false);
    }

    if (user) {
      const providerExists = user.authProviders.some(p => p.provider === provider);
      if (!providerExists) {
        user.authProviders.push({ provider, uid });
      }
      user.isEmailVerified = true;
      
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
      user = new User({ name: name || 'User', email: normalizedEmail, authProviders: [{ provider, uid }], isEmailVerified: true });
      
      const { generateUniqueReferralCode } = require('../utils/pointsHelper');
      user.referralCode = await generateUniqueReferralCode();

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

    // Safety check: ensure existing oauth users get a referral code
    if (!user.referralCode) {
      const { generateUniqueReferralCode } = require('../utils/pointsHelper');
      const generatedCode = await generateUniqueReferralCode();
      await User.updateOne({ _id: user._id }, { $set: { referralCode: generatedCode } });
      user.referralCode = generatedCode;
    }

    const token = generateToken(user._id, user.email);
    res.json({ 
      _id: user._id, 
      name: user.name, 
      email: user.email, 
      profilePicture: user.profilePicture, 
      username: user.username, 
      currentStreak: user.currentStreak || 0, 
      highestStreak: user.highestStreak || 0, 
      pointsBalance: user.pointsBalance || 0,
      referralCode: user.referralCode,
      showReferralPrompt: !user.referredBy && !user.referralPromptDismissed,
      token 
    });
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
    
    // Calculate isPremium exactly like subscriptionController
    const now = new Date();
    const isPremium = user.subscriptionTier === 'premium' && 
      (!user.subscriptionExpiresAt || new Date(user.subscriptionExpiresAt) > now);

    res.json({
      name: user.name,
      email: user.email,
      username: user.username || '',
      profilePicture: user.profilePicture || '',
      isEmailVerified: user.isEmailVerified === true,
      createdAt: user.createdAt,
      lastViewedChangelogAt: user.lastViewedChangelogAt || null,
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
      mutedGroups: user.mutedGroups || [],
      subscriptionTier: user.subscriptionTier || 'free',
      subscriptionExpiresAt: user.subscriptionExpiresAt || null,
      isPremium: isPremium,
      pointsBalance: user.pointsBalance || 0,
      referralCode: user.referralCode || '',
      showReferralPrompt: !user.referredBy && !user.referralPromptDismissed,
      globalStreakReminderEnabled: user.globalStreakReminderEnabled !== false,
      globalStreakReminderTime: user.globalStreakReminderTime || "21:00",
      globalStreakReminderType: user.globalStreakReminderType || "notification"
    });
  } catch (err) { res.status(500).json({ message: 'Server error' }); }
}

async function setProfileSettings(req, res) {
  try {
    const user = await User.findById(req.user.userId);
    const { emailNotifications, isPublicProfile, showOnLeaderboard, theme, profilePicture, newPassword, oldPassword, username, globalStreakReminderEnabled, globalStreakReminderTime, globalStreakReminderType } = req.body;

    if (typeof emailNotifications === 'boolean') user.emailNotifications = emailNotifications;
    if (typeof globalStreakReminderEnabled === 'boolean') user.globalStreakReminderEnabled = globalStreakReminderEnabled;
    if (globalStreakReminderTime !== undefined) user.globalStreakReminderTime = globalStreakReminderTime;
    if (globalStreakReminderType !== undefined) user.globalStreakReminderType = globalStreakReminderType;
    if (typeof isPublicProfile === 'boolean') user.isPublicProfile = isPublicProfile;
    if (typeof showOnLeaderboard === 'boolean') user.showOnLeaderboard = showOnLeaderboard;
    if (theme) {
      user.theme = theme;
    }

    if (username && username.trim() !== '') {
      const cleanUsername = username.toLowerCase().trim();
      if (user.username && user.username !== cleanUsername) {
        return res.status(400).json({ message: 'Username is locked and cannot be changed' });
      }
      if (!user.username) {
        // Validate format
        const usernameRegex = /^[!-~]{4,20}$/;
        if (!usernameRegex.test(cleanUsername)) {
          return res.status(400).json({ message: 'Username must be 4-20 characters long and contain no spaces' });
        }
        const existingUser = await User.findOne({ username: cleanUsername });
        if (existingUser && existingUser._id.toString() !== user._id.toString()) {
          return res.status(400).json({ message: 'Username already taken' });
        }
        user.username = cleanUsername;
      }
    }

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
    
    const now = new Date();
    const isPremium = user.subscriptionTier === 'premium' && 
      (!user.subscriptionExpiresAt || new Date(user.subscriptionExpiresAt) > now);

    res.json({
      message: 'Profile updated',
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
      mutedGroups: user.mutedGroups || [],
      subscriptionTier: user.subscriptionTier || 'free',
      subscriptionExpiresAt: user.subscriptionExpiresAt || null,
      isPremium: isPremium,
      pointsBalance: user.pointsBalance || 0,
      referralCode: user.referralCode || '',
      showReferralPrompt: !user.referredBy && !user.referralPromptDismissed,
      globalStreakReminderEnabled: user.globalStreakReminderEnabled !== false,
      globalStreakReminderTime: user.globalStreakReminderTime || "21:00",
      globalStreakReminderType: user.globalStreakReminderType || "notification"
    });
  } catch (err) { res.status(500).json({ message: 'Server error', error: err.message }); }
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
  } catch (err) {
    console.error('forgotPasswordOtp error:', err);
    res.status(500).json({ message: 'Server error', error: err.message });
  }
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
  } catch (err) {
    console.error('validateOtp error:', err);
    res.status(500).json({ message: 'Server error', error: err.message });
  }
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
  } catch (err) {
    console.error('resetPassword error:', err);
    res.status(500).json({ message: 'Server error', error: err.message });
  }
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

    const isPremium = user.subscriptionTier === 'premium' && 
      (!user.subscriptionExpiresAt || new Date(user.subscriptionExpiresAt) > now);

    let maxImage = parseInt(process.env.CHAT_IMAGE_LIMIT, 10) || 20;
    let maxAudio = parseInt(process.env.CHAT_AUDIO_LIMIT, 10) || 20;
    let maxAudioFile = parseInt(process.env.CHAT_AUDIO_FILE_LIMIT, 10) || 5;

    if (isPremium) {
      maxImage += parseInt(process.env.PREMIUM_ADDITIONAL_CHAT_IMAGE_LIMIT, 10) || 10;
      maxAudio += parseInt(process.env.PREMIUM_ADDITIONAL_CHAT_AUDIO_LIMIT, 10) || 10;
      maxAudioFile += parseInt(process.env.PREMIUM_ADDITIONAL_CHAT_AUDIO_FILE_LIMIT, 10) || 5;
    }

    res.json({
      imageLimit: maxImage,
      audioLimit: maxAudio,
      audioFileLimit: maxAudioFile,
      imageRemaining: Math.max(0, maxImage - imageCount),
      audioRemaining: Math.max(0, maxAudio - audioCount),
      audioFileRemaining: Math.max(0, maxAudioFile - audioFileCount),
      resetTime: new Date(reset.getTime() + 60 * 60 * 1000)
    });
  } catch (err) { res.status(500).json({ message: 'Server error' }); }
}

async function getChangelogList(req, res) {
  try {
    const changelogs = await Changelog.find().sort({ createdAt: -1 });
    res.json(changelogs);
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
}

async function markChangelogViewed(req, res) {
  try {
    const userId = req.user.userId;
    const user = await User.findByIdAndUpdate(
      userId,
      { lastViewedChangelogAt: new Date() },
      { new: true }
    );
    res.json({ message: 'Changelog marked as viewed', lastViewedChangelogAt: user.lastViewedChangelogAt });
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
}

async function sendVerificationOtp(req, res) {
  try {
    const user = await User.findById(req.user.userId);
    if (!user) return res.status(404).json({ message: 'User not found' });

    if (user.isEmailVerified) {
      return res.status(400).json({ message: 'Email is already verified' });
    }

    // Server-side rate limit: 60 seconds
    const now = new Date();
    if (user.emailVerificationOtpSentAt) {
      const timePassed = now.getTime() - new Date(user.emailVerificationOtpSentAt).getTime();
      if (timePassed < 60 * 1000) {
        const remainingSeconds = Math.ceil((60 * 1000 - timePassed) / 1000);
        return res.status(429).json({ 
          message: `Please wait ${remainingSeconds} seconds before requesting a new OTP.`,
          retryAfter: remainingSeconds
        });
      }
    }

    // Generate 6-digit numeric OTP
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const expiry = new Date(now.getTime() + 15 * 60 * 1000); // 15 mins expiry

    user.emailVerificationOtp = otp;
    user.emailVerificationOtpExpiresAt = expiry;
    user.emailVerificationOtpSentAt = now;
    await user.save();

    // Send email
    try {
      await sendEmail({
        to: user.email,
        subject: 'Consistency Tracker - Email Verification Code',
        html: `
          <div style="font-family: 'Inter', sans-serif; max-width: 500px; margin: 0 auto; padding: 24px; border: 3px solid #000; border-radius: 12px; background: #fff; box-shadow: 6px 6px 0 #000;">
            <h2 style="font-family: 'Space Grotesk', sans-serif; text-transform: uppercase; font-weight: 900; margin-top: 0; border-bottom: 3px solid #000; padding-bottom: 12px;">Email Verification Code</h2>
            <p style="font-weight: 800; font-size: 16px;">Hey ${user.name || 'there'},</p>
            <p style="font-weight: 600; line-height: 1.6; color: #333;">Please use the verification code below to verify your email address. This code will expire in 15 minutes.</p>
            <div style="margin: 24px 0; padding: 16px; background: #FFD60A; border: 3px solid #000; border-radius: 8px; font-family: monospace; font-size: 32px; font-weight: 900; text-align: center; letter-spacing: 4px; box-shadow: 4px 4px 0 #000;">
              ${otp}
            </div>
            <p style="font-size: 12px; font-weight: 700; color: #666; margin-bottom: 0; text-transform: uppercase;">If you did not request this verification, please ignore this email.</p>
          </div>
        `
      });
      res.json({ message: 'Verification OTP sent successfully' });
    } catch (emailErr) {
      console.error('Email sending failed:', emailErr);
      res.status(500).json({ message: 'Failed to send verification email. Please try again.' });
    }
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
}

async function verifyEmail(req, res) {
  try {
    const { otp } = req.body;
    if (!otp) return res.status(400).json({ message: 'OTP is required' });

    const user = await User.findById(req.user.userId);
    if (!user) return res.status(404).json({ message: 'User not found' });

    if (user.isEmailVerified) {
      return res.status(400).json({ message: 'Email is already verified' });
    }

    if (!user.emailVerificationOtp || user.emailVerificationOtp !== otp.trim()) {
      return res.status(400).json({ message: 'Invalid verification code' });
    }

    if (new Date() > new Date(user.emailVerificationOtpExpiresAt)) {
      return res.status(400).json({ message: 'Verification code has expired. Please request a new one.' });
    }

    user.isEmailVerified = true;
    user.emailVerificationOtp = null;
    user.emailVerificationOtpExpiresAt = null;
    user.emailVerificationOtpSentAt = null;
    await user.save();

    res.json({ message: 'Email verified successfully!' });
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
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
  getMediaUploadLimit,
  getChangelogList,
  markChangelogViewed,
  sendVerificationOtp,
  verifyEmail
};
