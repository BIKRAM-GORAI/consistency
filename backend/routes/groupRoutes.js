const express    = require('express');
const router     = express.Router();
const ctrl       = require('../controllers/groupController');
const { createGroupValidation, joinGroupValidation, editGroupValidation, removeMemberValidation } = require('../middleware/validation');
const { authenticateToken } = require('../middleware/auth');

// Create a new group (only one allowed per user as owner)
router.post('/create', authenticateToken, createGroupValidation, ctrl.createGroup);

// Join an existing group via its join code
router.post('/join', authenticateToken, joinGroupValidation, ctrl.joinGroup);

// Get all groups the authenticated user is a member of
router.get('/mine', authenticateToken, ctrl.myGroups);

// Get all members in a group with their basic info
router.get('/:groupId/members', authenticateToken, ctrl.groupMembers);

// Read-only: fetch another member's day cards (with authorization check)
router.get('/member-days', authenticateToken, ctrl.memberDays);

// Edit a group (owner only)
router.put('/:groupId', authenticateToken, editGroupValidation, ctrl.editGroup);

// Delete a group (owner only)
router.delete('/:groupId', authenticateToken, ctrl.deleteGroup);

// Remove a member or leave a group
router.post('/:groupId/remove-member', authenticateToken, removeMemberValidation, ctrl.removeMember);

module.exports = router;
