const User = require('../models/User');
const Coupon = require('../models/Coupon');
const axios = require('axios');
const crypto = require('crypto');

/**
 * GET /api/subscriptions/status
 * Retrieves the current user's subscription details and absolute limits.
 */
exports.getSubscriptionStatus = async (req, res) => {
  try {
    const userId = req.user.userId;
    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ message: 'User not found' });

    const now = new Date();
    const isPremium = user.subscriptionTier === 'premium' && 
      (!user.subscriptionExpiresAt || new Date(user.subscriptionExpiresAt) > now);

    // Calculate actual limits dynamically for UI display
    let aiLimit = parseInt(process.env.AI_DAILY_LIMIT, 10) || 15;
    let photoLimit = parseInt(process.env.AI_PHOTO_LIMIT, 10) || 15;
    let chatImageLimit = parseInt(process.env.CHAT_IMAGE_LIMIT, 10) || 20;
    let templateLimit = 5;
    let leetcodeLimit = parseInt(process.env.MAX_USERNAME_CHANGES, 10) || 3;

    if (isPremium) {
      aiLimit += parseInt(process.env.PREMIUM_ADDITIONAL_AI_LIMIT, 10) || 10;
      photoLimit += parseInt(process.env.PREMIUM_ADDITIONAL_PHOTO_LIMIT, 10) || 10;
      chatImageLimit += parseInt(process.env.PREMIUM_ADDITIONAL_CHAT_IMAGE_LIMIT, 10) || 10;
      templateLimit += parseInt(process.env.PREMIUM_ADDITIONAL_TEMPLATE_LIMIT, 10) || 10;
      leetcodeLimit += parseInt(process.env.PREMIUM_ADDITIONAL_LEETCODE_LIMIT, 10) || 3;
    }

    const baseAi = parseInt(process.env.AI_DAILY_LIMIT, 10) || 15;
    const premiumAi = baseAi + (parseInt(process.env.PREMIUM_ADDITIONAL_AI_LIMIT, 10) || 10);

    const basePhoto = parseInt(process.env.AI_PHOTO_LIMIT, 10) || 15;
    const premiumPhoto = basePhoto + (parseInt(process.env.PREMIUM_ADDITIONAL_PHOTO_LIMIT, 10) || 10);

    const baseChat = parseInt(process.env.CHAT_IMAGE_LIMIT, 10) || 20;
    const premiumChat = baseChat + (parseInt(process.env.PREMIUM_ADDITIONAL_CHAT_IMAGE_LIMIT, 10) || 10);

    const baseTemplate = 5;
    const premiumTemplate = baseTemplate + (parseInt(process.env.PREMIUM_ADDITIONAL_TEMPLATE_LIMIT, 10) || 10);

    const baseLeetcode = parseInt(process.env.MAX_USERNAME_CHANGES, 10) || 3;
    const premiumLeetcode = baseLeetcode + (parseInt(process.env.PREMIUM_ADDITIONAL_LEETCODE_LIMIT, 10) || 3);

    res.status(200).json({
      tier: user.subscriptionTier,
      expiresAt: user.subscriptionExpiresAt,
      isPremium,
      hasPendingTransaction: !!user.pendingSubscriptionId,
      limits: {
        aiLimit,
        photoLimit,
        chatImageLimit,
        templateLimit,
        leetcodeLimit
      },
      limitsComparison: {
        ai: { base: baseAi, premium: premiumAi },
        photo: { base: basePhoto, premium: premiumPhoto },
        chat: { base: baseChat, premium: premiumChat },
        template: { base: baseTemplate, premium: premiumTemplate },
        leetcode: { base: baseLeetcode, premium: premiumLeetcode }
      }
    });
  } catch (error) {
    console.error('getSubscriptionStatus error:', error);
    res.status(500).json({ message: 'Error checking subscription status.' });
  }
};

/**
 * POST /api/subscriptions/apply-coupon
 * Redeems a one-time admin-generated promo coupon code to unlock premium.
 */
