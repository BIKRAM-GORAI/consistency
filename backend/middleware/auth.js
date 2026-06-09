const jwt = require('jsonwebtoken');
const User = require('../models/User');
const Group = require('../models/Group');

/**
 * JWT Authentication Middleware
 * Verifies JWT token from Authorization header and attaches user info to request
 */
const authenticateToken = async (req, res, next) => {
  try {
    // Get token from Authorization header
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN

    if (!token) {
      return res.status(401).json({ message: 'Access denied. No token provided.' });
    }

    // Verify token
    const jwtSecret = process.env.JWT_SECRET;
    if (!jwtSecret) {
      console.error('CRITICAL: JWT_SECRET is missing in .env');
      return res.status(500).json({ message: 'Server configuration error' });
    }
    const decoded = jwt.verify(token, jwtSecret);

    // Fetch user and check if blacklisted
    const user = await User.findById(decoded.userId).select('isBlacklisted blacklistedUntil blacklistReason');
    if (user && user.isBlacklisted) {
      if (!user.blacklistedUntil || new Date(user.blacklistedUntil) > new Date()) {
        const reasonStr = user.blacklistReason ? ` Reason: ${user.blacklistReason}` : '';
        const expiryStr = user.blacklistedUntil ? ` until ${new Date(user.blacklistedUntil).toLocaleDateString()}` : ' permanently';
        return res.status(403).json({ message: `Your account is blacklisted${expiryStr}.${reasonStr}`, isBlacklisted: true, blacklistReason: user.blacklistReason });
      } else {
        // Blacklist expired, unblacklist the user
        user.isBlacklisted = false;
        await user.save();
        await Group.updateOwnerBlacklistStatus(user._id, false);
      }
    }

    // Attach user info to request object
    req.user = decoded;
    next();
  } catch (error) {
    if (error.name === 'JsonWebTokenError') {
      return res.status(401).json({ message: 'Invalid token.' });
    }
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({ message: 'Token expired.' });
    }
    return res.status(500).json({ message: 'Server error', error: error.message });
  }
};

/**
 * Optional JWT Authentication Middleware
 * Tries to verify JWT token but doesn't block if missing or invalid.
 * Attaches user info to request if token is valid.
 */
const authenticateTokenOptional = (req, res, next) => {
  try {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (token) {
      const jwtSecret = process.env.JWT_SECRET;
      if (jwtSecret) {
        const decoded = jwt.verify(token, jwtSecret);
        req.user = decoded;
      }
    }
    next();
  } catch (error) {
    // Just proceed without req.user if token is invalid
    next();
  }
};

/**
 * Generate JWT Token
 * Creates a JWT token for authenticated users
 */
const generateToken = (userId, email) => {
  const jwtSecret = process.env.JWT_SECRET;
  const jwtExpiry = process.env.JWT_EXPIRY || '7d'; 

  if (!jwtSecret) {
    throw new Error('JWT_SECRET is missing in environment variables');
  }

  return jwt.sign(
    {
      userId,
      email
    },
    jwtSecret,
    { expiresIn: jwtExpiry }
  );
};

module.exports = {
  authenticateToken,
  authenticateTokenOptional,
  generateToken
};