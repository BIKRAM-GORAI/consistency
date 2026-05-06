const express = require('express');
const router = express.Router();
const adminController = require('../controllers/adminController');
const jwt = require('jsonwebtoken');

/**
 * Middleware to authenticate admin
 */
const authenticateAdmin = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ message: 'No admin token provided.' });
  }

  try {
    const jwtSecret = process.env.JWT_SECRET;
    if (!jwtSecret) {
      console.error('CRITICAL: JWT_SECRET is missing in .env for Admin');
      return res.status(500).json({ message: 'Server configuration error' });
    }
    const decoded = jwt.verify(token, jwtSecret);
    
    if (!decoded.isAdmin) {
      return res.status(403).json({ message: 'Unauthorized. Not an admin.' });
    }

    req.admin = decoded;
    next();
  } catch (err) {
    return res.status(403).json({ message: 'Invalid or expired admin token.' });
  }
};

// Public Admin Login
router.post('/login', adminController.adminLogin);

// Protected Admin Review Routes
router.get('/reviews', authenticateAdmin, adminController.getAdminReviews);
router.post('/reviews', authenticateAdmin, adminController.createReview);
router.put('/reviews/:id', authenticateAdmin, adminController.updateReview);
router.delete('/reviews/:id', authenticateAdmin, adminController.deleteReview);

// Protected Admin User Routes
router.get('/users', authenticateAdmin, adminController.getAdminUsers);
router.get('/users/:id', authenticateAdmin, adminController.getAdminUserDetails);
router.patch('/users/:id', authenticateAdmin, adminController.updateAdminUser);
router.patch('/users/:id/profile-picture', authenticateAdmin, adminController.updateAdminUserProfilePicture);
router.post('/users/:id/preview-link', authenticateAdmin, adminController.generateAdminPreviewLink);
router.patch('/users/:id/blacklist', authenticateAdmin, adminController.toggleUserBlacklist);
router.delete('/users/:id', authenticateAdmin, adminController.deleteUser);

// Protected Admin Data Management
router.patch('/days/:id', authenticateAdmin, adminController.updateAdminDay);
router.delete('/days/:id', authenticateAdmin, adminController.deleteAdminDay);
router.patch('/goals/:id', authenticateAdmin, adminController.updateAdminGoal);
router.delete('/goals/:id', authenticateAdmin, adminController.deleteAdminGoal);
router.patch('/achievements/:id', authenticateAdmin, adminController.updateAdminAchievement);
router.delete('/achievements/:id', authenticateAdmin, adminController.deleteAdminAchievement);
router.get('/groups', authenticateAdmin, adminController.getAdminGroups);
router.patch('/groups/:id', authenticateAdmin, adminController.updateAdminGroup);
router.patch('/groups/:id/icon', authenticateAdmin, adminController.updateAdminGroupIcon);
router.delete('/groups/:id', authenticateAdmin, adminController.deleteGroup);
router.delete('/groups/:groupId/members/:userId', authenticateAdmin, adminController.removeGroupMember);

module.exports = router;