exports.applyCoupon = async (req, res) => {
  try {
    const userId = req.user.userId;
    const { code } = req.body;

    if (!code) {
      return res.status(400).json({ message: 'Coupon code is required.' });
    }

    const coupon = await Coupon.findOne({ code: code.toUpperCase().trim() });
    if (!coupon) {
      return res.status(404).json({ message: 'Invalid coupon code.' });
    }

    if (coupon.isUsed) {
      return res.status(400).json({ message: 'This coupon has already been redeemed.' });
    }

    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ message: 'User not found.' });

    const now = new Date();
    let currentExpiry = user.subscriptionExpiresAt && new Date(user.subscriptionExpiresAt) > now
      ? new Date(user.subscriptionExpiresAt)
      : now;

    // Add duration to expiration
    if (coupon.duration === '1_month') {
      currentExpiry.setDate(currentExpiry.getDate() + 30);
    } else if (coupon.duration === '1_year') {
      currentExpiry.setDate(currentExpiry.getDate() + 365);
    }

    // Update user subscription
    user.subscriptionTier = 'premium';
    user.subscriptionExpiresAt = currentExpiry;
    await user.save();

    // Mark coupon as consumed
    coupon.isUsed = true;
    coupon.usedBy = userId;
    coupon.usedAt = now;
    await coupon.save();

    res.status(200).json({
      success: true,
      message: `Coupon successfully redeemed! Premium unlocked until ${currentExpiry.toLocaleDateString()}`,
      tier: 'premium',
      expiresAt: currentExpiry
    });
  } catch (error) {
    console.error('applyCoupon error:', error);
    res.status(500).json({ message: 'Error applying coupon.' });
  }
};

/**
 * POST /api/subscriptions/razorpay/create-order
 * Calls the Razorpay API directly using standard axios basic authentication.
 */
exports.createRazorpayOrder = async (req, res) => {
  try {
    const { duration } = req.body; // '1_month' or '1_year'
    if (!duration || !['1_month', '1_year'].includes(duration)) {
      return res.status(400).json({ message: 'Valid duration parameter is required.' });
    }

    const keyId = process.env.RAZORPAY_KEY_ID;
    const keySecret = process.env.RAZORPAY_KEY_SECRET;

    if (!keyId || !keySecret) {
      console.error('Razorpay keys missing from .env Configuration');
      return res.status(500).json({ message: 'Payment gateway configuration error.' });
    }

    // Get pricing from ENV
    let price = duration === '1_month'
      ? parseInt(process.env.RAZORPAY_PRICE_1_MONTH, 10)
      : parseInt(process.env.RAZORPAY_PRICE_1_YEAR, 10);

    if (isNaN(price)) {
      price = duration === '1_month' ? 299 : 1999;
    }

    const orderPayload = {
      amount: price * 100, // Razorpay expects amount in paise
      currency: 'INR',
      receipt: `receipt_sub_${Date.now()}`,
      payment_capture: 1
    };

    console.log(`[Razorpay] Creating order for duration: ${duration}, amount: ${orderPayload.amount} paise`);

    // Call Razorpay API directly
    const authHeader = Buffer.from(`${keyId}:${keySecret}`).toString('base64');
    const response = await axios.post(
      'https://api.razorpay.com/v1/orders',
      orderPayload,
      {
        headers: {
          'Authorization': `Basic ${authHeader}`,
          'Content-Type': 'application/json'
        }
      }
    );

    // Save pending details to the user schema for recovery if user refreshes
    const userId = req.user.userId;
    await User.findByIdAndUpdate(userId, {
      pendingSubscriptionId: response.data.id,
      pendingSubscriptionDuration: duration
    });

    res.status(200).json({
      success: true,
      keyId,
      orderId: response.data.id,
      amount: response.data.amount,
      currency: response.data.currency,
      duration
    });

  } catch (error) {
    console.error('createRazorpayOrder error:', error.message);
    if (error.response) {
      console.error('Razorpay Error Response:', error.response.data);
      return res.status(502).json({
        message: 'Payment Gateway Error',
        details: error.response.data.error || error.response.data
      });
    }
    res.status(500).json({ message: 'Internal Server Error starting payment process.' });
  }
};

/**
 * POST /api/subscriptions/razorpay/verify-payment
 * Cryptographically verifies Razorpay signatures and updates User Premium status.
 */
