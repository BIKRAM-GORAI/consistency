const jwt = require('jsonwebtoken');

/**
 * JWT Authentication Middleware
 * Verifies JWT token from Authorization header and attaches user info to request
 */
const authenticateToken = (req, res, next) => {
  try {
    // Get token from Authorization header
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN

    if (!token) {
      return res.status(401).json({ message: 'Access denied. No token provided.' });
    }

    // Verify token
    const jwtSecret = process.env.JWT_SECRET || 'your-secret-key-change-in-production';
    const decoded = jwt.verify(token, jwtSecret);

    // Attach user info to request object
    req.user = decoded;
    next();
  } catch (error) {
    if (error.name === 'JsonWebTokenError') {
      return res.status(403).json({ message: 'Invalid token.' });
    }
    if (error.name === 'TokenExpiredError') {
      return res.status(403).json({ message: 'Token expired.' });
    }
    return res.status(500).json({ message: 'Server error', error: error.message });
  }
};

/**
 * Generate JWT Token
 * Creates a JWT token for authenticated users
 */
const generateToken = (userId, email) => {
  const jwtSecret = process.env.JWT_SECRET || 'your-secret-key-change-in-production';
  const jwtExpiry = process.env.JWT_EXPIRY || '7d'; // Token expires in 7 days by default

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
  generateToken
};