const Review = require('../models/Review');
const User = require('../models/User');
const Day = require('../models/Day');
const Report = require('../models/Report');
const Goal = require('../models/Goal');
const Achievement = require('../models/Achievement');
const Group = require('../models/Group');
const Badge = require('../models/Badge');
const Changelog = require('../models/Changelog');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const ProfileShare = require('../models/ProfileShare');
const { cloudinary } = require('../config/cloudinary');
const mongoose = require('mongoose');
const { sendEmail } = require('../utils/email');
const axios = require('axios');

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
    const jwtAdminSecret = process.env.JWT_ADMIN_SECRET;
    if (!jwtAdminSecret) {
      console.error('CRITICAL: JWT_ADMIN_SECRET is missing in .env');
      return res.status(500).json({ message: 'Server configuration error' });
    }
    const jwtAdminExpiry = process.env.JWT_ADMIN_EXPIRY || '30m';
    const token = jwt.sign(
      { isAdmin: true, email: adminEmail },
      jwtAdminSecret,
      { expiresIn: jwtAdminExpiry }
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
    const page = parseInt(req.query.page, 10) || 1;
    const limit = parseInt(req.query.limit, 10) || 10;
    const skip = (page - 1) * limit;

    const sortOrder = sort === 'asc' ? 1 : -1;
    
    const totalCount = await Review.countDocuments();
    const totalPages = Math.ceil(totalCount / limit);

    const reviews = await Review.find()
      .sort({ createdAt: sortOrder })
      .skip(skip)
      .limit(limit);

    res.json({
      items: reviews,
      page,
      limit,
      totalCount,
      totalPages
    });
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
    const page = parseInt(req.query.page, 10) || 1;
    const limit = parseInt(req.query.limit, 10) || 10;
    const skip = (page - 1) * limit;

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

    const totalCount = await User.countDocuments(filter);
    const totalPages = Math.ceil(totalCount / limit);

    const users = await User.find(filter)
      .sort({ createdAt: sortOrder })
      .skip(skip)
      .limit(limit)
      .select('name email username profilePicture isBlacklisted blacklistedUntil createdAt');

    // Enhance ONLY the 10 users inside the paginated slice (super fast!)
    const enhancedUsers = await Promise.all(users.map(async (u) => {
      const reviewCount = await Review.countDocuments({ email: u.email });
      const groupCount = await Group.countDocuments({ members: u._id });
      return { 
        ...u.toObject(), 
        reviewCount, 
        groupCount 
      };
    }));

    res.json({
      items: enhancedUsers,
      page,
      limit,
      totalCount,
      totalPages
    });
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
}

/**
 * GET /api/admin/users/:id
 */
async function getAdminUserDetails(req, res) {
  try {
    const user = await User.findById(req.params.id)
      .populate('claimedBadges')
      .populate('referredBy', 'name username email');
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

    // Update blacklist status on all groups owned by this user
    await Group.updateOwnerBlacklistStatus(user._id, isBlacklisted);

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

    // Cleanup social data (friendships, requests) and DMs in Firestore before account deletion
    const { cleanupUserSocialData } = require('../utils/firestoreSync');
    await cleanupUserSocialData(userId);

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
    const page = parseInt(req.query.page, 10) || 1;
    const limit = parseInt(req.query.limit, 10) || 10;
    const skip = (page - 1) * limit;

    const totalCount = await Group.countDocuments();
    const totalPages = Math.ceil(totalCount / limit);

    const groups = await Group.find()
      .populate('owner', 'name username profilePicture')
      .populate('members', 'name username profilePicture')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);

    res.json({
      items: groups,
      page,
      limit,
      totalCount,
      totalPages
    });
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
    const { date, categories, summary, aiSummary } = req.body;

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
      summary: summary || '',
      aiSummary: aiSummary || ''
    });

    await newDay.save();
    res.status(201).json(newDay);
  } catch (err) {
    console.error('[ADMIN ERROR] createAdminDay:', err);
    res.status(500).json({ message: 'Internal Server Error', error: err.message });
  }
}

/* ============================================================
   EMAIL MANAGEMENT
   ============================================================ */

/**
 * GET /api/admin/user-emails
 * Returns ONLY email + _id + createdAt for all users.
 * Lightweight — no related documents, no extra fields.
 */
