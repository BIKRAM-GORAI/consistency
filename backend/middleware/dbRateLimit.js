const User = require('../models/User');

/**
 * Persistent Rate Limiter using MongoDB
 * Ensures that the 20-images-per-hour limit survives server restarts and cold starts.
 */
const dbMediaRateLimiter = async (req, res, next) => {
  try {
    const userId = req.user.userId;
    if (!userId) return res.status(401).json({ message: 'Unauthorized' });

    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ message: 'User not found' });

    const now = new Date();
    const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);

    // Reset counters if window expired
    if (user.mediaResetTime < oneHourAgo) {
      user.imageUploadCount = 0;
      user.audioUploadCount = 0;
      user.audioFileUploadCount = 0;
      user.mediaResetTime = now;
    }

    // Get limits from ENV (Defaults if not set)
    const MAX_IMAGE_LIMIT = parseInt(process.env.CHAT_IMAGE_LIMIT) || 20;
    const MAX_AUDIO_LIMIT = parseInt(process.env.CHAT_AUDIO_LIMIT) || 20; // For recordings
    const MAX_AUDIO_FILE_LIMIT = parseInt(process.env.CHAT_AUDIO_FILE_LIMIT) || 5; // For manual uploads

    // Detect media type and source from headers
    const mediaType = req.headers['x-media-type'] || 'image';
    const mediaSource = req.headers['x-media-source'] || 'recording'; // 'recording' or 'upload'
    
    let currentCount = 0;
    let limit = 20;
    let typeLabel = 'media';

    if (mediaType === 'audio') {
      if (mediaSource === 'upload') {
        currentCount = user.audioFileUploadCount || 0;
        limit = MAX_AUDIO_FILE_LIMIT;
        typeLabel = 'audio file uploads';

        // EXTRA SECURITY: Check Content-Length for manual audio uploads (2MB cap)
        const contentLength = parseInt(req.headers['content-length']);
        if (contentLength > 2.5 * 1024 * 1024) { // Slightly more to allow multipart overhead
          return res.status(413).json({ message: 'Audio file upload exceeds 2MB limit.' });
        }
      } else {
        currentCount = user.audioUploadCount || 0;
        limit = MAX_AUDIO_LIMIT;
        typeLabel = 'voice recordings';
      }
    } else {
      currentCount = user.imageUploadCount || 0;
      limit = MAX_IMAGE_LIMIT;
      typeLabel = 'photos';
    }

    // Check if limit is reached
    if (currentCount >= limit) {
      const timeLeft = Math.ceil((user.mediaResetTime.getTime() + 60 * 60 * 1000 - now.getTime()) / (60 * 1000));
      return res.status(429).json({
        message: `You have exceeded the limit for ${typeLabel} this hour. Wait until next hour.`,
        remaining: 0,
        limit: limit,
        resetInMinutes: timeLeft
      });
    }

    // Increment correct counter
    if (mediaType === 'audio') {
      if (mediaSource === 'upload') {
        user.audioFileUploadCount = (user.audioFileUploadCount || 0) + 1;
      } else {
        user.audioUploadCount = (user.audioUploadCount || 0) + 1;
      }
    } else {
      user.imageUploadCount = (user.imageUploadCount || 0) + 1;
    }
    
    await user.save();
    next();
  } catch (err) {
    console.error('DB Rate Limit Error:', err);
    res.status(500).json({ message: 'Internal server error checking limits' });
  }
};

module.exports = { dbMediaRateLimiter };
