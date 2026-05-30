const express = require('express');
const router = express.Router();
const subscriptionController = require('../controllers/subscriptionController');
const { authenticateToken } = require('../middleware/auth');

// Protected User Subscription Details
router.get('/status', authenticateToken, subscriptionController.getSubscriptionStatus);
router.post('/apply-coupon', authenticateToken, subscriptionController.applyCoupon);

// Razorpay Payment Actions
router.post('/razorpay/create-order', authenticateToken, subscriptionController.createRazorpayOrder);
router.post('/razorpay/verify-payment', authenticateToken, subscriptionController.verifyRazorpayPayment);
router.post('/razorpay/check-pending', authenticateToken, subscriptionController.checkPendingSubscription);

module.exports = router;
