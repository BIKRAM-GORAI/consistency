const express    = require('express');
const router     = express.Router();
const ctrl       = require('../controllers/groupController');
const Group      = require('../models/Group');
const { createGroupValidation, joinGroupValidation, editGroupValidation, removeMemberValidation, handleJoinRequestValidation, joinPublicGroupValidation } = require('../middleware/validation');
const { uploadGroup } = require('../config/cloudinary');
const { authenticateToken } = require('../middleware/auth');

// Cleanup expired groups middleware (runs on every group API request)
const cleanupExpiredGroups = async (req, res, next) => {
  try {
    const expiryMinutes = parseInt(process.env.GROUP_EXPIRY_ON_OWNER_BLACKLIST_MINUTES, 10) || 60;
    const thresholdDate = new Date(Date.now() - expiryMinutes * 60000);

    const expiredGroups = await Group.find({
      ownerBlacklistedAt: { $ne: null, $lte: thresholdDate }
    });

    if (expiredGroups.length > 0) {
      const { cloudinary } = require('../config/cloudinary');
      for (const group of expiredGroups) {
        if (group.iconId) {
          try {
            await cloudinary.uploader.destroy(group.iconId);
          } catch (e) {
            console.error('Failed to delete group icon from Cloudinary:', e);
          }
        }
        await Group.findByIdAndDelete(group._id);
        console.log(`[Cleanup] Deleted expired group: ${group.name} (owner was blacklisted)`);
      }
    }
  } catch (err) {
    console.error('[Cleanup] Error in cleanupExpiredGroups middleware:', err);
  }
  next();
};

router.use(cleanupExpiredGroups);

// Create a new group (only one allowed per user as owner)
router.post('/create', authenticateToken, createGroupValidation, ctrl.createGroup);

// Upload group icon
router.post('/upload-icon', authenticateToken, uploadGroup.single('image'), ctrl.uploadGroupIcon);

// Join an existing group via its join code
router.post('/join', authenticateToken, joinGroupValidation, ctrl.joinGroup);

// Get all groups the authenticated user is a member of
router.get('/mine', authenticateToken, ctrl.myGroups);

// Get all public groups the user is NOT a member of
router.get('/public', authenticateToken, ctrl.publicGroups);

// Join a public group (creates a join request)
router.post('/:groupId/join-public', authenticateToken, joinPublicGroupValidation, ctrl.joinPublicGroup);

// Manage join requests (owner only)
router.get('/:groupId/requests', authenticateToken, ctrl.getRequests);
router.post('/:groupId/requests/:targetUserId', authenticateToken, handleJoinRequestValidation, ctrl.handleJoinRequest);

// Cancel own join request
router.delete('/:groupId/requests', authenticateToken, ctrl.cancelJoinRequest);

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

// Get or generate meeting link
router.get('/:groupId/meeting', authenticateToken, ctrl.getGroupMeeting);

module.exports = router;