async function getUserEmailsOnly(req, res) {
  try {
    const sort = req.query.sort === 'asc' ? 1 : -1;
    const users = await User.find({}, 'email createdAt').sort({ createdAt: sort }).lean();
    res.json({ emails: users });
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
}

/**
 * POST /api/admin/users/:id/send-email
 * Send a custom email to a single user.
 * Body: { subject, body, mode ('html'|'text'), attachments: [{ filename, data (base64) }] }
 */
async function sendEmailToUser(req, res) {
  try {
    const user = await User.findById(req.params.id).select('email name').lean();
    if (!user) return res.status(404).json({ message: 'User not found.' });

    const { subject, body, mode, attachments } = req.body;
    if (!subject || !body) {
      return res.status(400).json({ message: 'Subject and body are required.' });
    }

    const { sendEmail, htmlToPlainText, wrapHtml } = require('../utils/email');

    // Build the HTML body — plain text mode gets a simple <pre> wrapper, HTML mode uses as-is
    const rawHtml = mode === 'text'
      ? `<pre style="font-family:Arial,sans-serif;white-space:pre-wrap;font-size:14px;line-height:1.6;">${body}</pre>`
      : body;

    // Always derive a plain-text alternative (critical for inbox delivery)
    const plainText = mode === 'text' ? body : htmlToPlainText(body);

    // Wrap in a proper email-safe HTML document shell
    const htmlBody = wrapHtml(rawHtml, subject);

    // Build nodemailer attachments from base64 payloads
    const mailAttachments = (attachments || []).map(a => ({
      filename: a.filename,
      content: Buffer.from(a.data, 'base64'),
    }));

    await sendEmail({
      to: user.email,
      subject,
      html: htmlBody,
      text: plainText,
      attachments: mailAttachments.length ? mailAttachments : undefined,
    });

    console.log(`[Admin Email] Sent to ${user.email} | Subject: ${subject}`);
    res.json({ message: `Email sent successfully to ${user.email}.` });
  } catch (err) {
    console.error('[Admin sendEmailToUser Error]', err);
    res.status(500).json({ message: 'Failed to send email.', error: err.message });
  }
}

/**
 * POST /api/admin/bulk-email
 * Send one email to multiple recipients — sequentially to avoid Gmail rate limits.
 * Body: { subject, body, mode ('html'|'text'), emails: ['a@b.com', ...] }
 */
async function sendBulkEmail(req, res) {
  try {
    const { subject, body, mode, emails } = req.body;

    if (!subject || !body) {
      return res.status(400).json({ message: 'Subject and body are required.' });
    }
    if (!emails || !Array.isArray(emails) || emails.length === 0) {
      return res.status(400).json({ message: 'At least one recipient email is required.' });
    }

    const { sendEmail, htmlToPlainText, wrapHtml } = require('../utils/email');

    // Build once — reuse for all recipients
    const rawHtml = mode === 'text'
      ? `<pre style="font-family:Arial,sans-serif;white-space:pre-wrap;font-size:14px;line-height:1.6;">${body}</pre>`
      : body;
    const plainText = mode === 'text' ? body : htmlToPlainText(body);
    const htmlBody  = wrapHtml(rawHtml, subject);

    const results = [];

    // Send sequentially with a small delay between each email.
    // 300 ms gap prevents Gmail from treating this as a spam burst,
    // which is the #1 reason subsequent bulk emails land in spam.
    for (const email of emails) {
      try {
        await sendEmail({
          to: email,
          subject,
          html: htmlBody,
          text: plainText,
        });
        results.push({ email, status: 'sent' });
        console.log(`[Admin Bulk Email] Sent to ${email}`);
      } catch (emailErr) {
        console.error(`[Admin Bulk Email] Failed for ${email}:`, emailErr.message);
        results.push({ email, status: 'failed', error: emailErr.message });
      }
      // Small inter-message pause — avoids triggering Gmail's burst-spam detector
      await new Promise(resolve => setTimeout(resolve, 300));
    }

    const sent   = results.filter(r => r.status === 'sent').length;
    const failed = results.filter(r => r.status === 'failed').length;

    res.json({
      message: `Bulk email complete. Sent: ${sent}, Failed: ${failed}`,
      sent,
      failed,
      results,
    });
  } catch (err) {
    console.error('[Admin sendBulkEmail Error]', err);
    res.status(500).json({ message: 'Failed to send bulk emails.', error: err.message });
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
  // Email Management
  getUserEmailsOnly,
  sendEmailToUser,
  sendBulkEmail,
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
  },
  generateCoupon: async (req, res) => {
    try {
      const { duration } = req.body;
      if (!duration || !['1_month', '1_year'].includes(duration)) {
        return res.status(400).json({ message: 'Duration must be 1_month or 1_year.' });
      }

      const crypto = require('crypto');
      const code = 'PROMO-' + crypto.randomBytes(4).toString('hex').toUpperCase();

      const Coupon = require('../models/Coupon');
      const newCoupon = new Coupon({
        code,
        duration,
        createdBy: req.admin.email
      });

      await newCoupon.save();
      res.status(201).json(newCoupon);
    } catch (err) {
      console.error('generateCoupon error:', err);
      res.status(500).json({ message: 'Server error generating coupon.', error: err.message });
    }
  },
  getCoupons: async (req, res) => {
    try {
      const Coupon = require('../models/Coupon');
      const coupons = await Coupon.find().populate('usedBy', 'name email username').sort({ createdAt: -1 });
      res.json(coupons);
    } catch (err) {
      console.error('getCoupons error:', err);
      res.status(500).json({ message: 'Server error fetching coupons.', error: err.message });
    }
  },
  deleteCoupon: async (req, res) => {
    try {
      const Coupon = require('../models/Coupon');
      const coupon = await Coupon.findByIdAndDelete(req.params.id);
      if (!coupon) return res.status(404).json({ message: 'Coupon not found.' });
      res.json({ message: 'Coupon deleted successfully.' });
    } catch (err) {
      console.error('deleteCoupon error:', err);
      res.status(500).json({ message: 'Server error deleting coupon.', error: err.message });
    }
  },
  getAdminPayments: async (req, res) => {
    try {
      const axios = require('axios');
      const keyId = process.env.RAZORPAY_KEY_ID;
      const keySecret = process.env.RAZORPAY_KEY_SECRET;

      if (!keyId || !keySecret) {
        return res.status(500).json({ message: 'Razorpay API keys not configured.' });
      }

      const page = parseInt(req.query.page, 10) || 1;
      const limit = parseInt(req.query.limit, 10) || 10;
      const skip = (page - 1) * limit;

      const authHeader = Buffer.from(`${keyId}:${keySecret}`).toString('base64');
      
      // Fetch latest 100 transactions from Razorpay
      const razorpayRes = await axios.get('https://api.razorpay.com/v1/payments?count=100', {
        headers: { 'Authorization': `Basic ${authHeader}` }
      });

      const payments = razorpayRes.data.items || [];

      // Extract details across all 100 payments to match against our users collection
      const paymentEmails = payments.map(p => p.email).filter(Boolean);
      const paymentIds = payments.map(p => p.id).filter(Boolean);
      const orderIds = payments.map(p => p.order_id).filter(Boolean);

      const users = await User.find({
        $or: [
          { email: { $in: paymentEmails } },
          { razorpayPaymentId: { $in: paymentIds } },
          { subscriptionId: { $in: orderIds } }
        ]
      }, 'name email profilePicture razorpayPaymentId subscriptionId');
      
      const userMap = new Map();
      users.forEach(u => {
        if (u.email) userMap.set(u.email.toLowerCase(), u);
        if (u.razorpayPaymentId) userMap.set(u.razorpayPaymentId, u);
        if (u.subscriptionId) userMap.set(u.subscriptionId, u);
      });

      // Filter payments: keep ONLY payments that are matching a user registered on our site
      const ourPayments = payments.filter(p => {
        let matched = false;
        if (p.email && userMap.has(p.email.toLowerCase())) matched = true;
        if (!matched && p.id && userMap.has(p.id)) matched = true;
        if (!matched && p.order_id && userMap.has(p.order_id)) matched = true;
        return matched;
      });

      const totalCount = ourPayments.length;

      // Slice the filtered results array dynamically for pagination
      const paginatedPayments = ourPayments.slice(skip, skip + limit);

      const enrichedPayments = paginatedPayments.map(p => {
        let matchedUser = null;
        if (p.email) matchedUser = userMap.get(p.email.toLowerCase());
        if (!matchedUser && p.id) matchedUser = userMap.get(p.id);
        if (!matchedUser && p.order_id) matchedUser = userMap.get(p.order_id);

        return {
          ...p,
          user: matchedUser ? {
            _id: matchedUser._id,
            name: matchedUser.name,
            profilePicture: matchedUser.profilePicture
          } : null
        };
      });

      res.json({
        items: enrichedPayments,
        page,
        limit,
        totalPages: Math.ceil(totalCount / limit)
      });
    } catch (err) {
      console.error('getAdminPayments error:', err.message);
      res.status(500).json({ message: 'Failed to retrieve payments from Razorpay API.', error: err.message });
    }
  },
  getAdminUserPayments: async (req, res) => {
    try {
      const axios = require('axios');
      const keyId = process.env.RAZORPAY_KEY_ID;
      const keySecret = process.env.RAZORPAY_KEY_SECRET;

      if (!keyId || !keySecret) {
        return res.status(500).json({ message: 'Razorpay API keys not configured.' });
      }

      const user = await User.findById(req.params.id);
      if (!user) return res.status(404).json({ message: 'User not found.' });

      const authHeader = Buffer.from(`${keyId}:${keySecret}`).toString('base64');
      
      const razorpayRes = await axios.get('https://api.razorpay.com/v1/payments?count=100', {
        headers: { 'Authorization': `Basic ${authHeader}` }
      });

      const payments = razorpayRes.data.items || [];
      const userPayments = payments.filter(p => {
        const emailMatch = p.email && user.email && p.email.toLowerCase() === user.email.toLowerCase();
        const paymentIdMatch = p.id && user.razorpayPaymentId && p.id === user.razorpayPaymentId;
        const orderIdMatch = p.order_id && user.subscriptionId && p.order_id === user.subscriptionId;
        return emailMatch || paymentIdMatch || orderIdMatch;
      });

      res.json(userPayments);
    } catch (err) {
      console.error('getAdminUserPayments error:', err.message);
      res.status(500).json({ message: 'Failed to retrieve user payment details.', error: err.message });
    }
  },
  getRefundRequests: async (req, res) => {
    try {
      // Find all users who have at least one refund request in their history
      const users = await User.find(
        { paymentHistory: { $elemMatch: { refundStatus: { $ne: 'none' } } } },
        'name email username profilePicture refundStatus refundRequestedAt premiumActivatedAt premiumUsageLogs paymentHistory'
      );
      
      const requests = [];
      users.forEach(u => {
        // Find all payments with any refund activity
        u.paymentHistory.forEach(payment => {
          if (payment.refundStatus && payment.refundStatus !== 'none') {
            const logs = u.premiumUsageLogs.filter(log => log.razorpayPaymentId === payment.paymentId);
            requests.push({
              _id: u._id,
              name: u.name,
              username: u.username,
              email: u.email,
              profilePicture: u.profilePicture,
              refundStatus: payment.refundStatus,
              refundRequestedAt: u.refundRequestedAt || payment.purchasedAt, // fallback
              premiumActivatedAt: u.premiumActivatedAt,
              premiumUsageLogs: logs,
              refundReason: payment.refundReason || u.refundReason || 'No reason provided.',
              payment: {
                orderId: payment.orderId,
                paymentId: payment.paymentId,
                amount: payment.amount,
                duration: payment.duration,
                purchasedAt: payment.purchasedAt,
              }
            });
          }
        });
      });

      // Sort requests: pending ('requested') at the top, others sorted by purchase date desc
      requests.sort((a, b) => {
        if (a.refundStatus === 'requested' && b.refundStatus !== 'requested') return -1;
        if (a.refundStatus !== 'requested' && b.refundStatus === 'requested') return 1;
        return new Date(b.payment.purchasedAt) - new Date(a.payment.purchasedAt);
      });

      res.json({ refunds: requests });
    } catch (err) {
      console.error('getRefundRequests error:', err.message);
      res.status(500).json({ message: 'Failed to retrieve refund requests.', error: err.message });
    }
  },
  approveRefund: async (req, res) => {
    let finalRefundRupees = 'the subscription value';
    try {
      const { id } = req.params; // User ID
      const user = await User.findById(id);
      if (!user) return res.status(404).json({ message: 'User not found.' });

      // Find the requested payment in paymentHistory
      const payment = user.paymentHistory.find(p => p.refundStatus === 'requested');
      const paymentId = payment ? payment.paymentId : user.razorpayPaymentId;

      if (!paymentId) {
        return res.status(400).json({ message: 'No active payment ID found for this refund.' });
      }

      const keyId = process.env.RAZORPAY_KEY_ID;
      const keySecret = process.env.RAZORPAY_KEY_SECRET;

      if (!keyId || !keySecret) {
        return res.status(500).json({ message: 'Razorpay API keys not configured.' });
      }

      // Calculate 3% processing fee deduction dynamically from original paid amount
      // If original price is payment.amount (in rupees), the refund amount in paise is:
      // payment.amount * 0.97 * 100
      let refundAmountPaise = undefined;
      if (payment && payment.amount) {
        refundAmountPaise = Math.floor(payment.amount * 0.97 * 100);
        
        // Razorpay API strictly requires the refund amount to be at least INR 1.00 (100 paise)
        if (refundAmountPaise < 100) {
          refundAmountPaise = Math.floor(payment.amount * 100);
        }
        
        finalRefundRupees = (refundAmountPaise / 100).toFixed(2);
      }

      console.log(`[Admin Payout] Triggering 3% deducted Razorpay refund for payment: ${paymentId} (User: ${user.username}, Original: ₹${payment ? payment.amount : 'N/A'}, Refund: ₹${finalRefundRupees})`);

      const authHeader = Buffer.from(`${keyId}:${keySecret}`).toString('base64');
      const response = await axios.post(
        `https://api.razorpay.com/v1/payments/${paymentId}/refund`,
        { amount: refundAmountPaise },
        {
          headers: {
            'Authorization': `Basic ${authHeader}`,
            'Content-Type': 'application/json'
          }
        }
      );

      // Success: mark the transaction as approved in payment history
      user.refundStatus = 'approved';
      if (payment) {
        payment.refundStatus = 'approved';
      }

      // Check if any OTHER valid subscription still covers the user
      const durationDays = { '1_month': 30, '1_year': 365 };
      const now = new Date();
      const otherStillActive = user.paymentHistory.some(p => {
        if (p.paymentId === paymentId) return false;
        if (p.refundStatus !== 'none') return false;
        const days = durationDays[p.duration] || 30;
        const expiry = new Date(p.purchasedAt);
        expiry.setDate(expiry.getDate() + days);
        return expiry > now;
      });

      if (otherStillActive) {
        user.subscriptionTier = 'premium';
        // Recalculate max expiry among other active payments
        let maxExpiry = now;
        let activePaymentId = null;
        user.paymentHistory.forEach(p => {
          if (p.paymentId !== paymentId && p.refundStatus === 'none') {
            const days = durationDays[p.duration] || 30;
            const expiry = new Date(p.purchasedAt);
            expiry.setDate(expiry.getDate() + days);
            if (expiry > maxExpiry) {
              maxExpiry = expiry;
              activePaymentId = p.paymentId;
            }
          }
        });
        user.subscriptionExpiresAt = maxExpiry;
        if (activePaymentId) {
          user.razorpayPaymentId = activePaymentId;
        }
      } else {
        user.subscriptionTier = 'free';
        user.subscriptionExpiresAt = null;
        user.razorpayPaymentId = null;
        user.subscriptionId = null;
      }

      await user.save();

      // Trigger approval Nodemailer email to user
      const { sendEmail } = require('../utils/email');
      try {
        await sendEmail({
          to: user.email,
          subject: 'Premium Pass Refund Approved & Processed',
          html: `
            <div style="font-family: Arial, sans-serif; line-height: 1.6; max-width: 600px; border: 3px solid #111; padding: 20px; border-radius: 8px;">
              <h2 style="text-transform: uppercase; border-bottom: 2px solid #111; padding-bottom: 10px; color: #22c55e;">Refund Processed Successfully</h2>
              <p>Hi ${user.name},</p>
              <p>Your refund request for the Premium Pass has been **approved and processed**.</p>
              <p>A transfer of <b>₹${finalRefundRupees}</b> (representing your original payment of ₹${payment ? payment.amount : 'N/A'} minus a nominal 3% payment gateway processing fee) has been initiated back to your original payment method (Bank, GPay, or Card). Depending on bank guidelines, the money should reflect in your account within 5 to 7 business days.</p>
              <p>As the subscription is refunded, your account limits have returned to the Free baseline limits.</p>
              <p>Thank you for trying Consistency Tracker, and we hope to welcome you back to Premium in the future!</p>
              <br>
              <p>Best regards,<br>The Consistency Team</p>
            </div>
          `
        });
      } catch (emailErr) {
        console.error('Failed to send refund approval email:', emailErr);
      }

      res.json({ success: true, message: 'Refund successfully processed and premium cancelled!' });

    } catch (err) {
      console.error('approveRefund error:', err.message);
      if (err.response) {
        console.error('Razorpay Refund API error response:', err.response.data);
        return res.status(502).json({
          message: 'Razorpay Refund API failed',
          details: err.response.data.error || err.response.data
        });
      }
      res.status(500).json({ message: 'Internal Server Error processing payout.', error: err.message });
    }
  },
  rejectRefund: async (req, res) => {
    try {
      const { id } = req.params; // User ID
      const { reason } = req.body; // Custom rejection text

      if (!reason) {
        return res.status(400).json({ message: 'Rejection reason is required.' });
      }

      const user = await User.findById(id);
      if (!user) return res.status(404).json({ message: 'User not found.' });

      // Find the active requested payment in paymentHistory
      const payment = user.paymentHistory.find(p => p.refundStatus === 'requested');

      // Clear pending refund request status and update payment history
      user.refundStatus = 'none';
      user.refundReason = reason;

      if (payment) {
        payment.refundStatus = 'rejected';
      }

      // Check if any non-refunded subscription covers premium (including the one just rejected)
      const durationDays = { '1_month': 30, '1_year': 365 };
      const now = new Date();
      const stillActive = user.paymentHistory.some(p => {
        if (p.refundStatus !== 'none' && p.refundStatus !== 'rejected') return false;
        const days = durationDays[p.duration] || 30;
        const expiry = new Date(p.purchasedAt);
        expiry.setDate(expiry.getDate() + days);
        return expiry > now;
      });

      if (stillActive) {
        user.subscriptionTier = 'premium';
        // Recalculate max expiry among active payments
        let maxExpiry = now;
        user.paymentHistory.forEach(p => {
          if (p.refundStatus === 'none' || p.refundStatus === 'rejected') {
            const days = durationDays[p.duration] || 30;
            const expiry = new Date(p.purchasedAt);
            expiry.setDate(expiry.getDate() + days);
            if (expiry > maxExpiry) {
              maxExpiry = expiry;
            }
          }
        });
        user.subscriptionExpiresAt = maxExpiry;
      } else {
        user.subscriptionTier = 'free';
      }

      await user.save();

      // Retrieve proof details
      const paymentId = payment ? payment.paymentId : '';
      const usageLogs = user.premiumUsageLogs.filter(log => log.razorpayPaymentId === paymentId);
      let proofHTML = '';
      if (usageLogs.length > 0) {
        proofHTML = `
          <div style="margin-top: 15px; padding: 12px; background: #fee2e2; border-radius: 6px; border: 2px dashed #f87171;">
            <p style="color: #991b1b; font-weight: bold; margin-top: 0;">Feature Utilization Proof:</p>
            <ul style="color: #991b1b; padding-left: 20px; font-size: 13px;">
              ${usageLogs.map(log => `<li>[${new Date(log.timestamp).toLocaleString()}] <b>${log.actionType}</b>: ${log.details}</li>`).join('')}
            </ul>
          </div>
        `;
      }

      // Send rejection Nodemailer email with the reason
      const { sendEmail } = require('../utils/email');
      try {
        await sendEmail({
          to: user.email,
          subject: 'Update on your Premium Pass Refund Request',
          html: `
            <div style="font-family: Arial, sans-serif; line-height: 1.6; max-width: 600px; border: 3px solid #111; padding: 20px; border-radius: 8px;">
              <h2 style="text-transform: uppercase; border-bottom: 2px solid #111; padding-bottom: 10px; color: #ef4444;">Refund Request Declined</h2>
              <p>Hi ${user.name},</p>
              <p>We are writing to provide an update on the refund request you submitted for your Premium Pass subscription.</p>
              <p>We have carefully reviewed your request, but unfortunately, we are <b>unable to process your refund</b> because our policy requires zero-utilization of premium services. Below are the details of your feature usage:</p>
              <div style="background: #f3f4f6; border-left: 4px solid #111; padding: 10px 15px; margin: 15px 0;">
                <i>${reason}</i>
              </div>
              ${proofHTML}
              <p>Because your refund has been declined, <b>your Premium Pass will remain fully active and unlocked</b> until the end of your billing cycle (expires on: ${user.subscriptionExpiresAt ? new Date(user.subscriptionExpiresAt).toLocaleDateString() : 'N/A'}).</p>
              <p>If you have any further questions, please do not hesitate to reply to this email.</p>
              <br>
              <p>Best regards,<br>The Consistency Team</p>
            </div>
          `
        });
      } catch (emailErr) {
        console.error('Failed to send refund rejection email:', emailErr);
      }

      res.json({ success: true, message: 'Refund request successfully declined and premium maintained!' });

    } catch (err) {
      console.error('rejectRefund error:', err.message);
      res.status(500).json({ message: 'Internal Server Error declining request.', error: err.message });
    }
  },
  getAdminReports: async (req, res) => {
    try {
      const { status, category, search } = req.query;
      const query = {};

      if (status) {
        query.status = status;
      }
      if (category) {
        query.category = category;
      }
      if (search) {
        query.$or = [
          { username: { $regex: search, $options: 'i' } },
          { email: { $regex: search, $options: 'i' } },
          { description: { $regex: search, $options: 'i' } }
        ];
      }

      const reports = await Report.find(query).sort({ createdAt: -1 });
      res.json(reports);
    } catch (err) {
      console.error('[ADMIN ERROR] getAdminReports:', err);
      res.status(500).json({ message: 'Server error while fetching reports.', error: err.message });
    }
  },
  updateReportStatus: async (req, res) => {
    try {
      const { id } = req.params;
      const { status } = req.body;

      const validStatuses = ['Pending', 'In Progress', 'Resolved'];
      if (!status || !validStatuses.includes(status)) {
        return res.status(400).json({ message: 'Invalid or missing status.' });
      }

      const report = await Report.findByIdAndUpdate(
        id,
        { status },
        { new: true }
      );

      if (!report) {
        return res.status(404).json({ message: 'Report not found.' });
      }

      // Automated Email Notification on Work On (In Progress) and Resolve (Resolved)
      if (status === 'In Progress' || status === 'Resolved') {
        try {
          const isResolving = status === 'Resolved';
          const subject = isResolving 
            ? `[RESOLVED] Issue Report status updated: Fixed!` 
            : `[IN PROGRESS] We're working on your reported issue!`;
            
          const headerColor = isResolving ? '#22c55e' : '#3b82f6';
          const statusText = isResolving ? 'RESOLVED & FIXED' : 'IN PROGRESS (BEING WORKED UPON)';
          const statusMsg = isResolving 
            ? 'Great news! The issue you reported has been successfully resolved and fixed.' 
            : 'Thank you for reporting this issue. We have reviewed your ticket and our development team is now actively working on a fix.';
          const boxBg = isResolving ? '#f0fdf4' : '#eff6ff';

          await sendEmail({
            to: report.email,
            subject: subject,
            html: `
              <div style="font-family: Arial, sans-serif; line-height: 1.6; max-width: 600px; border: 3px solid #0a0a0a; padding: 24px; border-radius: 12px; background: #ffffff; box-shadow: 6px 6px 0px #0a0a0a; margin: 20px auto;">
                <div style="background: ${headerColor}; padding: 16px; border: 3px solid #0a0a0a; border-radius: 8px; box-shadow: 3px 3px 0 #0a0a0a; margin-bottom: 20px; text-align: center;">
                  <h2 style="margin: 0; text-transform: uppercase; font-family: sans-serif; font-size: 20px; color: #ffffff; text-shadow: 1px 1px 0px #000; letter-spacing: 0.5px;">
                    ${isResolving ? '🐞 Issue Fixed!' : '🛠️ Working On Your Report!'}
                  </h2>
                </div>
                
                <p style="font-size: 15px; font-weight: 700; color: #0a0a0a;">Hi ${report.username || 'User'},</p>
                <p style="font-size: 14px; color: #333; line-height: 1.5; font-weight: 600;">
                  ${statusMsg}
                </p>
                
                <div style="background: ${boxBg}; border: 3px solid #0a0a0a; border-radius: 8px; padding: 18px; margin: 24px 0; box-shadow: 4px 4px 0px #0a0a0a;">
                  <h3 style="margin: 0 0 12px 0; font-size: 12px; font-weight: 900; text-transform: uppercase; color: #555; border-bottom: 1.5px dashed #0a0a0a; padding-bottom: 6px; letter-spacing: 0.5px;">Ticket Specifications</h3>
                  <p style="margin: 0 0 8px 0; font-size: 13px; font-weight: 700; color: #0a0a0a;">
                    <b>Ticket ID:</b> <span style="font-family: monospace; font-size: 12px; background: #e5e7eb; padding: 2px 6px; border: 1.5px solid #0a0a0a; border-radius: 4px;">#${report._id}</span>
                  </p>
                  <p style="margin: 0 0 8px 0; font-size: 13px; font-weight: 700; color: #0a0a0a;">
                    <b>Category:</b> <span style="background: #fff; padding: 2px 6px; border: 1.5px solid #0a0a0a; border-radius: 4px; font-weight: 800;">${report.category}</span>
                  </p>
                  <p style="margin: 0 0 8px 0; font-size: 13px; font-weight: 700; color: #0a0a0a;">
                    <b>Current Status:</b> <span style="background: ${headerColor}; color: white; padding: 2px 6px; border: 1.5px solid #0a0a0a; border-radius: 4px; font-weight: 800; font-size: 11px;">${statusText}</span>
                  </p>
                  <div style="margin-top: 12px; padding: 12px; background: #ffffff; border: 2px solid #0a0a0a; border-radius: 6px; font-style: italic; font-size: 13.5px; color: #333; line-height: 1.4; font-weight: 600;">
                    "${report.description}"
                  </div>
                </div>

                <p style="font-size: 14px; font-weight: 600; color: #555;">
                  Thanks for taking the time to report this and for helping us refine and improve Consistency Tracker!
                </p>
                
                <hr style="border: none; border-top: 2px dashed #e5e7eb; margin: 24px 0;">
                
                <div style="text-align: center; font-size: 13px; font-weight: 800; color: #666; text-transform: uppercase;">
                  The Consistency Team
                </div>
              </div>
            `
          });
          console.log(`[Email Service] Notification email successfully sent to user: ${report.email} for report status update.`);
        } catch (emailErr) {
          console.error('[ADMIN EMAIL ERROR] Failed to send report update email:', emailErr);
        }
      }

      res.json({ message: 'Report status updated successfully.', report });
    } catch (err) {
      console.error('[ADMIN ERROR] updateReportStatus:', err);
      res.status(500).json({ message: 'Server error updating report status.', error: err.message });
    }
  },
  deleteReport: async (req, res) => {
    try {
      const { id } = req.params;
      const report = await Report.findByIdAndDelete(id);

      if (!report) {
        return res.status(404).json({ message: 'Report not found.' });
      }

      res.json({ message: 'Report deleted successfully.' });
    } catch (err) {
      console.error('[ADMIN ERROR] deleteReport:', err);
      res.status(500).json({ message: 'Server error deleting report.', error: err.message });
    }
  },
  getAdminChangelogs: async (req, res) => {
    try {
      const changelogs = await Changelog.find().sort({ createdAt: -1 });
      res.json(changelogs);
    } catch (err) {
      res.status(500).json({ message: 'Server error fetching changelogs.', error: err.message });
    }
  },
  createAdminChangelog: async (req, res) => {
    try {
      const { message, type, createdAt } = req.body;
      if (!message || !type) {
        return res.status(400).json({ message: 'Message and type are required.' });
      }
      const newChangelog = new Changelog({
        message,
        type,
        createdAt: createdAt || new Date()
      });
      await newChangelog.save();
      res.status(201).json(newChangelog);
    } catch (err) {
      res.status(500).json({ message: 'Server error creating changelog.', error: err.message });
    }
  },
  updateAdminChangelog: async (req, res) => {
    try {
      const { id } = req.params;
      const { message, type, createdAt } = req.body;
      const updated = await Changelog.findByIdAndUpdate(
        id,
        { message, type, createdAt: createdAt || new Date() },
        { new: true }
      );
      if (!updated) return res.status(404).json({ message: 'Changelog not found.' });
      res.json(updated);
    } catch (err) {
      res.status(500).json({ message: 'Server error updating changelog.', error: err.message });
    }
  },
  deleteAdminChangelog: async (req, res) => {
    try {
      const { id } = req.params;
      const deleted = await Changelog.findByIdAndDelete(id);
      if (!deleted) return res.status(404).json({ message: 'Changelog not found.' });
      res.json({ message: 'Changelog deleted successfully.' });
    } catch (err) {
      res.status(500).json({ message: 'Server error deleting changelog.', error: err.message });
    }
  }
};
