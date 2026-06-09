const Group = require('../models/Group');
const User  = require('../models/User');
const Day   = require('../models/Day');
const { cloudinary } = require('../config/cloudinary');
const { sendEmail } = require('../utils/email');
const jwt = require('jsonwebtoken');
const axios = require('axios');

// ── Helpers ────────────────────────────────────────────────

/** Generates a random 6-character alphanumeric code, uppercase */
function generateCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // skip confusable chars
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}

/** Make a unique code that doesn't already exist in DB */
async function makeUniqueCode() {
  let code, exists;
  do {
    code  = generateCode();
    exists = await Group.findOne({ code });
  } while (exists);
  return code;
}

// ── Controllers ────────────────────────────────────────────

/**
 * POST /api/groups/create
 * Body: { name }
 * Creates a new group for the authenticated user. Each user may only own one group.
 */
/**
 * POST /api/groups/moderate
 * Body: { name, isPublic, description, icon }
 * Moderates the group details via AI service and returns safety details.
 */
const moderateGroup = async (req, res) => {
  try {
    const userId = req.user.userId;
    const { name, isPublic, description, icon } = req.body;

    if (!name) {
      return res.status(400).json({ message: 'name is required.' });
    }

    if (!icon || !icon.startsWith('data:image')) {
      return res.status(400).json({ message: 'A group icon is mandatory.' });
    }

    // 1. Fetch user for daily limits check
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ message: 'User not found.' });
    }

    // Reset daily count if day has changed
    const now = new Date();
    const lastReset = user.dailyGroupCreationsResetTime ? new Date(user.dailyGroupCreationsResetTime) : new Date(0);
    if (now.toDateString() !== lastReset.toDateString()) {
      user.dailyGroupCreationsCount = 0;
      user.dailyGroupCreationsResetTime = now;
      await user.save();
    }

    const isPremium = user.subscriptionTier === 'premium' && 
      (!user.subscriptionExpiresAt || new Date(user.subscriptionExpiresAt) > now);

    const limit = isPremium
      ? (parseInt(process.env.PREMIUM_DAILY_GROUP_LIMIT, 10) || 10)
      : (parseInt(process.env.FREE_DAILY_GROUP_LIMIT, 10) || 5);

    if (user.dailyGroupCreationsCount >= limit) {
      return res.status(429).json({
        message: `Daily group creation limit reached. You can create up to ${limit} groups per day.`
      });
    }

    // 2. Call stand-alone AI Service to moderate group details
    let safetyStatus = 'unknown';
    let apiSuccess = false;
    let score = undefined;
    let reason = 'AI service error';

    const aiServiceUrl = process.env.AI_SERVICE_URL || 'http://localhost:5002';
    const jwtSecret = process.env.JWT_SECRET;
    
    if (!jwtSecret) {
      console.error('[groupController] JWT_SECRET is missing from environment.');
      return res.status(500).json({ message: 'AI configuration error on server.' });
    }

    // Generate JWT token
    const token = jwt.sign(
      { userId, action: 'moderate-group-creation' },
      jwtSecret,
      { expiresIn: '5m' }
    );

    try {
      const aiResponse = await axios.post(`${aiServiceUrl}/api/ai/moderate-group`, {
        name,
        description,
        icon
      }, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        timeout: 20000
      });

      apiSuccess = true;
      score = aiResponse.data.score;
      reason = aiResponse.data.reason;

      if (score !== undefined) {
        if (score < 5) {
          safetyStatus = 'rejected';
        } else if (score < 8) {
          safetyStatus = 'warning';
        } else {
          safetyStatus = 'safe';
        }
      }
    } catch (aiErr) {
      console.error('[groupController] AI group moderation failed:', aiErr.message);
    }

    if (apiSuccess) {
      user.dailyGroupCreationsCount += 1;
      await user.save();
    }

    if (safetyStatus === 'rejected') {
      return res.json({
        score,
        reason,
        safetyStatus,
        dailyGroupCreationsCount: user.dailyGroupCreationsCount,
        dailyGroupCreationsLimit: limit
      });
    }

    // If safe, warning or unknown, generate creationToken
    const creationToken = jwt.sign(
      { userId, name, isPublic: !!isPublic, description: description || '', icon, safetyStatus },
      jwtSecret,
      { expiresIn: '15m' }
    );

    return res.json({
      score,
      reason,
      safetyStatus,
      creationToken,
      dailyGroupCreationsCount: user.dailyGroupCreationsCount,
      dailyGroupCreationsLimit: limit
    });
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
};

