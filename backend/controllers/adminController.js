const Review = require('../models/Review');
const User = require('../models/User');
const Day = require('../models/Day');
const Goal = require('../models/Goal');
const Achievement = require('../models/Achievement');
const Group = require('../models/Group');
const Badge = require('../models/Badge');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const ProfileShare = require('../models/ProfileShare');
const { cloudinary } = require('../config/cloudinary');
const mongoose = require('mongoose');
const { sendEmail } = require('../utils/email');

// In-memory store for admin OTP (expires in 5 minutes)
let currentAdminOtp = null;
let adminOtpExpiry = null;

/**
 * Admin Step 1: Request OTP
 * Verifies credentials and sends OTP to ADMIN_EMAIL
 */
async function adminRequestOtp(req, res) {
  try {
    const { email, password } = req.body;
    const adminEmail = process.env.ADMIN_EMAIL;
    const adminPassword = process.env.ADMIN_PASSWORD;

    if (!adminEmail || !adminPassword) {
      return res.status(500).json({ message: 'Admin credentials not configured in server environment.' });
    }

    if (email !== adminEmail || password !== adminPassword) {
      return res.status(401).json({ message: 'Invalid admin credentials.' });
    }

    // Generate 6-character complex alphanumeric OTP
    const charset = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let otp = '';
    for (let i = 0; i < 6; i++) {
      otp += charset.charAt(crypto.randomInt(0, charset.length));
    }
    
    currentAdminOtp = otp;
    adminOtpExpiry = Date.now() + 5 * 60 * 1000; // 5 minutes validity

    // Send OTP via Email to the recipient specified in .env
    const otpRecipient = process.env.ADMIN_OTP_RECIPIENT_EMAIL || adminEmail;
    
    try {
      await sendEmail({
        to: otpRecipient,
        subject: '🔐 Admin Login OTP - Consistency Tracker',
        html: `
          <div style="font-family: sans-serif; max-width: 500px; margin: 0 auto; border: 2px solid #000; padding: 20px; background: #fff;">
            <h2 style="text-transform: uppercase; border-bottom: 2px solid #000; padding-bottom: 10px;">Security Verification</h2>
            <p>Your admin login verification code is:</p>
            <div style="font-size: 32px; font-weight: 900; letter-spacing: 5px; background: #facc15; padding: 15px; text-align: center; border: 2px solid #000; margin: 20px 0;">
              ${otp}
            </div>
            <p style="font-size: 12px; color: #666;">This code will expire in 5 minutes. If you did not request this, please secure your account immediately.</p>
          </div>
        `
      });
      res.json({ message: `Verification code sent to the registered recipient email.` });
    } catch (emailErr) {
      console.error('[ADMIN OTP ERROR]', emailErr);
      // Even if email fails, we return success so they can use the backup OTP if needed
      res.json({ message: 'A verification code has been requested. Please check the recipient email or use your backup code.' });
    }
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
}

/**
 * Admin Step 2: Verify OTP and Login
 */
async function adminLogin(req, res) {
  try {
    const { email, password, otp } = req.body;
    const adminEmail = process.env.ADMIN_EMAIL;
    const adminPassword = process.env.ADMIN_PASSWORD;
    const backupOtp = process.env.ADMIN_BACKUP_OTP;

    if (!adminEmail || !adminPassword) {
      return res.status(500).json({ message: 'Admin credentials not configured.' });
    }

    if (email !== adminEmail || password !== adminPassword) {
      return res.status(401).json({ message: 'Invalid admin credentials.' });
    }

    if (!otp) {
      return res.status(400).json({ message: 'Verification code is required.' });
    }

    const isBackupMatch = backupOtp && otp === backupOtp;
    const isGeneratedMatch = currentAdminOtp && otp === currentAdminOtp && Date.now() < adminOtpExpiry;

    if (!isBackupMatch && !isGeneratedMatch) {
      return res.status(401).json({ message: 'Invalid or expired verification code.' });
    }

    // Clear OTP after success
    currentAdminOtp = null;
    adminOtpExpiry = null;

    // Generate Admin Token
    const jwtSecret = process.env.JWT_SECRET || 'your-secret-key-change-in-production';
    const token = jwt.sign(
      { isAdmin: true, email: adminEmail },
      jwtSecret,
      { expiresIn: '24h' }
    );

    res.json({ token, message: 'Admin login successful' });
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
}

/**
 * Get all reviews with full data for admin
 */
async function getAdminReviews(req, res) {
  try {
    const { sort } = req.query;
    const sortOrder = sort === 'asc' ? 1 : -1;
    
    const reviews = await Review.find().sort({ createdAt: sortOrder });
    res.json(reviews);
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
}

/**
 * Create a new review manually
 */
async function createReview(req, res) {
  try {
    const { name, email, description, createdAt, userBadges } = req.body;
    
    const newReview = new Review({
      name,
      email,
      description,
      createdAt: createdAt || Date.now(),
      userBadges: userBadges || []
    });

    await newReview.save();
    res.status(201).json({ message: 'Review created successfully', review: newReview });
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
}

/**
 * Update a review
 */
async function updateReview(req, res) {
  try {
    const { id } = req.params;
    const { name, email, description, createdAt, userBadges } = req.body;

    const updatedReview = await Review.findByIdAndUpdate(
      id,
      { name, email, description, createdAt, userBadges },
      { new: true }
    );

    if (!updatedReview) {
      return res.status(404).json({ message: 'Review not found.' });
    }

    res.json({ message: 'Review updated successfully', review: updatedReview });
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
}

/**
 * Delete a review
 */
async function deleteReview(req, res) {
  try {
    const { id } = req.params;
    const deletedReview = await Review.findByIdAndDelete(id);

    if (!deletedReview) {
      return res.status(404).json({ message: 'Review not found.' });
    }

    res.json({ message: 'Review deleted successfully' });
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
}

/* ============================================================
   USER MANAGEMENT
   ============================================================ */

/**
 * GET /api/admin/users
 */
async function getAdminUsers(req, res) {
  try {
    const { sort, query } = req.query;
    const sortOrder = sort === 'asc' ? 1 : -1;
    
    let filter = {};
    if (query) {
      filter = {
        $or: [
          { name: { $regex: query, $options: 'i' } },
          { email: { $regex: query, $options: 'i' } },
          { username: { $regex: query, $options: 'i' } }
        ]
      };
    }

    const users = await User.find(filter)
      .sort({ createdAt: sortOrder })
      .select('name email username profilePicture isBlacklisted blacklistedUntil createdAt');

    // Enhance users with summary stats
    const enhancedUsers = await Promise.all(users.map(async (u) => {
      const reviewCount = await Review.countDocuments({ email: u.email });
      const groupCount = await Group.countDocuments({ members: u._id });
      return { 
        ...u.toObject(), 
        reviewCount, 
        groupCount 
      };
    }));

    res.json(enhancedUsers);
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
}

/**
 * GET /api/admin/users/:id
 */
async function getAdminUserDetails(req, res) {
  try {
    const user = await User.findById(req.params.id).populate('claimedBadges');
    if (!user) return res.status(404).json({ message: 'User not found' });
    
    const days = await Day.find({ userId: user._id }).sort({ date: -1 });
    const goals = await Goal.find({ userId: user._id }).sort({ createdAt: -1 });
    const achievements = await Achievement.find({ userId: user._id }).sort({ date: -1 });
    const groups = await Group.find({ members: user._id })
      .populate('owner', 'name profilePicture username')
      .populate('members', 'name profilePicture username');

    res.json({
      user,
      days,
      goals,
      achievements,
      groups
    });
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
}

/**
 * PATCH /api/admin/users/:id/blacklist
 */
async function toggleUserBlacklist(req, res) {
  try {
    const { isBlacklisted, blacklistedUntil, blacklistReason } = req.body;
    const user = await User.findByIdAndUpdate(
      req.params.id,
      { isBlacklisted, blacklistedUntil, blacklistReason },
      { new: true }
    );
    if (!user) return res.status(404).json({ message: 'User not found' });
    res.json({ message: 'Blacklist status updated', user });
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
}

/**
 * PATCH /api/admin/users/:id
 */
async function updateAdminUser(req, res) {
  try {
    const { name, username } = req.body;
    const userId = req.params.id;

    // Validation
    if (username) {
      const existingUser = await User.findOne({ 
        username: { $regex: new RegExp(`^${username}$`, 'i') },
        _id: { $ne: userId }
      });
      if (existingUser) {
        return res.status(400).json({ message: 'Username is already taken by another user.' });
      }
    }

    const updatedUser = await User.findByIdAndUpdate(
      userId,
      { name, username },
      { new: true }
    );

    if (!updatedUser) {
      return res.status(404).json({ message: 'User not found.' });
    }

    res.json({ message: 'User updated successfully', user: updatedUser });
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
}

/**
 * DELETE /api/admin/users/:id
 */
async function deleteUser(req, res) {
  try {
    const userId = req.params.id;
    // Similar to authController.deleteAccount but for any user
    await Day.deleteMany({ userId });
    await Goal.deleteMany({ userId });
    await Achievement.deleteMany({ userId });
    await Review.deleteMany({ userId }); // Admin might want to keep or delete reviews
    
    const user = await User.findByIdAndDelete(userId);
    if (!user) return res.status(404).json({ message: 'User not found' });

    res.json({ message: 'User account and data deleted' });
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
}

/**
 * PATCH /api/admin/days/:id
 */
async function updateAdminDay(req, res) {
  try {
    const day = await Day.findByIdAndUpdate(req.params.id, req.body, { new: true });
    if (!day) return res.status(404).json({ message: 'Day not found' });
    res.json(day);
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
}

/**
 * DELETE /api/admin/days/:id
 */
async function deleteAdminDay(req, res) {
  try {
    const day = await Day.findByIdAndDelete(req.params.id);
    if (!day) return res.status(404).json({ message: 'Day not found' });
    res.json({ message: 'Day deleted' });
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
}

/**
 * PATCH /api/admin/goals/:id
 */
async function updateAdminGoal(req, res) {
  try {
    const goal = await Goal.findByIdAndUpdate(req.params.id, req.body, { new: true });
    if (!goal) return res.status(404).json({ message: 'Goal not found' });
    res.json(goal);
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
}

/**
 * GET /api/admin/groups
 */
async function getAdminGroups(req, res) {
  try {
    const groups = await Group.find()
      .populate('owner', 'name username profilePicture')
      .populate('members', 'name username profilePicture')
      .sort({ createdAt: -1 });
    res.json(groups);
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
}

/**
 * DELETE /api/admin/groups/:groupId/members/:userId
 */
async function removeGroupMember(req, res) {
  try {
    const { groupId, userId } = req.params;
    const group = await Group.findById(groupId);
    if (!group) return res.status(404).json({ message: 'Group not found' });

    if (group.owner.toString() === userId) {
      return res.status(400).json({ message: 'Cannot remove the owner from the group.' });
    }

    group.members = group.members.filter(m => m.toString() !== userId);
    await group.save();

    res.json({ message: 'Member removed successfully' });
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
}

/**
 * DELETE /api/admin/groups/:id
 */
async function deleteGroup(req, res) {
  try {
    const group = await Group.findByIdAndDelete(req.params.id);
    if (!group) return res.status(404).json({ message: 'Group not found' });
    res.json({ message: 'Group deleted successfully' });
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
}

/**
 * PATCH /api/admin/groups/:id
 */
async function updateAdminGroup(req, res) {
  try {
    const { name, description, code } = req.body;
    const updates = { name, description };

    if (code) {
      const normalizedCode = code.toUpperCase().trim();
      
      // Check if code exists for another group
      const existing = await Group.findOne({ 
        code: normalizedCode, 
        _id: { $ne: req.params.id } 
      });
      if (existing) {
        return res.status(400).json({ message: 'This join code is already in use by another group.' });
      }
      updates.code = normalizedCode;
    }

    const group = await Group.findByIdAndUpdate(
      req.params.id,
      updates,
      { new: true }
    );
    if (!group) return res.status(404).json({ message: 'Group not found' });
    res.json({ message: 'Group updated successfully', group });
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
}

/**
 * PATCH /api/admin/groups/:id/icon
 */
async function updateAdminGroupIcon(req, res) {
  try {
    const { icon } = req.body;
    if (!icon || !icon.startsWith('data:image')) {
      return res.status(400).json({ message: 'Invalid image data' });
    }

    const group = await Group.findById(req.params.id);
    if (!group) return res.status(404).json({ message: 'Group not found' });

    // Delete old one if exists
    if (group.iconId) {
      await cloudinary.uploader.destroy(group.iconId);
    }

    const result = await cloudinary.uploader.upload(icon, {
      folder: 'consistency_app_groups',
    });

    group.icon = result.secure_url;
    group.iconId = result.public_id;
    await group.save();

    res.json({ icon: group.icon, message: 'Group icon updated successfully' });
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
}

/**
 * DELETE /api/admin/goals/:id
 */
async function deleteAdminGoal(req, res) {
  try {
    const goal = await Goal.findByIdAndDelete(req.params.id);
    if (!goal) return res.status(404).json({ message: 'Goal not found' });
    res.json({ message: 'Goal deleted' });
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
}

/**
 * PATCH /api/admin/achievements/:id
 */
async function updateAdminAchievement(req, res) {
  try {
    const ach = await Achievement.findByIdAndUpdate(req.params.id, req.body, { new: true });
    if (!ach) return res.status(404).json({ message: 'Achievement not found' });
    res.json(ach);
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
}

/**
 * POST /api/admin/users/:id/preview-link
 */
async function generateAdminPreviewLink(req, res) {
  try {
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ message: 'User not found' });

    const shareCode = crypto.randomBytes(16).toString('hex');
    const share = new ProfileShare({
      userId: user._id,
      username: user.username,
      platform: 'admin_preview',
      shareCode
    });

    await share.save();
    res.json({ shareCode, username: user.username });
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
}

/**
 * DELETE /api/admin/achievements/:id
 */
async function deleteAdminAchievement(req, res) {
  try {
    const ach = await Achievement.findByIdAndDelete(req.params.id);
    if (!ach) return res.status(404).json({ message: 'Achievement not found' });
    res.json({ message: 'Achievement deleted' });
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
}

/**
 * PATCH /api/admin/users/:id/profile-picture
 */
async function updateAdminUserProfilePicture(req, res) {
  try {
    const { profilePicture } = req.body;
    if (!profilePicture || !profilePicture.startsWith('data:image')) {
      return res.status(400).json({ message: 'Invalid image data' });
    }

    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ message: 'User not found' });

    // Delete old one if exists
    if (user.profilePictureId) {
      await cloudinary.uploader.destroy(user.profilePictureId);
    }

    const result = await cloudinary.uploader.upload(profilePicture, {
      folder: 'consistency_app_profiles',
    });

    user.profilePicture = result.secure_url;
    user.profilePictureId = result.public_id;
    await user.save();

    res.json({ profilePicture: user.profilePicture, message: 'Profile picture updated successfully' });
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
}

/**
 * POST /api/admin/users/:id/days
 */
async function createAdminDay(req, res) {
  try {
    const userId = req.params.id;
    const { date, categories, summary } = req.body;

    // Fix: Validate userId format to prevent Mongoose cast errors (500)
    if (!mongoose.Types.ObjectId.isValid(userId)) {
      return res.status(400).json({ message: 'Invalid User ID format.' });
    }

    if (!date) {
      return res.status(400).json({ message: 'Date is required (YYYY-MM-DD).' });
    }

    const existingDay = await Day.findOne({ userId, date });
    if (existingDay) {
      return res.status(400).json({ message: 'A card already exists for this user on this date.' });
    }

    const newDay = new Day({
      userId,
      date,
      categories: categories || [],
      summary: summary || ''
    });

    await newDay.save();
    res.status(201).json(newDay);
  } catch (err) {
    console.error('[ADMIN ERROR] createAdminDay:', err);
    res.status(500).json({ message: 'Internal Server Error', error: err.message });
  }
}

module.exports = {
  adminRequestOtp,
  adminLogin,
  getAdminReviews,
  createReview,
  updateReview,
  deleteReview,
  getAdminUsers,
  getAdminUserDetails,
  toggleUserBlacklist,
  updateAdminUser,
  deleteUser,
  updateAdminDay,
  deleteAdminDay,
  updateAdminGoal,
  deleteAdminGoal,
  updateAdminAchievement,
  deleteAdminAchievement,
  generateAdminPreviewLink,
  getAdminGroups,
  removeGroupMember,
  deleteGroup,
  updateAdminGroup,
  updateAdminUserProfilePicture,
  updateAdminGroupIcon,
  createAdminDay,
  // Badge Management
  getAdminBadges: async (req, res) => {
    try {
      const badges = await Badge.find().sort({ requiredDays: 1 });
      res.json(badges);
    } catch (err) {
      res.status(500).json({ message: 'Server error', error: err.message });
    }
  },
  createBadge: async (req, res) => {
    try {
      const { name, requiredDays, image } = req.body;
      if (!image) return res.status(400).json({ message: 'Badge image is required' });

      // Check if badge with same days exists
      const existing = await Badge.findOne({ requiredDays });
      if (existing) return res.status(400).json({ message: `A badge for ${requiredDays} days already exists.` });

      const result = await cloudinary.uploader.upload(image, {
        folder: 'consistency_app_badges',
      });

      const newBadge = new Badge({
        name,
        requiredDays,
        image: result.secure_url,
        imageId: result.public_id
      });

      await newBadge.save();
      res.status(201).json(newBadge);
    } catch (err) {
      res.status(500).json({ message: 'Server error', error: err.message });
    }
  },
  updateBadge: async (req, res) => {
    try {
      const { id } = req.params;
      const { name, requiredDays, image } = req.body;

      const badge = await Badge.findById(id);
      if (!badge) return res.status(404).json({ message: 'Badge not found' });

      // Check if threshold changed and is now conflicting
      if (requiredDays !== badge.requiredDays) {
        const existing = await Badge.findOne({ requiredDays, _id: { $ne: id } });
        if (existing) return res.status(400).json({ message: `A badge for ${requiredDays} days already exists.` });
      }

      badge.name = name || badge.name;
      badge.requiredDays = requiredDays !== undefined ? requiredDays : badge.requiredDays;

      if (image && image.startsWith('data:image')) {
        // Delete old image
        if (badge.imageId) {
          await cloudinary.uploader.destroy(badge.imageId);
        }
        const result = await cloudinary.uploader.upload(image, {
          folder: 'consistency_app_badges',
        });
        badge.image = result.secure_url;
        badge.imageId = result.public_id;
      }

      await badge.save();
      res.json(badge);
    } catch (err) {
      res.status(500).json({ message: 'Server error', error: err.message });
    }
  },
  deleteBadge: async (req, res) => {
    try {
      const { id } = req.params;
      const badge = await Badge.findByIdAndDelete(id);
      if (!badge) return res.status(404).json({ message: 'Badge not found' });

      if (badge.imageId) {
        await cloudinary.uploader.destroy(badge.imageId);
      }

      res.json({ message: 'Badge deleted successfully' });
    } catch (err) {
      res.status(500).json({ message: 'Server error', error: err.message });
    }
  }
};
