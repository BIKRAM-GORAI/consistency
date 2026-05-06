require('dotenv').config();
const express = require('express');
const cors    = require('cors');
const path    = require('path');
const connectDB = require('./config/db');
const { authenticateToken } = require('./middleware/auth');
const { generalLimiter, authLimiter, dataModificationLimiter, readOnlyLimiter } = require('./middleware/rateLimit');

const authRoutes        = require('./routes/authRoutes');
const dayRoutes         = require('./routes/dayRoutes');
const goalRoutes        = require('./routes/goalRoutes');
const groupRoutes       = require('./routes/groupRoutes');
const achievementRoutes = require('./routes/achievementRoutes');
const cronRoutes        = require('./routes/cronRoutes');
const templateRoutes    = require('./routes/templateRoutes');
const reviewRoutes      = require('./routes/reviewRoutes');
const userRoutes        = require('./routes/userRoutes');
const leetcodeRoutes    = require('./routes/leetcodeRoutes');
const adminRoutes       = require('./routes/adminRoutes');

// ── App setup ──────────────────────────────────────────────
const app = express();
app.set("trust proxy", 1); // ✅ ADD THIS HERE


// Connect to MongoDB
connectDB();

// ── Middleware ─────────────────────────────────────────────
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ limit: '10mb', extended: true }));

// ── Security Headers ───────────────────────────────────────
app.use((req, res, next) => {
  // Prevent clickjacking
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');

  // Stop MIME-type sniffing
  res.setHeader('X-Content-Type-Options', 'nosniff');

  // Send referrer only on same-origin; only origin on cross-origin
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');

  // Disable browser features the app doesn't use
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=()');

  // Content Security Policy — robust for production
  const isDev = process.env.NODE_ENV === 'development';
  const connectSrc = [
    "'self'",
    "https://*.firebaseio.com",
    "https://*.googleapis.com",
    "wss://*.firebaseio.com",
    "https://firestore.googleapis.com",
    "https://cdnjs.cloudflare.com",
    "https://fonts.googleapis.com",
    "https://fonts.gstatic.com",
    "https://res.cloudinary.com",
    "https://*.cloudinary.com",
    "https://assets.leetcode.com",
    "https://www.gstatic.com",
    "https://apis.google.com",
    "https://unpkg.com",
    "https://via.placeholder.com",
    "https://placehold.co",
    "https://consistency-daily.vercel.app",
    "https://*.vercel.app",
    "https://vercel.live",
    "wss://*.vercel.live"
  ];
  if (isDev) connectSrc.push("http://localhost:5000", "http://localhost:5001", "ws://localhost:5000", "ws://localhost:5001");

  res.setHeader(
    'Content-Security-Policy',
    [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://www.gstatic.com https://apis.google.com https://cdn.jsdelivr.net https://cdnjs.cloudflare.com https://unpkg.com https://vercel.live",
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://cdn.jsdelivr.net https://cdnjs.cloudflare.com https://unpkg.com",
      "font-src 'self' data: https://fonts.gstatic.com https://cdnjs.cloudflare.com",
      "img-src 'self' data: blob: https: https://res.cloudinary.com https://*.cloudinary.com https://placehold.co https://via.placeholder.com",
      `connect-src ${connectSrc.join(' ')}`,
      "frame-src 'self' https://*.firebaseapp.com https://vercel.live",
      "object-src 'none'",
      "base-uri 'self'",
      "form-action 'self'",
    ].join('; ')
  );

  // Strict Transport Security (HSTS) - only in production
  if (!isDev) {
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains; preload');
  }

  // Allow Firebase Auth popups
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin-allow-popups');

  next();
});

// ── API Routes ─────────────────────────────────────────────
// Apply general rate limiting to all API routes
app.use('/api', generalLimiter);

// Public routes (no authentication required) with stricter rate limiting
app.use('/api/auth/register', authLimiter, authRoutes);
app.use('/api/auth/login', authLimiter, authRoutes);
app.use('/api/auth', authRoutes); // Other auth routes

// Protected routes (authentication required) with appropriate rate limiting
app.use('/api/days',         authenticateToken, dataModificationLimiter, dayRoutes);
app.use('/api/goals',        authenticateToken, dataModificationLimiter, goalRoutes);
app.use('/api/groups',       authenticateToken, dataModificationLimiter, groupRoutes);
app.use('/api/achievements', authenticateToken, dataModificationLimiter, achievementRoutes);
app.use('/api/cron',         cronRoutes); // Cron routes have their own auth
app.use('/api/templates',    authenticateToken, dataModificationLimiter, templateRoutes);
app.use('/api/reviews',      reviewRoutes); // Public review submission
app.use('/api/users',        readOnlyLimiter, userRoutes); // Public user profiles
app.use('/api/leetcode',    authenticateToken, dataModificationLimiter, leetcodeRoutes); // LeetCode integration
app.use('/api/admin',       adminRoutes); // Admin routes

// ── Serve static frontend files ────────────────────────────
// __dirname = backend/, so ../frontend is the sibling folder.

// Explicit routes for SEO bots to guarantee delivery before static middleware
app.get('/sitemap.xml', (req, res) => {
  res.type('application/xml');
  res.sendFile(path.join(__dirname, '../frontend/sitemap.xml'));
});

app.get('/robots.txt', (req, res) => {
  res.type('text/plain');
  res.sendFile(path.join(__dirname, '../frontend/robots.txt'));
});

app.use(express.static(path.join(__dirname, '../frontend')));
app.use('/js/libs/lucide', express.static(path.join(__dirname, '../node_modules/lucide/dist/umd')));

// ── Root: redirect to landing page ────────────────────────
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '../frontend/landing.html'));
});

// ── SPA fallback: return landing.html for unknown routes ───
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '../frontend/landing.html'));
});

// ── Local dev: only listen when run directly (not on Vercel) ──
if (require.main === module) {
  const PORT = process.env.PORT || 5000;
  app.listen(PORT, () => {
    console.log(`🚀 Server running on http://localhost:${PORT}`);
  });
}

// Required by Vercel — export the Express app as the serverless handler
module.exports = app;
