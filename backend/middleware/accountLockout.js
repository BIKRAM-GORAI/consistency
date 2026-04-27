const User = require('../models/User');

/**
 * Account lockout configuration
 */
const MAX_LOGIN_ATTEMPTS = 5;
const LOCKOUT_TIME = 15 * 60 * 1000; // 15 minutes in milliseconds

/**
 * Check if an account is currently locked
 */
const isLocked = (user) => {
  return !!(user.lockUntil && user.lockUntil > Date.now());
};

/**
 * Increment failed login attempts and lock account if necessary
 */
const incrementFailedAttempts = async (user) => {
  // If already locked and lockout has expired, reset the counter
  if (user.lockUntil && user.lockUntil < Date.now()) {
    return await User.findByIdAndUpdate(user._id, {
      $set: {
        failedLoginAttempts: 1,
        lockUntil: null
      }
    });
  }

  const updates = {
    $inc: { failedLoginAttempts: 1 }
  };

  // Lock the account if max attempts reached
  if (user.failedLoginAttempts + 1 >= MAX_LOGIN_ATTEMPTS) {
    updates.$set = {
      lockUntil: Date.now() + LOCKOUT_TIME
    };
  }

  return await User.findByIdAndUpdate(user._id, updates);
};

/**
 * Reset failed login attempts on successful login
 */
const resetFailedAttempts = async (userId) => {
  return await User.findByIdAndUpdate(userId, {
    $set: {
      failedLoginAttempts: 0,
      lockUntil: null
    }
  });
};

/**
 * Middleware to check if account is locked before processing login
 */
const checkAccountLockout = async (req, res, next) => {
  try {
    const { email } = req.body;

    if (!email) {
      return next();
    }

    const user = await User.findOne({ email: email.toLowerCase().trim() });

    if (!user) {
      return next();
    }

    // Check if account is locked
    if (isLocked(user)) {
      const remainingTime = Math.ceil((user.lockUntil - Date.now()) / 1000 / 60); // in minutes
      return res.status(423).json({
        message: `Account is temporarily locked due to too many failed login attempts. Please try again in ${remainingTime} minutes.`,
        locked: true,
        remainingTime
      });
    }

    next();
  } catch (error) {
    console.error('Account lockout check error:', error);
    next();
  }
};

module.exports = {
  MAX_LOGIN_ATTEMPTS,
  LOCKOUT_TIME,
  isLocked,
  incrementFailedAttempts,
  resetFailedAttempts,
  checkAccountLockout
};