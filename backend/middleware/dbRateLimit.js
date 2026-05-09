const User = require('../models/User');

/**
 * Persistent Rate Limiter using MongoDB
 * Ensures that the 20-images-per-hour limit survives server restarts and cold starts.
 */
const dbMediaRateLimiter = async (req, res, next) => {
  try {
    const userId = req.user.userId; // Populated by authenticateToken middleware
    if (!userId) {
      return res.status(401).json({ message: 'Unauthorized: User ID missing' });
    }

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    const now = new Date();
    const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);

    // If the reset timestamp is older than 1 hour, reset the counter
    if (user.mediaUploadReset < oneHourAgo) {
      user.mediaUploadCount = 0;
      user.mediaUploadReset = now;
    }

    // Check if limit is reached
    const MAX_LIMIT = 20;
    if (user.mediaUploadCount >= MAX_LIMIT) {
      const timeLeft = Math.ceil((user.mediaUploadReset.getTime() + 60 * 60 * 1000 - now.getTime()) / (60 * 1000));
      return res.status(429).json({
        message: 'You have exceeded the limit to send photos in an hour. Please try again in another hour.',
        remaining: 0,
        limit: MAX_LIMIT,
        resetInMinutes: timeLeft
      });
    }

    // Attach current status to req for use in the controller if needed
    req.mediaLimit = {
      remaining: MAX_LIMIT - user.mediaUploadCount - 1, // -1 because this request counts
      limit: MAX_LIMIT
    };

    // Increment count
    user.mediaUploadCount += 1;
    await user.save();

    next();
  } catch (err) {
    console.error('DB Rate Limit Error:', err);
    res.status(500).json({ message: 'Internal server error checking limits' });
  }
};

module.exports = { dbMediaRateLimiter };
