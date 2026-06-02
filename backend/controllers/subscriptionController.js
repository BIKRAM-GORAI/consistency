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

    // refund_pending = temporarily withheld while admin reviews the refund request
    const isRefundPending = user.subscriptionTier === 'refund_pending';


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

    const baseGrace = parseInt(process.env.FREE_MONTHLY_GRACE_LIMIT, 10) || 2;
    const premiumGrace = parseInt(process.env.PREMIUM_MONTHLY_GRACE_LIMIT, 10) || 6;

    let priceMonthly = parseInt(process.env.RAZORPAY_PRICE_1_MONTH, 10);
    let priceAnnual = parseInt(process.env.RAZORPAY_PRICE_1_YEAR, 10);
    if (isNaN(priceMonthly)) priceMonthly = 299;
    if (isNaN(priceAnnual)) priceAnnual = 1999;

    res.status(200).json({
      tier: user.subscriptionTier,
      expiresAt: user.subscriptionExpiresAt,
      isPremium,
      isRefundPending,
      refundStatus: user.refundStatus,
      hasPendingTransaction: !!user.pendingSubscriptionId,
      paymentHistory: user.paymentHistory || [],

      prices: {
        monthly: priceMonthly,
        annual: priceAnnual
      },
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
        leetcode: { base: baseLeetcode, premium: premiumLeetcode },
        grace: { base: baseGrace, premium: premiumGrace }
      }
    });
  } catch (error) {
    console.error('getSubscriptionStatus error:', error);
    res.status(500).json({ message: 'Error checking subscription status.' });
  }
};

/**
 * GET /api/subscriptions/my-limits
 * Returns all current per-user usage counters, limits, and reset times in one call.
 */
