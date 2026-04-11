const express    = require('express');
const router     = express.Router();
const ctrl       = require('../controllers/groupController');

// Create a new group (only one allowed per user as owner)
router.post('/create', ctrl.createGroup);

// Join an existing group via its join code
router.post('/join', ctrl.joinGroup);

// Get all groups the user is a member of
router.get('/mine', ctrl.myGroups);

// Get all members in a group with their basic info
router.get('/:groupId/members', ctrl.groupMembers);

// Read-only: fetch another member's day cards
router.get('/member-days', ctrl.memberDays);

module.exports = router;
