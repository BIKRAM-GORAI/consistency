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
 * Body: { userId, name }
 * Creates a new group. Each user may only own one group.
 */
const createGroup = async (req, res) => {
  try {
    const { userId, name } = req.body;

    if (!userId || !name) {
      return res.status(400).json({ message: 'userId and name are required.' });
    }

    // Enforce one-group-per-owner rule
    const existing = await Group.findOne({ owner: userId });
    if (existing) {
      return res.status(400).json({
        message: 'You already own a team. You cannot create another one.',
        group: existing,
      });
    }

    const code  = await makeUniqueCode();
    const group = new Group({
      name,
      code,
      owner: userId,
      members: [userId],
    });

    const saved = await group.save();
    const populated = await Group.findById(saved._id).populate('members', 'name email');
    res.status(201).json(populated);
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
};

/**
 * POST /api/groups/join
 * Body: { userId, code }
 * Adds the user to a group using the join code.
 */
const joinGroup = async (req, res) => {
  try {
    const { userId, code } = req.body;

    if (!userId || !code) {
      return res.status(400).json({ message: 'userId and code are required.' });
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

    const populated = await Group.findById(group._id).populate('members', 'name email');
    res.json(populated);
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
};

/**
 * GET /api/groups/mine?userId=
 * Returns all groups the user is a member of.
 */
const myGroups = async (req, res) => {
  try {
    const { userId } = req.query;
    if (!userId) return res.status(400).json({ message: 'userId is required.' });

    const groups = await Group.find({ members: userId })
      .populate('members', 'name email')
      .populate('owner', 'name email')
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
    const group = await Group.findById(req.params.groupId).populate('members', 'name email');
    if (!group) return res.status(404).json({ message: 'Group not found.' });
    res.json(group.members);
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
};

/**
 * GET /api/groups/member-days?memberId=
 * Read-only: returns all day cards for a member (for group profile viewing).
 */
const memberDays = async (req, res) => {
  try {
    const { memberId } = req.query;
    if (!memberId) return res.status(400).json({ message: 'memberId is required.' });

    const days = await Day.find({ userId: memberId }).sort({ date: 1 });
    res.json(days);
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
};

module.exports = { createGroup, joinGroup, myGroups, groupMembers, memberDays };
