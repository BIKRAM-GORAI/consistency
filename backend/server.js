require('dotenv').config();
const express = require('express');
const cors    = require('cors');
const path    = require('path');
const connectDB = require('./config/db');

const dayRoutes  = require('./routes/dayRoutes');
const goalRoutes = require('./routes/goalRoutes');

// ── App setup ──────────────────────────────────────────────
const app = express();

// Connect to MongoDB
connectDB();

// ── Middleware ─────────────────────────────────────────────
app.use(cors());
app.use(express.json());

// ── API Routes ─────────────────────────────────────────────
app.use('/api/days',  dayRoutes);
app.use('/api/goals', goalRoutes);

// ── Serve static frontend files ────────────────────────────
// Both local dev and Vercel: Express serves the frontend folder.
// __dirname = backend/, so ../frontend is the sibling folder.
app.use(express.static(path.join(__dirname, '../frontend')));

// ── SPA fallback: always return index.html for non-API routes
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '../frontend/index.html'));
});

// ── Local dev: only listen when run directly (not on Vercel) ──
// Vercel imports this file as a module and calls it as a serverless function.
// `require.main === module` is false on Vercel, so app.listen is skipped there.
if (require.main === module) {
  const PORT = process.env.PORT || 5000;
  app.listen(PORT, () => {
    console.log(`🚀 Server running on http://localhost:${PORT}`);
  });
}

// Required by Vercel — export the Express app as the serverless handler
module.exports = app;
