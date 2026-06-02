const express = require('express');
const router = express.Router();
const { authenticateToken } = require('../middleware/auth');
const { registerFcmToken, unregisterFcmToken, toggleMuteGroup, notifyGroupChat, notifyVideoCallStart } = require('../controllers/fcmController');

// All FCM routes require user authentication
router.post('/token', authenticateToken, registerFcmToken);
router.delete('/token', authenticateToken, unregisterFcmToken);
router.post('/mute', authenticateToken, toggleMuteGroup);
router.post('/notify-chat', authenticateToken, notifyGroupChat);
router.post('/notify-video-call', authenticateToken, notifyVideoCallStart);

module.exports = router;
