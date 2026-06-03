const express = require('express');
const router = express.Router();
const subscriptionController = require('../controllers/subscriptionController');
const { authenticateToken } = require('../middleware/auth');

// Protected User Subscription Details
router.get('/status', authenticateToken, subscriptionController.getSubscriptionStatus);
router.get('/my-limits', authenticateToken, subscriptionController.getMyLimits);
router.post('/apply-coupon', authenticateToken, subscriptionController.applyCoupon);

// Razorpay Payment Actions
router.post('/razorpay/create-order', authenticateToken, subscriptionController.createRazorpayOrder);
router.post('/razorpay/verify-payment', authenticateToken, subscriptionController.verifyRazorpayPayment);
router.post('/razorpay/check-pending', authenticateToken, subscriptionController.checkPendingSubscription);
router.post('/razorpay/verify-dev-password', authenticateToken, subscriptionController.verifyDevPassword);
router.post('/razorpay/request-refund', authenticateToken, subscriptionController.requestRefund);

// Referral & Points System Routes
router.post('/claim-referral', authenticateToken, subscriptionController.claimReferral);
router.post('/skip-referral', authenticateToken, subscriptionController.skipReferral);
router.post('/redeem-points', authenticateToken, subscriptionController.redeemPoints);
router.get('/points-history', authenticateToken, subscriptionController.getPointsHistory);
router.get('/my-coupons', authenticateToken, subscriptionController.getMyCoupons);

module.exports = router;
