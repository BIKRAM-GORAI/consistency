const Group = require('../models/Group');
const User  = require('../models/User');
const Day   = require('../models/Day');

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
    const { name } = req.body;

    if (!name) {
      return res.status(400).json({ message: 'name is required.' });
    }


    const code  = await makeUniqueCode();
    const group = new Group({
      name,
      code,
      owner: userId,
      members: [userId],
    });

    const saved = await group.save();
    const populated = await Group.findById(saved._id).populate('members', 'name email profilePicture');
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

    const populated = await Group.findById(group._id).populate('members', 'name email profilePicture');
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
      .populate('members', 'name email profilePicture')
      .populate('owner', 'name email profilePicture')
      .sort({ createdAt: -1 });

    res.json(groups);
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
    const group = await Group.findById(req.params.groupId).populate('members', 'name email profilePicture');
    if (!group) return res.status(404).json({ message: 'Group not found.' });
    res.json(group.members);
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

    // Check if the target user has a public profile
    const targetUser = await User.findById(memberId).select('isPublicProfile');
    if (targetUser && targetUser.isPublicProfile === false) {
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
    const { name } = req.body;
    if (!name) return res.status(400).json({ message: 'name is required.' });

    const group = await Group.findById(req.params.groupId);
    if (!group) return res.status(404).json({ message: 'Group not found.' });

    if (String(group.owner) !== String(userId)) {
      return res.status(403).json({ message: 'Only the owner can edit the group.' });
    }

    group.name = name;
    await group.save();
    
    const populated = await Group.findById(group._id).populate('members', 'name email profilePicture').populate('owner', 'name email profilePicture');
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

    await Group.findByIdAndDelete(req.params.groupId);
    res.json({ message: 'Group deleted successfully.' });
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

    const populated = await Group.findById(group._id).populate('members', 'name email profilePicture').populate('owner', 'name email profilePicture');
    res.json(populated);
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
};

module.exports = { createGroup, joinGroup, myGroups, groupMembers, memberDays, editGroup, deleteGroup, removeMember };
