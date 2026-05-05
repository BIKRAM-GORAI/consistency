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
    const jwtSecret = process.env.JWT_SECRET || 'your-secret-key-change-in-production';
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

module.exports = router;