exports.verifyRazorpayPayment = async (req, res) => {
  try {
    const userId = req.user.userId;
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature, duration } = req.body;

    if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature || !duration) {
      return res.status(400).json({ message: 'Missing transaction details.' });
    }

    const keySecret = process.env.RAZORPAY_KEY_SECRET;
    if (!keySecret) {
      return res.status(500).json({ message: 'Payment gateway configuration error.' });
    }

    // Cryptographic signature check (HMAC SHA-256)
    const signPayload = `${razorpay_order_id}|${razorpay_payment_id}`;
    const expectedSignature = crypto
      .createHmac('sha256', keySecret)
      .update(signPayload)
      .digest('hex');

    if (expectedSignature !== razorpay_signature) {
      const user = await User.findById(userId);
      console.error(`
============================================================
❌ [Razorpay Error] SIGNATURE VERIFICATION FAILED!
============================================================
👤 User ID:       ${userId}
👤 Username:      ${user ? user.username : 'Unknown'}
📦 Order ID:      ${razorpay_order_id}
💳 Payment ID:    ${razorpay_payment_id}
⚠️ Signature Recv: ${razorpay_signature}
⚠️ Signature Exp:  ${expectedSignature}
⚠️ Status:        Bypass Attempt Blocked / Malformed Data
============================================================
      `);
      return res.status(400).json({ message: 'Payment verification failed: Signature mismatch.' });
    }

    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ message: 'User not found.' });

    const now = new Date();
    let currentExpiry = user.subscriptionExpiresAt && new Date(user.subscriptionExpiresAt) > now
      ? new Date(user.subscriptionExpiresAt)
      : now;

    if (duration === '1_month') {
      currentExpiry.setDate(currentExpiry.getDate() + 30);
    } else if (duration === '1_year') {
      currentExpiry.setDate(currentExpiry.getDate() + 365);
    }

    // Clear pending transaction tags upon successful manual verification callback
    user.subscriptionTier = 'premium';
    user.subscriptionExpiresAt = currentExpiry;
    user.subscriptionId = razorpay_order_id;
    user.razorpayPaymentId = razorpay_payment_id;
    user.pendingSubscriptionId = null;
    user.pendingSubscriptionDuration = null;
    await user.save();

    console.log(`
============================================================
🚀 [Razorpay Success] PREMIUM SUBSCRIPTION ACTIVATED / EXTENDED!
============================================================
👤 User ID:       ${userId}
👤 Username:      ${user.username}
👤 Email:         ${user.email}
📦 Order ID:      ${razorpay_order_id}
💳 Payment ID:    ${razorpay_payment_id}
📅 Plan Duration: ${duration === '1_month' ? '30 Days (Monthly Pass)' : '365 Days (Annual Pass)'}
⏳ New Expiry:    ${currentExpiry.toISOString()} (${currentExpiry.toLocaleDateString()})
👑 Status:        Premium Active
============================================================
    `);

    res.status(200).json({
      success: true,
      message: `Payment successful! Premium unlocked until ${currentExpiry.toLocaleDateString()}`,
      tier: 'premium',
      expiresAt: currentExpiry
    });

  } catch (error) {
    console.error('verifyRazorpayPayment error:', error);
    res.status(500).json({ message: 'Internal Server Error verifying transaction.' });
  }
};

/**
 * POST /api/subscriptions/razorpay/check-pending
 * Checks if the user has a pending subscription order, queries Razorpay for payment status,
 * and activates premium if a successful payment is found!
 */
