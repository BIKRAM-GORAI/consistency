const rateLimit = require('express-rate-limit');

/**
 * General rate limiter for all API requests
 * Limits requests to 500 per 15 minutes per IP
 */
const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 1000, // Increased for PWA sync
  message: {
    message: 'Too many requests from this IP, please try again later.'
  },
  standardHeaders: true, 
  legacyHeaders: false,
});

/**
 * Strict rate limiter for media uploads
 */
const mediaUploadLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 20, // max 20 uploads per hour per IP
  message: {
    message: 'You have exceeded the limit to send photos in an hour. Please try again in another hour.'
  },
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res, next, options) => {
    res.status(options.statusCode).json({
      message: options.message.message,
      remaining: 0,
      limit: options.max,
      resetTime: req.rateLimit.resetTime
    });
  }
});

/**
 * Strict rate limiter for authentication endpoints
 */
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, 
  max: 50, // Increased for dev stability
  message: {
    message: 'Too many authentication attempts, please try again later.'
  },
  standardHeaders: true,
  legacyHeaders: false,
});

/**
 * Moderate rate limiter for data modification endpoints
 */
const dataModificationLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 500, // Increased for batch loads
  message: {
    message: 'Too many data modification requests, please try again later.'
  },
  standardHeaders: true,
  legacyHeaders: false,
});

/**
 * Lenient rate limiter for read-only endpoints
 */
const readOnlyLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 1000, // Increased for dashboard revalidation
  message: {
    message: 'Too many read requests, please try again later.'
  },
  standardHeaders: true,
  legacyHeaders: false,
});

/**
 * Strict rate limiter for the public architecture report page
 */
const architectureLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 15,
  message: {
    message: 'Too many requests for the architecture report. Please try again in 15 minutes.'
  },
  standardHeaders: true,
  legacyHeaders: false,
});

module.exports = {
  generalLimiter,
  authLimiter,
  dataModificationLimiter,
  readOnlyLimiter,
  architectureLimiter,
  mediaUploadLimiter
};