exports.getMyLimits = async (req, res) => {
  try {
    const userId = req.user.userId;
    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ message: 'User not found' });

    const now = new Date();
    const isPremium = user.subscriptionTier === 'premium' &&
      (!user.subscriptionExpiresAt || new Date(user.subscriptionExpiresAt) > now);

    // ── AI Daily Insights ──────────────────────────────────────
    const aiLimit = parseInt(process.env.AI_DAILY_LIMIT, 10) || 5;
    const aiPremiumBoost = parseInt(process.env.PREMIUM_ADDITIONAL_AI_LIMIT, 10) || 10;
    const aiTotal = isPremium ? aiLimit + aiPremiumBoost : aiLimit;
    // Auto-reset if day changed
    let aiCount = user.aiGenerationCount || 0;
    const aiLastReset = user.aiGenerationResetTime ? new Date(user.aiGenerationResetTime) : new Date(0);
    if (now.toDateString() !== aiLastReset.toDateString()) aiCount = 0;
    const aiLeft = Math.max(0, aiTotal - aiCount);

    // ── Handwriting / Photo Scan ───────────────────────────────
    const photoLimit = parseInt(process.env.AI_PHOTO_LIMIT, 10) || 3;
    const photoPremiumBoost = parseInt(process.env.PREMIUM_ADDITIONAL_PHOTO_LIMIT, 10) || 4;
    const photoTotal = isPremium ? photoLimit + photoPremiumBoost : photoLimit;
    let photoCount = user.aiPhotoExtractionCount || 0;
    const photoLastReset = user.aiPhotoExtractionResetTime ? new Date(user.aiPhotoExtractionResetTime) : new Date(0);
    if (now.toDateString() !== photoLastReset.toDateString()) photoCount = 0;
    const photoLeft = Math.max(0, photoTotal - photoCount);

    // ── Voice to Task ──────────────────────────────────────────
    const voiceLimit = isPremium
      ? (parseInt(process.env.PREMIUM_DAILY_VOICE_LIMIT, 10) || 5)
      : (parseInt(process.env.FREE_DAILY_VOICE_LIMIT, 10) || 2);
    let voiceCount = user.voiceParseCount || 0;
    const voiceLastReset = user.voiceParseResetTime ? new Date(user.voiceParseResetTime) : new Date(0);
    if (now.toDateString() !== voiceLastReset.toDateString()) voiceCount = 0;
    const voiceLeft = Math.max(0, voiceLimit - voiceCount);

    // ── Monthly Grace Days ─────────────────────────────────────
    const graceLimit = isPremium
      ? (parseInt(process.env.PREMIUM_MONTHLY_GRACE_LIMIT, 10) || 6)
      : (parseInt(process.env.FREE_MONTHLY_GRACE_LIMIT, 10) || 2);
    let graceCount = user.graceCount || 0;
    const graceLastReset = user.graceResetTime ? new Date(user.graceResetTime) : new Date(0);
    // Auto-reset if calendar month changed
    if (now.getMonth() !== graceLastReset.getMonth() || now.getFullYear() !== graceLastReset.getFullYear()) graceCount = 0;
    const graceLeft = Math.max(0, graceLimit - graceCount);

    // ── LeetCode Username Changes ──────────────────────────────
    const leetcodeLimit = isPremium
      ? (parseInt(process.env.MAX_USERNAME_CHANGES, 10) || 3) + (parseInt(process.env.PREMIUM_ADDITIONAL_LEETCODE_LIMIT, 10) || 3)
      : (parseInt(process.env.MAX_USERNAME_CHANGES, 10) || 3);
    const leetcodeUsed = user.leetcodeUsernameChangeCount || 0;
    const leetcodeLeft = Math.max(0, leetcodeLimit - leetcodeUsed);

    // ── Chat Media / Hour ──────────────────────────────────────
    const chatLimit = parseInt(process.env.CHAT_IMAGE_LIMIT, 10) || 20;
    const chatPremiumBoost = parseInt(process.env.PREMIUM_ADDITIONAL_CHAT_IMAGE_LIMIT, 10) || 10;
    const chatTotal = isPremium ? chatLimit + chatPremiumBoost : chatLimit;
    let chatCount = user.imageUploadCount || 0;
    const chatLastReset = user.mediaResetTime ? new Date(user.mediaResetTime) : new Date(0);
    // Chat resets hourly
    const chatResetHour = new Date(chatLastReset);
    chatResetHour.setMinutes(0, 0, 0);
    const nowHour = new Date(now);
    nowHour.setMinutes(0, 0, 0);
    if (nowHour > chatResetHour) chatCount = 0;
    const chatLeft = Math.max(0, chatTotal - chatCount);

    // Compute "resets at" labels
    const tomorrow = new Date(now);
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(0, 0, 0, 0);

    const nextHour = new Date(now);
    nextHour.setHours(nextHour.getHours() + 1, 0, 0, 0);

    const nextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1, 0, 0, 0, 0);

    // Compute free and premium configs for the guide to load dynamically
    const voiceLimitFree = parseInt(process.env.FREE_DAILY_VOICE_LIMIT, 10) || 2;
    const voiceLimitPremium = parseInt(process.env.PREMIUM_DAILY_VOICE_LIMIT, 10) || 5;

    const graceLimitFree = parseInt(process.env.FREE_MONTHLY_GRACE_LIMIT, 10) || 2;
    const graceLimitPremium = parseInt(process.env.PREMIUM_MONTHLY_GRACE_LIMIT, 10) || 6;

    const leetcodeLimitFree = parseInt(process.env.MAX_USERNAME_CHANGES, 10) || 3;
    const leetcodeLimitPremium = leetcodeLimitFree + (parseInt(process.env.PREMIUM_ADDITIONAL_LEETCODE_LIMIT, 10) || 3);

    res.status(200).json({
      isPremium,
      tier: user.subscriptionTier,
      limits: {
        aiInsights:   { used: aiCount,      total: aiTotal,     left: aiLeft,       resetsAt: tomorrow.toISOString(),   resetPeriod: 'daily' },
        photoScan:    { used: photoCount,   total: photoTotal,  left: photoLeft,    resetsAt: tomorrow.toISOString(),   resetPeriod: 'daily' },
        voiceToTask:  { used: voiceCount,   total: voiceLimit,  left: voiceLeft,    resetsAt: tomorrow.toISOString(),   resetPeriod: 'daily' },
        graceDays:    { used: graceCount,   total: graceLimit,  left: graceLeft,    resetsAt: nextMonth.toISOString(),  resetPeriod: 'monthly' },
        leetcode:     { used: leetcodeUsed, total: leetcodeLimit, left: leetcodeLeft, resetsAt: null,                   resetPeriod: 'permanent' },
        chatMedia:    { used: chatCount,    total: chatTotal,   left: chatLeft,     resetsAt: nextHour.toISOString(),   resetPeriod: 'hourly' },
      },
      config: {
        aiDailyLimitFree: aiLimit,
        aiDailyLimitPremium: aiLimit + aiPremiumBoost,
        
        photoScanLimitFree: photoLimit,
        photoScanLimitPremium: photoLimit + photoPremiumBoost,
        
        voiceToTaskLimitFree: voiceLimitFree,
        voiceToTaskLimitPremium: voiceLimitPremium,
        
        graceDaysLimitFree: graceLimitFree,
        graceDaysLimitPremium: graceLimitPremium,
        
        leetcodeLimitFree: leetcodeLimitFree,
        leetcodeLimitPremium: leetcodeLimitPremium,
        
        chatMediaLimitFree: chatLimit,
        chatMediaLimitPremium: chatLimit + chatPremiumBoost
      }
    });
  } catch (error) {
    console.error('getMyLimits error:', error);
    res.status(500).json({ message: 'Error fetching user limits.' });
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
    user.premiumActivatedAt = new Date();
    user.refundStatus = 'none';

    // Push the transaction into the user's paymentHistory
    let price = duration === '1_month'
      ? parseInt(process.env.RAZORPAY_PRICE_1_MONTH, 10)
      : parseInt(process.env.RAZORPAY_PRICE_1_YEAR, 10);
    if (isNaN(price)) price = duration === '1_month' ? 299 : 1999;
    
    user.paymentHistory.push({
      orderId: razorpay_order_id,
      paymentId: razorpay_payment_id,
      amount: price,
      duration: duration,
      purchasedAt: new Date(),
      refundStatus: 'none'
    });

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
      user.premiumActivatedAt = new Date();
      user.refundStatus = 'none';

      let price = duration === '1_month'
        ? parseInt(process.env.RAZORPAY_PRICE_1_MONTH, 10)
        : parseInt(process.env.RAZORPAY_PRICE_1_YEAR, 10);
      if (isNaN(price)) price = duration === '1_month' ? 299 : 1999;
      
      user.paymentHistory.push({
        orderId: orderId,
        paymentId: successfulPayment.id,
        amount: price,
        duration: duration,
        purchasedAt: new Date(),
        refundStatus: 'none'
      });
      
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

/**
 * POST /api/subscriptions/razorpay/verify-dev-password
 * Verifies a developer password given in the environment variable.
 */
exports.verifyDevPassword = async (req, res) => {
  try {
    const { password } = req.body;
    const devPassword = process.env.DEV_SUBSCRIPTION_PASSWORD;

    if (!devPassword) {
      console.error('DEV_SUBSCRIPTION_PASSWORD is missing in .env Configuration');
      return res.status(500).json({ message: 'Developer subscription access password not configured.' });
    }

    if (password === devPassword) {
      return res.status(200).json({ success: true });
    } else {
      return res.status(401).json({ success: false, message: 'Invalid developer password.' });
    }
  } catch (error) {
    console.error('verifyDevPassword error:', error.message);
    res.status(500).json({ message: 'Internal Server Error verifying password.' });
  }
};

/**
 * POST /api/subscriptions/razorpay/request-refund
 * Authenticates user, checks 48-hour window for target transaction ID, and marks refund as requested.
 */
exports.requestRefund = async (req, res) => {
  try {
    const userId = req.user.userId;
    const { paymentId, reason } = req.body;

    if (!paymentId) {
      return res.status(400).json({ message: 'Payment ID is required.' });
    }

    if (!reason || reason.trim().length < 50) {
      return res.status(400).json({ message: 'A descriptive refund reason of at least 50 characters is required.' });
    }

    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ message: 'User not found.' });

    // Find the target payment inside paymentHistory
    const payment = user.paymentHistory.find(p => p.paymentId === paymentId);
    if (!payment) {
      return res.status(404).json({ message: 'Subscription transaction not found in your purchase history.' });
    }

    if (payment.refundStatus !== 'none') {
      return res.status(400).json({ message: `Refund has already been ${payment.refundStatus} for this transaction.` });
    }

    // Verify 48-hour window limit
    const purchaseTime = new Date(payment.purchasedAt).getTime();
    const elapsed = Date.now() - purchaseTime;
    const fortyEightHoursMs = 48 * 60 * 60 * 1000;

    if (elapsed > fortyEightHoursMs) {
      return res.status(400).json({ message: 'Refund window expired. Requests must be made within 48 hours of purchase.' });
    }

    // Check if any other non-refunded, still-active payment covers premium
    const durationDays = { '1_month': 30, '1_year': 365 };
    const now = new Date();
    const otherActiveCoverage = user.paymentHistory.some(p => {
      if (p.paymentId === paymentId) return false; // skip the one being refunded
      if (p.refundStatus !== 'none') return false;  // skip refunded/requested ones
      const days = durationDays[p.duration] || 30;
      const expiry = new Date(p.purchasedAt);
      expiry.setDate(expiry.getDate() + days);
      return expiry > now; // still covers now
    });

    // Update statuses — also withhold premium unless other active coverage covers user
    payment.refundStatus = 'requested';
    payment.refundReason = reason.trim();
    user.refundStatus = 'requested';
    user.refundRequestedAt = now;
    user.refundReason = reason.trim();
    user.subscriptionTier = otherActiveCoverage ? 'premium' : 'refund_pending';
    await user.save();


    // Compile utilization info for owner email
    const usageLogs = user.premiumUsageLogs.filter(log => log.razorpayPaymentId === paymentId);
    let usageHTML = '';
    if (usageLogs.length === 0) {
      usageHTML = '<p style="color: green; font-weight: bold;">🟢 Zero premium features utilized so far (Clean Request).</p>';
    } else {
      usageHTML = `
        <p style="color: red; font-weight: bold;">⚠️ Warning: Features utilized since purchase:</p>
        <ul>
          ${usageLogs.map(log => `<li>[${new Date(log.timestamp).toLocaleString()}] <b>${log.actionType}</b>: ${log.details}</li>`).join('')}
        </ul>
      `;
    }

    // Send SMTP Nodemailer alert to owner
    const ownerEmail = process.env.OWNER_EMAIL || process.env.GMAIL_EMAIL;
    if (ownerEmail) {
      const { sendEmail } = require('../utils/email');
      try {
        await sendEmail({
          to: ownerEmail,
          subject: `🚨 New Refund Request from @${user.username}`,
          html: `
            <div style="font-family: Arial, sans-serif; line-height: 1.6; max-width: 600px; border: 3px solid #111; padding: 20px; border-radius: 8px;">
              <h2 style="text-transform: uppercase; border-bottom: 2px solid #111; padding-bottom: 10px; color: #d97706;">Refund Request Alert</h2>
              <p>A new subscription refund request has been initiated by a customer.</p>
              <table style="width: 100%; border-collapse: collapse; margin-top: 15px;">
                <tr><td style="padding: 6px 0; font-weight: bold;">User:</td><td>${user.name} (@${user.username})</td></tr>
                <tr><td style="padding: 6px 0; font-weight: bold;">Email:</td><td>${user.email}</td></tr>
                <tr><td style="padding: 6px 0; font-weight: bold;">Order ID:</td><td>${payment.orderId}</td></tr>
                <tr><td style="padding: 6px 0; font-weight: bold;">Payment ID:</td><td>${paymentId}</td></tr>
                <tr><td style="padding: 6px 0; font-weight: bold;">Plan:</td><td>${payment.duration === '1_month' ? 'Monthly Pass' : 'Annual Pass'} (₹${payment.amount})</td></tr>
                <tr><td style="padding: 6px 0; font-weight: bold;">Purchased At:</td><td>${new Date(payment.purchasedAt).toLocaleString()}</td></tr>
                <tr><td style="padding: 6px 0; font-weight: bold;">Requested At:</td><td>${new Date().toLocaleString()}</td></tr>
              </table>
              <div style="margin-top: 20px; padding: 15px; background: #fffbeb; border: 2px solid #f59e0b; border-radius: 8px;">
                <p style="margin: 0 0 8px 0; font-weight: bold; color: #b45309; text-transform: uppercase; font-size: 12px;">Reason Provided by User:</p>
                <p style="margin: 0; font-style: italic; color: #1f2937;">"${reason.trim()}"</p>
              </div>
              <div style="margin-top: 20px; padding: 12px; background: #f3f4f6; border-radius: 6px; border: 2px dashed #9ca3af;">
                ${usageHTML}
              </div>
              <p style="margin-top: 25px; text-align: center;">
                <a href="${process.env.APP_URL || 'http://localhost:5001'}/admin-dashboard.html?tab=refunds" 
                   style="background: #111; color: #fff; padding: 10px 20px; text-decoration: none; font-weight: bold; border-radius: 4px; display: inline-block;">
                   Open Refunds Manager Tab
                </a>
              </p>
            </div>
          `
        });
      } catch (emailErr) {
        console.error('Failed to send refund notification email to owner:', emailErr);
      }
    }

    res.status(200).json({
      success: true,
      message: 'Refund request submitted successfully! Your request is pending admin review.'
    });

  } catch (error) {
    console.error('requestRefund error:', error);
    res.status(500).json({ message: 'Internal Server Error submitting refund request.' });
  }
};