exports.checkPendingSubscription = async (req, res) => {
  try {
    const userId = req.user.userId;
    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ message: 'User not found.' });

    const orderId = user.pendingSubscriptionId;
    const duration = user.pendingSubscriptionDuration;

    if (!orderId) {
      return res.status(200).json({
        success: false,
        message: 'No pending transactions found.'
      });
    }

    const keyId = process.env.RAZORPAY_KEY_ID;
    const keySecret = process.env.RAZORPAY_KEY_SECRET;

    if (!keyId || !keySecret) {
      return res.status(500).json({ message: 'Payment gateway configuration error.' });
    }

    console.log(`[Razorpay Recovery] Checking status of pending order: ${orderId} for user: ${user.username}`);

    const authHeader = Buffer.from(`${keyId}:${keySecret}`).toString('base64');
    const response = await axios.get(
      `https://api.razorpay.com/v1/orders/${orderId}/payments`,
      {
        headers: {
          'Authorization': `Basic ${authHeader}`
        }
      }
    );

    const payments = response.data.items || [];
    
    // Find if any payment was successful ('captured')
    const successfulPayment = payments.find(p => p.status === 'captured');

    if (successfulPayment) {
      const now = new Date();
      let currentExpiry = user.subscriptionExpiresAt && new Date(user.subscriptionExpiresAt) > now
        ? new Date(user.subscriptionExpiresAt)
        : now;

      const extendedDays = duration === '1_month' ? 30 : 365;
      currentExpiry.setDate(currentExpiry.getDate() + extendedDays);

      user.subscriptionTier = 'premium';
      user.subscriptionExpiresAt = currentExpiry;
      user.subscriptionId = orderId;
      user.razorpayPaymentId = successfulPayment.id;
      
      // Clear pending fields once reconciled
      user.pendingSubscriptionId = null;
      user.pendingSubscriptionDuration = null;
      await user.save();

      console.log(`
================================================================================
🚀 [Razorpay Success] PENDING TRANSACTION RECONCILED SUCCESSFULLY!
================================================================================
👤 User ID:             ${userId}
👤 Username:            ${user.username}
👤 Email:               ${user.email}
📦 Order ID:            ${orderId}
💳 Payment ID:          ${successfulPayment.id}
📅 Plan Purchased:      ${duration === '1_month' ? 'Monthly Pass' : 'Annual Pass'}
⏳ Extension Days:      +${extendedDays} Days
📅 Previous Expiry:     ${user.subscriptionExpiresAt ? new Date(user.subscriptionExpiresAt - (extendedDays * 24 * 60 * 60 * 1000)).toLocaleDateString() : 'N/A (Free User)'}
⏳ New Total Expiry:    ${currentExpiry.toISOString()} (${currentExpiry.toLocaleDateString()})
👑 Status:              Premium Active & Extended Successfully
================================================================================
      `);

      return res.status(200).json({
        success: true,
        message: `Your payment was verified and processed! Premium unlocked until ${currentExpiry.toLocaleDateString()}`,
        tier: 'premium',
        expiresAt: currentExpiry
      });
    }

    // Check if there was a failed payment attempt
    const failedPayment = payments.find(p => p.status === 'failed');

    if (failedPayment) {
      console.error(`
================================================================================
❌ [Razorpay Failure] TRANSACTION FAILED ON PAYMENT GATEWAY!
================================================================================
👤 User ID:             ${userId}
👤 Username:            ${user.username}
👤 Email:               ${user.email}
📦 Order ID:            ${orderId}
💳 Failed Payment ID:   ${failedPayment.id}
📅 Planned Duration:   ${duration === '1_month' ? '30 Days (Monthly Pass)' : '365 Days (Annual Pass)'}
❌ Gateway Error Code:  ${failedPayment.error_code || 'N/A'}
❌ Error Description:   ${failedPayment.error_description || 'N/A'}
❌ Error Source:        ${failedPayment.error_source || 'N/A'}
❌ Error Step:          ${failedPayment.error_step || 'N/A'}
❌ Error Reason:        ${failedPayment.error_reason || 'N/A'}
⚠️ Status:              Transaction failed on client refresh or bank decline
================================================================================
      `);

      // We do not clear the user's pending subscription so they can retry payment or we can check again if they pay later on.
      return res.status(200).json({
        success: false,
        message: `Your payment attempts failed on the payment gateway: ${failedPayment.error_description || 'Declined'}.`
      });
    }

    // If there are no payment attempts at all
    if (payments.length === 0) {
      console.log(`
================================================================================
🔍 [Razorpay Status] NO PAYMENT ATTEMPTS MADE YET
================================================================================
👤 User ID:             ${userId}
👤 Username:            ${user.username}
👤 Email:               ${user.email}
📦 Order ID:            ${orderId}
📅 Duration:            ${duration}
⚠️ Status:              The checkout overlay was opened but closed/refreshed without payment
================================================================================
      `);

      return res.status(200).json({
        success: false,
        message: 'No payment attempts have been recorded for this order yet.'
      });
    }

    // If payments exist but in other states (e.g. authorized, created, etc.)
    console.log(`
================================================================================
🔍 [Razorpay Status] TRANSACTION PENDING / INCOMPLETE STATE
================================================================================
👤 User ID:             ${userId}
👤 Username:            ${user.username}
📦 Order ID:            ${orderId}
📅 Duration:            ${duration}
⚠️ Payment Attempts:    ${payments.map(p => `${p.id} (${p.status})`).join(', ')}
⚠️ Status:              Payments exist but none are captured/failed yet.
================================================================================
    `);

    res.status(200).json({
      success: false,
      message: 'Your payment is still processing or has not been captured yet.'
    });

  } catch (error) {
    console.error('checkPendingSubscription error:', error.message);
    res.status(500).json({ message: 'Internal Server Error checking pending transaction status.' });
  }
};
