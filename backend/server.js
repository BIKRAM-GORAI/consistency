require('dotenv').config();
const express = require('express');
const cors    = require('cors');
const path    = require('path');
const connectDB = require('./config/db');
const { authenticateToken } = require('./middleware/auth');
const { generalLimiter, authLimiter, dataModificationLimiter, readOnlyLimiter, architectureLimiter } = require('./middleware/rateLimit');

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
const systemRoutes      = require('./routes/systemRoutes');
const syncRoutes        = require('./routes/syncRoutes');
const fcmRoutes         = require('./routes/fcmRoutes');
const aiRoutes          = require('./routes/aiRoutes');
const appLimitRoutes    = require('./routes/appLimitRoutes');
const subscriptionRoutes = require('./routes/subscriptionRoutes');
const reportRoutes       = require('./routes/reportRoutes');
const canvasWorkflowRoutes = require('./routes/canvasWorkflowRoutes');
const friendRoutes       = require('./routes/friendRoutes');


// ── App setup ──────────────────────────────────────────────
const app = express();
app.set("trust proxy", 1); // Trust first reverse proxy (required for accurate client IP rate limiting on Vercel)

// ── Lightweight Health Check Route (Bypasses Database & Rate Limiters for Uptime Robot) ──
app.get('/api/health', (req, res) => {
  res.status(200).json({
    status: 'UP',
    timestamp: new Date().toISOString(),
    uptime: process.uptime()
  });
});


// Ensure database is connected for every request
app.use(async (req, res, next) => {
  try {
    await connectDB();
    next();
  } catch (err) {
    console.error('Database connection middleware error:', err);
    res.status(500).json({ message: 'Database connection failed' });
  }
});

// ── Middleware ─────────────────────────────────────────────
const allowedOrigins = [
  'https://consistency-daily.vercel.app',
  'https://consistency-tracker.vercel.app',
  'http://localhost:5000',
  'http://localhost:5001',
  'http://127.0.0.1:5000',
  'http://127.0.0.1:5001',
  'https://localhost',
  'capacitor://localhost',
  'http://localhost'
];
app.use(cors({
  origin: function (origin, callback) {
    if (!origin || allowedOrigins.indexOf(origin) !== -1) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true
}));
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

  // Disable browser features the app doesn't use, but allow microphone/camera for voice/video
  res.setHeader('Permissions-Policy', 'camera=(self "https://jitsi.belnet.be" "https://meet.jit.si"), microphone=(self "https://jitsi.belnet.be" "https://meet.jit.si"), display-capture=(self "https://jitsi.belnet.be" "https://meet.jit.si"), geolocation=(), payment=(self "https://api.razorpay.com" "https://checkout.razorpay.com")');

  // Content Security Policy — robust for production
  const isDev = process.env.NODE_ENV === 'development';
  const connectSrc = [
    "'self'",
    "https://*.firebaseio.com",
    "https://*.firebasedatabase.app",
    "https://*.googleapis.com",
    "wss://*.firebaseio.com",
    "wss://*.firebasedatabase.app",
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
    "wss://*.vercel.live",
    "https://cdn.jsdelivr.net",
    "https://www.google.com",
    "https://jitsi.belnet.be",
    "wss://jitsi.belnet.be",
    "https://meet.jit.si",
    "wss://meet.jit.si",
    "https://*.clarity.ms",
    "https://c.bing.com",
    "https://*.onrender.com",
    "https://api.razorpay.com",
    "https://checkout.razorpay.com",
    "https://lumberjack.razorpay.com",
    "https://*.razorpay.com"
  ];

  if (process.env.AI_SERVICE_URL) {
    connectSrc.push(process.env.AI_SERVICE_URL);
  }

  if (isDev) {
    connectSrc.push(
      "http://localhost:5000",
      "http://localhost:5001",
      "http://localhost:5002",
      "ws://localhost:5000",
      "ws://localhost:5001",
      "ws://localhost:5002"
    );
  }

  res.setHeader(
    'Content-Security-Policy',
    [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://www.gstatic.com https://*.firebaseapp.com https://*.firebaseio.com https://*.firebasedatabase.app https://apis.google.com https://cdn.jsdelivr.net https://cdnjs.cloudflare.com https://unpkg.com https://vercel.live https://jitsi.belnet.be https://meet.jit.si https://*.clarity.ms https://checkout.razorpay.com https://cdn.razorpay.com",
      "script-src-elem 'self' 'unsafe-inline' https://www.gstatic.com https://*.firebaseapp.com https://*.firebaseio.com https://*.firebasedatabase.app https://apis.google.com https://cdn.jsdelivr.net https://cdnjs.cloudflare.com https://unpkg.com https://vercel.live https://jitsi.belnet.be https://meet.jit.si https://*.clarity.ms https://checkout.razorpay.com https://cdn.razorpay.com",
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://cdn.jsdelivr.net https://cdnjs.cloudflare.com  https://unpkg.com https://jitsi.belnet.be https://meet.jit.si",
      "font-src 'self' data: https://fonts.gstatic.com https://cdnjs.cloudflare.com https://jitsi.belnet.be https://meet.jit.si",
      "img-src 'self' data: blob: https: https://res.cloudinary.com https://*.cloudinary.com https://placehold.co https://via.placeholder.com https://www.google.com https://jitsi.belnet.be https://meet.jit.si https://*.clarity.ms https://c.bing.com https://checkout.razorpay.com https://*.razorpay.com https://cdn.razorpay.com",
      "media-src 'self' blob: https://res.cloudinary.com https://*.cloudinary.com",
      `connect-src ${connectSrc.join(' ')}`,
      "frame-src 'self' https://*.firebaseapp.com https://*.firebaseio.com https://*.firebasedatabase.app https://vercel.live https://jitsi.belnet.be https://meet.jit.si https://api.razorpay.com https://checkout.razorpay.com https://*.razorpay.com https://*.youtube.com https://*.youtube-nocookie.com https://*.spotify.com",
      "worker-src 'self' blob:",
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

// Disable caching globally for all API endpoints to prevent stale data display in browsers and apps
app.use('/api', (req, res, next) => {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  res.setHeader('Surrogate-Control', 'no-store');
  next();
});

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
app.use('/api/admin/login', authLimiter);
app.use('/api/admin', adminRoutes);
app.use('/api/system', systemRoutes);
app.use('/api/sync', syncRoutes);
app.use('/api/fcm',          authenticateToken, dataModificationLimiter, fcmRoutes);
app.use('/api/ai',           authenticateToken, dataModificationLimiter, aiRoutes);
app.use('/api/applimits',    authenticateToken, dataModificationLimiter, appLimitRoutes);
app.use('/api/subscriptions', authenticateToken, dataModificationLimiter, subscriptionRoutes);
app.use('/api/reports',       authenticateToken, dataModificationLimiter, reportRoutes);
app.use('/api/canvas-workflows', canvasWorkflowRoutes);
app.use('/api/friends',       authenticateToken, dataModificationLimiter, friendRoutes);


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

// ── Architecture Report Page ──
app.get('/architecture', architectureLimiter, (req, res) => {
  res.sendFile(path.join(__dirname, '../frontend/architecture.html'));
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
