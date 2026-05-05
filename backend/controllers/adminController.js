const Review = require('../models/Review');
const User = require('../models/User');
const Day = require('../models/Day');
const Goal = require('../models/Goal');
const Achievement = require('../models/Achievement');
const Group = require('../models/Group');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const ProfileShare = require('../models/ProfileShare');

/**
 * Admin Login
 */
async function adminLogin(req, res) {
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
    const user = await User.findById(req.params.id);
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

module.exports = {
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
  generateAdminPreviewLink
};
