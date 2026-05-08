const express = require('express');
const router = express.Router();
const { syncAudit } = require('../controllers/syncController');
const { authenticateToken } = require('../middleware/auth');

// Audit route to get all valid IDs
router.get('/audit', authenticateToken, syncAudit);

module.exports = router;
