const User = require('../models/User');

/**
 * Middleware to restrict writes/mutations for unverified users after their grace period expires.
 */
const checkEmailVerified = async (req, res, next) => {
  try {
    const user = await User.findById(req.user.userId);
    if (!user) return res.status(404).json({ message: 'User not found' });

    if (user.isEmailVerified) {
      return next();
    }

    // Email is unverified. Check if grace period has expired.
    const graceDays = parseInt(process.env.EMAIL_VERIFICATION_GRACE_DAYS, 10) || 2;
    
    // Feature deployment date: default to June 11, 2026 (today)
    const deploymentDateStr = process.env.EMAIL_VERIFICATION_FEATURE_DEPLOYMENT_DATE || '2026-06-11';
    const deploymentDate = new Date(deploymentDateStr);

    // Grace period starts from the MAX of user creation date and the feature deployment date.
    // This implements Option C: existing users get a full grace period starting from deployment.
    const userCreatedAt = user.createdAt || new Date();
    const graceStartTime = userCreatedAt > deploymentDate ? userCreatedAt : deploymentDate;
    
    const expiryTime = new Date(graceStartTime.getTime() + graceDays * 24 * 60 * 60 * 1000);

    if (new Date() > expiryTime) {
      return res.status(403).json({
        message: 'Email verification required. Your grace period has expired. Please verify your email in settings.',
        isEmailUnverified: true
      });
    }

    next();
  } catch (error) {
    console.error('Error in checkEmailVerified middleware:', error);
    res.status(500).json({ message: 'Server error checking email verification status', error: error.message });
  }
};

module.exports = {
  checkEmailVerified
};
