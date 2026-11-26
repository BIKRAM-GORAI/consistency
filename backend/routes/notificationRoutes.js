const express = require('express');
const router = express.Router();
const {
  getUserNotifications,
  markNotificationsRead,
} = require('../controllers/notificationController');

router.get('/', getUserNotifications);
router.post('/mark-read', markNotificationsRead);

module.exports = router;
