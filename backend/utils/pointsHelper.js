const mongoose = require('mongoose');
const User = require('../models/User');
const Referral = require('../models/Referral');
const PointsLedger = require('../models/PointsLedger');

/**
 * Generates a unique referral code for a user.
 */
async function generateUniqueReferralCode() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let isUnique = false;
  let code = '';
  while (!isUnique) {
    code = 'CONS-';
    for (let i = 0; i < 6; i++) {
      code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    const existing = await User.findOne({ referralCode: code });
    if (!existing) {
      isUnique = true;
    }
  }
  return code;
}

/**
 * Claims a referral code for a newly registered or logged in user.
 * Grants a 200 CP signup bonus immediately to the referred user.
 */
async function claimReferralCode(user, code) {
  const normalizedCode = code.trim().toUpperCase();

  if (user.referredBy) {
    throw new Error('You have already applied a referral code');
  }

  const referrer = await User.findOne({ referralCode: normalizedCode });
  if (!referrer) {
    throw new Error('Invalid referral code');
  }

  if (referrer._id.toString() === user._id.toString()) {
    throw new Error('You cannot use your own referral code');
  }

  // Set the referredBy relationship
  user.referredBy = referrer._id;
  user.pointsBalance = (user.pointsBalance || 0) + 200;
  await user.save();

  // Create a pending Referral record
  const referral = new Referral({
    referrerId: referrer._id,
    referredId: user._id,
    referralCode: normalizedCode,
    streakReached: false,
    rewardReleased: false
  });
  await referral.save();

  // Log referred user's welcome bonus in the Points Ledger
  await PointsLedger.create({
    userId: user._id,
    points: 200,
    type: 'signup_bonus',
    description: `Welcome bonus for entering referral code ${normalizedCode}`,
    referenceId: referral._id
  });

  // Also check if the referred user's highestStreak is already >= 5 (unlikely but possible if they checked in before claiming)
  if (user.highestStreak >= 5) {
    await checkAndAwardReferralStreak(user._id, user.highestStreak);
  }

  return { referrerName: referrer.name };
}

/**
 * Checks if a user has hit the 5-day streak milestone and awards 1000 CP to their referrer.
 */
async function checkAndAwardReferralStreak(userId, highestStreak) {
  if (highestStreak < 5) return;

  // Find a referral record that exists for this referred user and hasn't been rewarded yet
  const referral = await Referral.findOne({ referredId: userId, rewardReleased: false });
  if (!referral) return;

  // Mark the reward as released
  referral.streakReached = true;
  referral.rewardReleased = true;
  await referral.save();

  // Credit the referrer
  const referrer = await User.findById(referral.referrerId);
  if (referrer) {
    referrer.pointsBalance = (referrer.pointsBalance || 0) + 1000;
    await referrer.save();

    // Log the referrer reward in the Points Ledger
    await PointsLedger.create({
      userId: referrer._id,
      points: 1000,
      type: 'referral_reward',
      description: `Referral bonus for referring user who reached a 5-day streak`,
      referenceId: referral._id
    });
    console.log(`[Referral Reward] Credited 1000 CP to referrer ${referrer.email} for user ${userId}`);
  }
}

module.exports = {
  generateUniqueReferralCode,
  claimReferralCode,
  checkAndAwardReferralStreak
};
