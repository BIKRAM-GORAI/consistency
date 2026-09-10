require('dotenv').config();
const express = require('express');
const cors    = require('cors');
const path    = require('path');
const https   = require('https');
const http    = require('http');
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
const systemRoutes      = require('./routes/systemRoutes');
const syncRoutes        = require('./routes/syncRoutes');
const fcmRoutes         = require('./routes/fcmRoutes');
const aiRoutes          = require('./routes/aiRoutes');
const appLimitRoutes    = require('./routes/appLimitRoutes');
const subscriptionRoutes = require('./routes/subscriptionRoutes');
const reportRoutes       = require('./routes/reportRoutes');
const canvasWorkflowRoutes = require('./routes/canvasWorkflowRoutes');
const friendRoutes       = require('./routes/friendRoutes');
const integrationRoutes  = require('./routes/integrationRoutes');


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
app.use(express.json({
  limit: '10mb',
  verify: (req, res, buf) => {
    req.rawBody = buf;
  }
}));
app.use(express.urlencoded({ limit: '10mb', extended: true }));

// ── Security Headers ───────────────────────────────────────
app.use((req, res, next) => {
  // Prevent clickjacking
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');

  // Stop MIME-type sniffing
  res.setHeader('X-Content-Type-Options', 'nosniff');

  // Send referrer only on same-origin; only origin on cross-origin
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');

  // HSTS (HTTP Strict Transport Security) - enforce HTTPS in production and on secure requests
  if (process.env.NODE_ENV === 'production' || req.secure || req.headers['x-forwarded-proto'] === 'https') {
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains; preload');
  }

  // Disable DNS prefetching to protect user privacy
  res.setHeader('X-DNS-Prefetch-Control', 'off');

  // Cross-Origin Opener Policy — isolate browsing context while permitting OAuth popups (Google/GitHub)
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin-allow-popups');

  // Disable browser features the app doesn't use, but allow microphone/camera for voice/video
  res.setHeader('Permissions-Policy', 'camera=(self "https://jitsi.belnet.be" "https://meet.jit.si"), microphone=(self "https://jitsi.belnet.be" "https://meet.jit.si"), display-capture=(self "https://jitsi.belnet.be" "https://meet.jit.si"), geolocation=(), payment=(self "https://api.razorpay.com" "https://checkout.razorpay.com")');

  // Content Security Policy — robust for production
  const isDev = process.env.NODE_ENV === 'development';
  const connectSrc = [
    "'self'",
    "https://*.firebaseio.com",
    "https://*.firebasedatabase.app",
    "https://firestore.googleapis.com",
    "https://*.googleapis.com",
    "https://api.github.com",
    "https://api.stackexchange.com",
    "https://dev.to",
    "https://api.allorigins.win",
    "https://api.codetabs.com",
    "https://cdnjs.cloudflare.com",
    "https://fonts.googleapis.com",
    "https://fonts.gstatic.com",
    "https://fonts.googleapis.com",
    "https://fonts.gstatic.com",
    "https://res.cloudinary.com",
    "https://*.cloudinary.com",
    "https://assets.leetcode.com",
    "https://www.gstatic.com",
    "https://apis.google.com",
    "wss://*.firebaseio.com",
    "wss://*.firebasedatabase.app",
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
      "ws://localhost:5002",
      "http://127.0.0.1:5000",
      "http://127.0.0.1:5001",
      "http://127.0.0.1:5002",
      "ws://127.0.0.1:5000",
      "ws://127.0.0.1:5001",
      "ws://127.0.0.1:5002"
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
const motivationController = require('./controllers/motivationController');
app.get('/api/motivation/quotes', motivationController.getPublicQuotes);
app.use('/api/integrations',  integrationRoutes);
app.use('/api/devhub',        require('./routes/devHubRoutes'));

// ── Generic server-side HTTP proxy helper with SSRF Protection ─────────────
const ALLOWED_PROXY_DOMAINS = ['dev.to', 'medium.com'];

function isSafeProxyHost(hostname) {
  if (!hostname) return false;
  const h = hostname.toLowerCase();
  // Block loopback, metadata services, and internal RFC-1918 addresses
  if (['localhost', '127.0.0.1', '169.254.169.254', '0.0.0.0', '[::1]'].includes(h)) return false;
  if (/^(10\.|192\.168\.|172\.(1[6-9]|2[0-9]|3[01])\.)/.test(h)) return false;
  return ALLOWED_PROXY_DOMAINS.some(domain => h === domain || h.endsWith('.' + domain));
}

function serverProxy(targetUrl, res, extraHeaders = {}, redirectCount = 0) {
  if (redirectCount > 3) {
    return res.status(502).json({ error: 'Too many redirects' });
  }

  let parsedUrl;
  try {
    parsedUrl = new URL(targetUrl);
  } catch (err) {
    return res.status(400).json({ error: 'Invalid proxy target URL' });
  }

  if (parsedUrl.protocol !== 'https:') {
    return res.status(400).json({ error: 'Only HTTPS proxy targets are permitted' });
  }

  if (!isSafeProxyHost(parsedUrl.hostname)) {
    return res.status(403).json({ error: 'Proxy destination host is not permitted' });
  }

  const options = {
    hostname: parsedUrl.hostname,
    path: parsedUrl.pathname + parsedUrl.search,
    headers: {
      'User-Agent': 'Mozilla/5.0 (compatible; DevHubProxy/1.0)',
      'Accept': '*/*',
      ...extraHeaders
    }
  };
  const req = https.get(options, (proxyRes) => {
    if (proxyRes.statusCode >= 300 && proxyRes.statusCode < 400 && proxyRes.headers.location) {
      try {
        const resolvedRedirect = new URL(proxyRes.headers.location, targetUrl).toString();
        return serverProxy(resolvedRedirect, res, extraHeaders, redirectCount + 1);
      } catch (e) {
        return res.status(502).json({ error: 'Invalid redirect location' });
      }
    }
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Cache-Control', 'no-store');
    res.status(proxyRes.statusCode);
    // Forward content-type from origin
    if (proxyRes.headers['content-type']) {
      res.setHeader('Content-Type', proxyRes.headers['content-type']);
    }
    proxyRes.pipe(res);
  });
  req.on('error', (e) => { if (!res.headersSent) res.status(502).json({ error: e.message }); });
  req.setTimeout(12000, () => { req.destroy(); if (!res.headersSent) res.status(504).json({ error: 'Upstream timeout' }); });
}

// Medium RSS Proxy — user feed: ?username=bikram77620 | public: ?tag=programming
app.get('/api/proxy/medium-rss', (req, res) => {
  let targetUrl;
  if (req.query.username) {
    const clean = String(req.query.username).replace(/^@/, '').trim();
    if (!/^[a-zA-Z0-9_\-\.]+$/.test(clean)) {
      return res.status(400).json({ error: 'Invalid Medium username format' });
    }
    targetUrl = `https://medium.com/feed/@${clean}`;
  } else if (req.query.tag) {
    const cleanTag = String(req.query.tag).trim();
    if (!/^[a-zA-Z0-9_\-\. ]+$/.test(cleanTag)) {
      return res.status(400).json({ error: 'Invalid Medium tag format' });
    }
    targetUrl = `https://medium.com/feed/tag/${encodeURIComponent(cleanTag)}`;
  } else {
    return res.status(400).json({ error: 'Provide username or tag query param' });
  }
  serverProxy(targetUrl, res, { 'Accept': 'application/rss+xml, text/xml, */*' });
});

// Dev.to API Proxy — avoids browser CSP/cache issues
// ?endpoint=/api/articles&username=bikram_gorai&per_page=12
app.get('/api/proxy/devto', (req, res) => {
  const endpoint = String(req.query.endpoint || '/api/articles').trim();
  const endpointPattern = /^\/api\/[a-zA-Z0-9_\-]+(\/[a-zA-Z0-9_\-]+)*$/;
  if (!endpointPattern.test(endpoint) || endpoint.includes('@') || endpoint.includes(':')) {
    return res.status(400).json({ error: 'Invalid Dev.to API endpoint path' });
  }

  const qs = Object.entries(req.query)
    .filter(([k]) => k !== 'endpoint')
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
    .join('&');
  const targetUrl = `https://dev.to${endpoint}${qs ? '?' + qs : ''}`;
  serverProxy(targetUrl, res, { 'Accept': 'application/json' });
});


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

// ── Centralized Error Handling Middleware ──────────────────
// Intercepts all unhandled errors, preventing internal stack traces or paths from leaking to clients
app.use((err, req, res, next) => {
  // Gracefully handle CORS rejections
  if (err.message === 'Not allowed by CORS') {
    return res.status(403).json({
      success: false,
      message: 'Access forbidden: Request origin is not permitted by CORS policy.'
    });
  }

  // Handle JSON parse errors from invalid body payloads
  if (err instanceof SyntaxError && err.status === 400 && 'body' in err) {
    return res.status(400).json({
      success: false,
      message: 'Invalid JSON payload received.'
    });
  }

  const isProd = process.env.NODE_ENV === 'production';
  const statusCode = err.status || err.statusCode || 500;

  // Always log full error details on the server console for debugging
  console.error(`[Server Error] ${req.method} ${req.originalUrl || req.url} [Status ${statusCode}]:`, err);

  // Send clean, sanitized JSON response to client (never expose stack traces in production)
  res.status(statusCode).json({
    success: false,
    message: isProd && statusCode === 500
      ? 'An unexpected internal server error occurred. Please try again later.'
      : (err.message || 'Server error occurred.'),
    ...(isProd ? {} : { stack: err.stack })
  });
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
