const Group = require('../models/Group');
const User  = require('../models/User');
const Day   = require('../models/Day');
const { cloudinary } = require('../config/cloudinary');

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
const createGroup = async (req, res) => {
  try {
    // Get userId from authenticated user (from JWT token)
    const userId = req.user.userId;
    const { name, isPublic, description, icon } = req.body;

    if (!name) {
      return res.status(400).json({ message: 'name is required.' });
    }

    let iconUrl = '';
    let iconId = '';

    // If icon is a base64 string, upload it
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
      isPublic: !!isPublic,
      description: description || '',
      icon: iconUrl,
      iconId: iconId,
    });

    const saved = await group.save();
    const populated = await Group.findById(saved._id).populate('members', 'name username email profilePicture');
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

    group.members.push(userId);
    await group.save();

    const populated = await Group.findById(group._id).populate('members', 'name username email profilePicture');
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

    const groups = await Group.find({ members: userId })
      .populate('members', 'name username profilePicture currentStreak highestStreak')
      .populate('owner', 'name username profilePicture')
      .sort({ createdAt: -1 });

    res.json(groups);
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
};

/**
 * GET /api/groups/public
 * Returns all public groups the authenticated user is NOT a member of.
 */
const publicGroups = async (req, res) => {
  try {
    const userId = req.user.userId;
    const groups = await Group.find({
      isPublic: true,
      members: { $ne: userId }
    })
    .select('name description isPublic icon members owner createdAt') // Exclude code
    .populate('owner', 'name username profilePicture')
    .sort({ createdAt: -1 });

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

    if (group.members.map(String).includes(String(userId))) {
      return res.status(400).json({ message: 'You are already a member of this group.' });
    }

    group.members.push(userId);
    await group.save();

    const populated = await Group.findById(group._id)
      .populate('members', 'name username email profilePicture')
      .populate('owner', 'name username email profilePicture');
    res.json(populated);
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

    // Check if the target user has a public profile and get streak info
    const targetUser = await User.findById(memberId).select('isPublicProfile currentStreak highestStreak');
    
    // Bypass privacy check if they share a public group
    if (!sharesPublicGroup && targetUser && targetUser.isPublicProfile === false) {
      return res.status(403).json({ message: 'This user has a private profile.' });
    }

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
    
    const populated = await Group.findById(group._id).populate('members', 'name username email profilePicture').populate('owner', 'name username email profilePicture');
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

    const populated = await Group.findById(group._id).populate('members', 'name username email profilePicture').populate('owner', 'name username email profilePicture');
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

module.exports = { 
  createGroup, 
  joinGroup, 
  myGroups, 
  publicGroups,
  joinPublicGroup,
  groupMembers, 
  memberDays, 
  editGroup, 
  deleteGroup, 
  removeMember,
  uploadGroupIcon
};
