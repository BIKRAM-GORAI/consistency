const express = require('express');
const router = express.Router();
const friendController = require('../controllers/friendController');
const { authenticateToken } = require('../middleware/auth');

router.post('/request/:targetUserId', authenticateToken, friendController.sendFriendRequest);
router.post('/accept/:targetUserId', authenticateToken, friendController.acceptFriendRequest);
router.post('/decline/:targetUserId', authenticateToken, friendController.declineFriendRequest);
router.post('/cancel/:targetUserId', authenticateToken, friendController.cancelFriendRequest);
router.get('/list', authenticateToken, friendController.getFriendsList);
router.get('/requests', authenticateToken, friendController.getFriendRequests);
router.delete('/:targetUserId', authenticateToken, friendController.removeFriend);
router.get('/status/:targetUserId', authenticateToken, friendController.getFriendshipStatus);

module.exports = router;
