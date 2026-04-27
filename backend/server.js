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

// ── App setup ──────────────────────────────────────────────
const app = express();

// Connect to MongoDB
connectDB();

// ── Middleware ─────────────────────────────────────────────
app.use(cors());
app.use(express.json());

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
