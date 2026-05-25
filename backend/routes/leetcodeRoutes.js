const express = require('express');
const router = express.Router();
const {
  generateVerificationCode,
  verifyLeetCodeProfile,
  validateLeetCodeProblem,
  getDailyLeetCodeProblem,
  disconnectLeetCode
} = require('../controllers/leetcodeController');
const { authenticateToken } = require('../middleware/auth');

// POST /api/leetcode/generate-code
// Generate verification code for user
router.post('/generate-code', authenticateToken, generateVerificationCode);

// POST /api/leetcode/verify-profile
// Verify LeetCode profile ownership
router.post('/verify-profile', authenticateToken, verifyLeetCodeProfile);

// POST /api/leetcode/validate-problem
// Validate LeetCode problem submission
router.post('/validate-problem', authenticateToken, validateLeetCodeProblem);

// GET /api/leetcode/daily-problem
// Get current daily LeetCode problem
router.get('/daily-problem', authenticateToken, getDailyLeetCodeProblem);

// POST /api/leetcode/disconnect
// Disconnect connected LeetCode profile
router.post('/disconnect', authenticateToken, disconnectLeetCode);

module.exports = router;