/**
 * POST /api/groups/create
 * Body: { creationToken }
 * Verifies the token and actually creates the group.
 */
const createGroup = async (req, res) => {
  try {
    const userId = req.user.userId;
    const { creationToken } = req.body;

    if (!creationToken) {
      return res.status(400).json({ message: 'creationToken is required.' });
    }

    const jwtSecret = process.env.JWT_SECRET;
    let decoded;
    try {
      decoded = jwt.verify(creationToken, jwtSecret);
    } catch (tokenErr) {
      return res.status(400).json({ message: 'Invalid or expired group creation session. Please analyze again.' });
    }

    if (String(decoded.userId) !== String(userId)) {
      return res.status(403).json({ message: 'Unauthorized session ownership.' });
    }

    const { name, isPublic, description, icon, safetyStatus } = decoded;

    // Check ownership limits
    const publicLimit = parseInt(process.env.PUBLIC_GROUP_LIMIT) || 10;
    const privateLimit = parseInt(process.env.PRIVATE_GROUP_LIMIT) || 10;

    if (isPublic) {
      const publicCount = await Group.countDocuments({ owner: userId, isPublic: true });
      if (publicCount >= publicLimit) {
        return res.status(403).json({ message: `You have reached the limit of ${publicLimit} public groups.` });
      }
    } else {
      const privateCount = await Group.countDocuments({ owner: userId, isPublic: false });
      if (privateCount >= privateLimit) {
        return res.status(403).json({ message: `You have reached the limit of ${privateLimit} private teams.` });
      }
    }

    let iconUrl = '';
    let iconId = '';

    // Upload icon to Cloudinary
    if (icon && icon.startsWith('data:image')) {
      const result = await cloudinary.uploader.upload(icon, {
        folder: 'consistency_app_groups',
      });
      iconUrl = result.secure_url;
      iconId = result.public_id;
    }

    const code  = await makeUniqueCode();
    const group = new Group({
      name,
      code,
      owner: userId,
      members: [userId],
      isPublic,
      description,
      icon: iconUrl,
      iconId: iconId,
      safetyStatus
    });

    const saved = await group.save();
    const populated = await Group.findById(saved._id).populate('members', 'name username profilePicture');
    res.status(201).json(populated);
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
};

/**
 * POST /api/groups/join
 * Body: { code }
 * Adds the authenticated user to a group using the join code.
 */
const joinGroup = async (req, res) => {
  try {
    // Get userId from authenticated user (from JWT token)
    const userId = req.user.userId;
    const { code } = req.body;

    if (!code) {
      return res.status(400).json({ message: 'code is required.' });
    }

    const group = await Group.findOne({ code: code.toUpperCase().trim() });
    if (!group) {
      return res.status(404).json({ message: 'No group found with that code. Double-check and try again.' });
    }

    // Don't add twice
    if (group.members.map(String).includes(String(userId))) {
      return res.status(400).json({ message: 'You are already a member of this group.' });
    }

    // Check if the owner is blacklisted
    const owner = await User.findById(group.owner);
    if (owner && owner.isBlacklisted) {
      if (group.isPublic) {
        return res.status(403).json({
          message: `This group cannot be joined because the creator (${owner.name}) has been blacklisted. The group is scheduled for deletion.`
        });
      }
    }

    // Auto-remove any pending join request if this is a public group and they are joining via code
    if (group.requests && group.requests.length > 0) {
      group.requests = group.requests.filter(req => String(req.user) !== String(userId));
    }

    group.members.push(userId);
    await group.save();

    const populated = await Group.findById(group._id).populate('members', 'name username profilePicture');
    res.json(populated);
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
};

/**
 * GET /api/groups/mine
 * Returns all groups the authenticated user is a member of.
 */
const myGroups = async (req, res) => {
  try {
    // Get userId from authenticated user (from JWT token)
    const userId = req.user.userId;

    const groupsRaw = await Group.find({ members: userId })
      .populate('members', 'name username profilePicture currentStreak highestStreak')
      .populate('owner', 'name username profilePicture isBlacklisted blacklistReason')
      .populate('requests.user', 'name username profilePicture')
      .sort({ createdAt: -1 });

    const expiryMinutes = parseInt(process.env.GROUP_EXPIRY_ON_OWNER_BLACKLIST_MINUTES, 10) || 60;

    // Filter sensitive data before sending
    const groups = groupsRaw.map(g => {
      const groupObj = g.toObject();
      const isOwner = String(groupObj.owner._id || groupObj.owner) === String(userId);
      
      // Only owner sees the join code and requests
      if (!isOwner) {
        delete groupObj.code;
        delete groupObj.requests;
      }
      
      // Add memberCount for UI convenience
      groupObj.memberCount = g.members.length;
      groupObj.groupExpiryMinutes = expiryMinutes;
      
      return groupObj;
    });

    res.json(groups);
  } catch (err) {
    console.error(`[ERROR] myGroups for user ${req.user?.userId}:`, err);
    res.status(500).json({ message: 'Server error loading your groups.', error: err.message });
  }
};

/**
 * GET /api/groups/public
 * Returns all public groups the authenticated user is NOT a member of.
 */
const publicGroups = async (req, res) => {
  try {
    const userId = req.user.userId;
    const groupsRaw = await Group.find({
      isPublic: true,
      members: { $ne: userId }
    })
    .select('name description isPublic icon members requests owner createdAt ownerBlacklistedAt safetyStatus') 
    .populate('owner', 'name username profilePicture isBlacklisted blacklistReason')
    .sort({ createdAt: -1 });

    const expiryMinutes = parseInt(process.env.GROUP_EXPIRY_ON_OWNER_BLACKLIST_MINUTES, 10) || 60;

    // Filter to hide member list and only show count
    const groups = groupsRaw.map(g => {
      const groupObj = g.toObject();
      groupObj.memberCount = g.members ? g.members.length : 0;
      groupObj.hasRequested = g.requests ? g.requests.some(r => String(r.user) === String(userId)) : false;
      groupObj.groupExpiryMinutes = expiryMinutes;
      delete groupObj.members; 
      delete groupObj.requests;
      return groupObj;
    });

    res.json(groups);
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
};

/**
 * POST /api/groups/:groupId/join-public
 * Joins a public group without a code.
 */
const joinPublicGroup = async (req, res) => {
  try {
    const userId = req.user.userId;
    const { groupId } = req.params;

    const group = await Group.findById(groupId);
    if (!group) return res.status(404).json({ message: 'Group not found.' });
    if (!group.isPublic) return res.status(403).json({ message: 'This is not a public group.' });

    // Check if the owner is blacklisted
    const owner = await User.findById(group.owner);
    if (owner && owner.isBlacklisted) {
      return res.status(403).json({
        message: `This group cannot be joined because the creator (${owner.name}) has been blacklisted. The group is scheduled for deletion.`
      });
    }

    if (group.members.map(String).includes(String(userId))) {
      return res.status(400).json({ message: 'You are already a member of this group.' });
    }

    if (group.requests.some(r => String(r.user) === String(userId))) {
      return res.status(400).json({ message: 'Your join request is already pending.' });
    }

    group.requests.push({ user: userId, message: req.body.message });
    await group.save();

    res.json({ message: 'Join request sent! Waiting for owner approval.' });
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
};

/**
 * GET /api/groups/:groupId/requests
 * Returns pending join requests (owner only).
 */
const getRequests = async (req, res) => {
  try {
    const userId = req.user.userId;
    const { groupId } = req.params;

    const group = await Group.findById(groupId).populate('requests.user', 'name username profilePicture');
    if (!group) return res.status(404).json({ message: 'Group not found.' });

    if (String(group.owner) !== String(userId)) {
      return res.status(403).json({ message: 'Only the owner can view join requests.' });
    }

    res.json(group.requests);
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
};

/**
 * POST /api/groups/:groupId/requests/:targetUserId
 * Approves or rejects a join request.
 * Body: { action: 'approve' | 'reject' }
 */
const handleJoinRequest = async (req, res) => {
  try {
    const userId = req.user.userId;
    const { groupId, targetUserId } = req.params;
    const { action } = req.body;

    const group = await Group.findById(groupId).populate('owner', 'name');
    if (!group) return res.status(404).json({ message: 'Group not found.' });

    if (String(group.owner._id || group.owner) !== String(userId)) {
      return res.status(403).json({ message: 'Only the owner can manage join requests.' });
    }

    const targetUser = await User.findById(targetUserId);
    if (!targetUser) return res.status(404).json({ message: 'User not found.' });

    // Remove from requests anyway
    group.requests = group.requests.filter(r => String(r.user) !== String(targetUserId));

    if (action === 'approve') {
      if (!group.members.map(String).includes(String(targetUserId))) {
        group.members.push(targetUserId);
      }
    }

    await group.save();

    // Send Email Notification
    const siteUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
    const isApproved = action === 'approve';
    const accentColor = isApproved ? '#22C55E' : '#EF4444';
    const statusText = isApproved ? 'Request Accepted' : 'Request Declined';
    
    const emailHtml = `
      <div style="background-color: #f8f5f0; padding: 40px 10px;">
        <div style="font-family: 'Inter', Arial, sans-serif; padding: 40px 20px; color: #111111; max-width: 500px; margin: 0 auto; border: 4px solid #111111; border-radius: 0px; background-color: #ffffff; box-shadow: 12px 12px 0px #111111;">
          <div style="text-align: center; margin-bottom: 40px;">
            <div style="font-size: 24px; font-weight: 900; text-transform: uppercase; letter-spacing: 2px; color: #111111 !important;">
              ⚡ CONSISTENCY TRACKER
            </div>
          </div>
          
          <h2 style="font-size: 32px; font-weight: 900; margin: 0 0 30px 0; text-transform: uppercase; letter-spacing: -1px; line-height: 1.1; text-align: center; color: #111111 !important;">JOIN REQUEST<br>UPDATE</h2>
          
          <div style="text-align: center; margin-bottom: 40px;">
            <div style="background-color: ${accentColor} !important; color: ${isApproved ? '#000000' : '#ffffff'} !important; padding: 18px 36px; box-shadow: 8px 8px 0px #111111; display: inline-block;">
              <h3 style="margin: 0; font-size: 18px; font-weight: 900; text-transform: uppercase; letter-spacing: 0.5px; color: inherit !important;">${statusText}</h3>
            </div>
          </div>

          <div style="text-align: center; margin-bottom: 30px;">
            <p style="font-size: 18px; font-weight: 800; margin-bottom: 10px; color: #111111 !important;">
              Hi ${targetUser.name.split(' ')[0]},
            </p>
            <p style="font-size: 16px; line-height: 1.6; color: #111111 !important; margin: 0;">
              <strong>${group.owner.name}</strong>, owner of the group <strong>${group.name}</strong>, has reviewed your request.
            </p>
          </div>

          <div style="background: ${isApproved ? '#f0fdf4' : '#fef2f2'} !important; padding: 25px; margin-bottom: 40px; text-align: center; box-shadow: 8px 8px 0px #111111;">
            <p style="margin: 0; font-size: 15px; line-height: 1.6; color: #111111 !important; font-weight: 600;">
              ${isApproved ? 
                `SUCCESS! You're now a member. Start tracking and contributing now!` : 
                `UPDATE: Unfortunately, your request wasn't accepted this time. Keep exploring!`
              }
            </p>
          </div>

          <div style="text-align: center; margin-top: 10px;">
            <a href="${siteUrl}" style="display: inline-block; background-color: #FF3EA5 !important; color: #ffffff !important; padding: 20px 40px; border-radius: 0px; font-size: 20px; font-weight: 900; text-decoration: none; text-transform: uppercase; box-shadow: 10px 10px 0px #111111;">
              OPEN WEBSITE
            </a>
          </div>

          <div style="margin-top: 60px; padding-top: 30px; border-top: 4px solid #111111; text-align: center;">
            <p style="font-size: 12px; color: #111111 !important; font-weight: 900; text-transform: uppercase; letter-spacing: 2px; margin: 0;">
              CONSISTENCY-DAILY
            </p>
            <p style="font-size: 10px; color: #999999 !important; margin-top: 15px; font-family: monospace;">
              Ref: ${Math.random().toString(36).substring(2, 9).toUpperCase()} | ${new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', dateStyle: 'medium', timeStyle: 'short' })}
            </p>
          </div>
        </div>
      </div>
    `;

    if (targetUser.emailNotifications !== false) {
      console.log(`Sending join request ${action} email to: ${targetUser.email} for group: ${group.name}`);
      sendEmail({
        to: targetUser.email,
        subject: `Join Request ${isApproved ? 'Approved' : 'Declined'} — ${group.name}`,
        html: emailHtml
      })
      .then(() => console.log(`Successfully sent ${action} email to ${targetUser.email}`))
      .catch(err => console.error('Error sending join request email:', err));
    } else {
      console.log(`Email notifications disabled for user: ${targetUser.email}`);
    }

    res.json({ message: `User ${action === 'approve' ? 'approved' : 'rejected'}.` });
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
};

/**
 * DELETE /api/groups/:groupId/requests
 * Allows a user to cancel their own pending join request.
 */
const cancelJoinRequest = async (req, res) => {
  try {
    const userId = req.user.userId;
    const { groupId } = req.params;

    const group = await Group.findById(groupId);
    if (!group) return res.status(404).json({ message: 'Group not found.' });

    // Remove from requests
    const originalCount = group.requests.length;
    group.requests = group.requests.filter(r => String(r.user) !== String(userId));

    if (group.requests.length === originalCount) {
      return res.status(400).json({ message: 'No pending request found for this group.' });
    }

    await group.save();
    res.json({ message: 'Join request cancelled.' });
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
};

/**
 * GET /api/groups/:groupId/members
 * Returns member list for a specific group.
 */
const groupMembers = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;

    const userId = req.user.userId;
    const { groupId } = req.params;

    // Security Check: Is the requesting user a member of this group?
    const isMember = await Group.findOne({ _id: groupId, members: userId });
    if (!isMember) {
      return res.status(403).json({ message: 'Access denied. You must be a member to view the member list.' });
    }

    const group = await Group.findById(groupId)
      .populate({
        path: 'members',
        select: 'name username profilePicture currentStreak highestStreak',
        options: {
          skip: skip,
          limit: limit
        }
      });

    if (!group) return res.status(404).json({ message: 'Group not found.' });

    // Get total member count for pagination
    const totalGroup = await Group.findById(req.params.groupId).select('members');
    const totalCount = totalGroup.members.length;
    const hasMore = (skip + group.members.length) < totalCount;

    res.json({
      members: group.members,
      pagination: {
        currentPage: page,
        totalItems: totalCount,
        itemsPerPage: limit,
        hasMore
      }
    });
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
};

/**
 * GET /api/groups/member-days?memberId=&page=&limit=
 * Read-only: returns paginated day cards for a member (for group profile viewing).
 * Only accessible if the requesting user is in the same group as the target member.
 * Default: 10 days per page
 */
const memberDays = async (req, res) => {
  try {
    // Get userId from authenticated user (from JWT token)
    const requestingUserId = req.user.userId;
    const { memberId } = req.query;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;

    if (!memberId) return res.status(400).json({ message: 'memberId is required.' });

    // Verify that the requesting user is in the same group as the target member
    const sharedGroups = await Group.find({
      members: { $all: [requestingUserId, memberId] }
    });

    if (sharedGroups.length === 0) {
      return res.status(403).json({ message: 'Access denied. You can only view data of users in your groups.' });
    }

    // Check if they share any PUBLIC group. If they do, the consent rule applies.
    const sharesPublicGroup = sharedGroups.some(g => g.isPublic === true);

    // Get streak info from target user
    const targetUser = await User.findById(memberId).select('isPublicProfile currentStreak highestStreak');

    // Get total count for pagination
    const total = await Day.countDocuments({ userId: memberId });

    // Get paginated days (newest first)
    const skip = (page - 1) * limit;
    const days = await Day.find({ userId: memberId })
      .sort({ date: -1 })
      .skip(skip)
      .limit(limit);

    const hasMore = (skip + days.length) < total;

    res.json({
      days,
      streak: {
        current: targetUser?.currentStreak || 0,
        highest: targetUser?.highestStreak || 0
      },
      pagination: {
        currentPage: page,
        totalPages: Math.ceil(total / limit),
        totalItems: total,
        itemsPerPage: limit,
        hasMore
      }
    });
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
};

/**
 * PUT /api/groups/:groupId
 * Body: { name }
 * Edits the group name (owner only).
 */
const editGroup = async (req, res) => {
  try {
    // Get userId from authenticated user (from JWT token)
    const userId = req.user.userId;
    const { name, description, icon } = req.body;

    const group = await Group.findById(req.params.groupId);
    if (!group) return res.status(404).json({ message: 'Group not found.' });

    if (String(group.owner) !== String(userId)) {
      return res.status(403).json({ message: 'Only the owner can edit the group.' });
    }

    if (name) group.name = name;
    if (description !== undefined) group.description = description;
    
    // If icon is a base64 string, upload it and delete old one
    if (icon && icon.startsWith('data:image')) {
      // Delete old one if exists
      if (group.iconId) {
        await cloudinary.uploader.destroy(group.iconId);
      }
      
      const result = await cloudinary.uploader.upload(icon, {
        folder: 'consistency_app_groups',
      });
      group.icon = result.secure_url;
      group.iconId = result.public_id;
    } else if (icon === '') {
      // User removed icon
      if (group.iconId) {
        await cloudinary.uploader.destroy(group.iconId);
      }
      group.icon = '';
      group.iconId = '';
    }
    
    await group.save();
    
    const populated = await Group.findById(group._id).populate('members', 'name username profilePicture').populate('owner', 'name username profilePicture');
    res.json(populated);
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
};

/**
 * DELETE /api/groups/:groupId
 * Deletes the group entirely (owner only).
 */
const deleteGroup = async (req, res) => {
  try {
    // Get userId from authenticated user (from JWT token)
    const userId = req.user.userId;

    const group = await Group.findById(req.params.groupId);
    if (!group) return res.status(404).json({ message: 'Group not found.' });

    if (String(group.owner) !== String(userId)) {
      return res.status(403).json({ message: 'Only the owner can delete the group.' });
    }

    // Delete icon from Cloudinary if exists
    if (group.iconId) {
      await cloudinary.uploader.destroy(group.iconId);
    }

    await Group.findByIdAndDelete(req.params.groupId);
    res.json({ message: 'Group deleted.' });
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
};

/**
 * POST /api/groups/:groupId/remove-member
 * Body: { targetUserId }
 * Removes a member. Owner can remove anyone. A user can remove themselves.
 */
const removeMember = async (req, res) => {
  try {
    // Get userId from authenticated user (from JWT token)
    const userId = req.user.userId;
    const { targetUserId } = req.body;
    if (!targetUserId) return res.status(400).json({ message: 'targetUserId is required.' });

    const group = await Group.findById(req.params.groupId);
    if (!group) return res.status(404).json({ message: 'Group not found.' });

    // Check permissions
    const isOwnerRequesting = String(group.owner) === String(userId);
    const isSelfLeaving = String(userId) === String(targetUserId);

    if (!isOwnerRequesting && !isSelfLeaving) {
      return res.status(403).json({ message: 'You do not have permission to remove this member.' });
    }

    // Owner cannot be removed or leave
    if (String(group.owner) === String(targetUserId)) {
      return res.status(400).json({ message: 'The owner cannot leave or be removed from the group. Delete the group instead.' });
    }

    group.members = group.members.filter(m => String(m) !== String(targetUserId));
    await group.save();

    const populated = await Group.findById(group._id).populate('members', 'name username profilePicture').populate('owner', 'name username profilePicture');
    res.json(populated);
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
};

const uploadGroupIcon = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ message: 'No file uploaded.' });
    }
    // Cloudinary URL is in req.file.path
    res.json({ icon: req.file.path });
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
};

const getGroupMeeting = async (req, res) => {
  try {
    const userId = req.user.userId;
    const { groupId } = req.params;

    const group = await Group.findById(groupId);
    if (!group) return res.status(404).json({ message: 'Group not found.' });

    // Security: Must be a member
    if (!group.members.map(String).includes(String(userId))) {
      return res.status(403).json({ message: 'Access denied. You must be a member of this group.' });
    }

    const threeHoursAgo = new Date(Date.now() - 3 * 60 * 60 * 1000);
    
    // Check if active meeting exists and is < 3 hours old
    // FORCE fresh ID if it's a legacy "TODOAI-" prefixed room for better privacy
    if (group.activeMeeting && group.activeMeeting.roomId && 
        !group.activeMeeting.roomId.startsWith('TODOAI') && 
        group.activeMeeting.createdAt > threeHoursAgo) {
      return res.json({ roomId: group.activeMeeting.roomId });
    }

    // Generate new room ID - purely random hex to avoid "moderator required" issues on public Jitsi
    const crypto = require('crypto');
    const newRoomId = crypto.randomBytes(16).toString('hex');
    
    group.activeMeeting = {
      roomId: newRoomId,
      createdAt: new Date()
    };
    
    await group.save();
    res.json({ roomId: newRoomId });

  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
};

const getCreationLimits = async (req, res) => {
  try {
    const userId = req.user.userId;
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ message: 'User not found.' });
    }

    // Reset daily count if day has changed
    const now = new Date();
    const lastReset = user.dailyGroupCreationsResetTime ? new Date(user.dailyGroupCreationsResetTime) : new Date(0);
    if (now.toDateString() !== lastReset.toDateString()) {
      user.dailyGroupCreationsCount = 0;
      user.dailyGroupCreationsResetTime = now;
      await user.save();
    }

    const isPremium = user.subscriptionTier === 'premium' && 
      (!user.subscriptionExpiresAt || new Date(user.subscriptionExpiresAt) > now);

    const limit = isPremium
      ? (parseInt(process.env.PREMIUM_DAILY_GROUP_LIMIT, 10) || 10)
      : (parseInt(process.env.FREE_DAILY_GROUP_LIMIT, 10) || 5);

    res.json({
      dailyGroupCreationsCount: user.dailyGroupCreationsCount,
      dailyGroupCreationsLimit: limit
    });
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
};

module.exports = { 
  createGroup, 
  joinGroup, 
  myGroups, 
  publicGroups,
  joinPublicGroup,
  getRequests,
  handleJoinRequest,
  cancelJoinRequest,
  groupMembers, 
  memberDays, 
  editGroup, 
  deleteGroup, 
  removeMember,
  uploadGroupIcon,
  getGroupMeeting,
  getCreationLimits,
  moderateGroup
};
