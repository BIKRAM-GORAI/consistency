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
    
    // Extra security: Verify isAdmin flag AND match against environment ADMIN_EMAIL
    if (!decoded.isAdmin || decoded.email !== process.env.ADMIN_EMAIL) {
      return res.status(403).json({ message: 'Unauthorized. Administrative access required.' });
    }

    req.admin = decoded;
    next();
  } catch (err) {
    return res.status(403).json({ message: 'Invalid, expired, or tampered admin token.' });
  }
};

// Public Admin Login Flow
router.post('/request-otp', adminController.adminRequestOtp);
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
router.post('/users/:id/days', authenticateAdmin, adminController.createAdminDay);
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

// Badge Management
router.get('/badges', authenticateAdmin, adminController.getAdminBadges);
router.post('/badges', authenticateAdmin, adminController.createBadge);
router.put('/badges/:id', authenticateAdmin, adminController.updateBadge);
router.delete('/badges/:id', authenticateAdmin, adminController.deleteBadge);

// Coupon Management
router.post('/coupons', authenticateAdmin, adminController.generateCoupon);
router.get('/coupons', authenticateAdmin, adminController.getCoupons);
router.delete('/coupons/:id', authenticateAdmin, adminController.deleteCoupon);

// Payment Management
router.get('/payments', authenticateAdmin, adminController.getAdminPayments);
router.get('/users/:id/payments', authenticateAdmin, adminController.getAdminUserPayments);

module.exports = router;
