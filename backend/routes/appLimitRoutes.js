const express = require('express');
const router = express.Router();
const { getAppLimits, updateAppLimits } = require('../controllers/appLimitController');
const { authenticateToken } = require('../middleware/auth');

// GET app limits
router.get('/', authenticateToken, getAppLimits);

// PUT update app limits
router.put('/', authenticateToken, updateAppLimits);

module.exports = router;
