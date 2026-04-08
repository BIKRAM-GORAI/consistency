const Day = require('../models/Day');

/**
 * GET /api/days
 * Retrieve all days sorted by date ascending
 */
const getAllDays = async (req, res) => {
  try {
    const days = await Day.find().sort({ date: 1 });
    res.json(days);
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

/**
 * GET /api/days/:date
 * Get a specific day by date string (YYYY-MM-DD)
 */
const getDayByDate = async (req, res) => {
  try {
    const day = await Day.findOne({ date: req.params.date });
    if (!day) return res.status(404).json({ message: 'Day not found' });
    res.json(day);
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

/**
 * POST /api/days
 * Create a new day entry
 */
const createDay = async (req, res) => {
  try {
    const { date, categories, summary } = req.body;

    // Prevent duplicate dates
    const existing = await Day.findOne({ date });
    if (existing) {
      return res.status(400).json({ message: 'A card for this date already exists' });
    }

    const day = new Day({ date, categories: categories || [], summary: summary || '' });
    const saved = await day.save();
    res.status(201).json(saved);
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

/**
 * PUT /api/days/:id
 * Update a day (categories, tasks, summary)
 */
const updateDay = async (req, res) => {
  try {
    const updated = await Day.findByIdAndUpdate(
      req.params.id,
      { $set: req.body },
      { new: true, runValidators: true }
    );
    if (!updated) return res.status(404).json({ message: 'Day not found' });
    res.json(updated);
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

module.exports = { getAllDays, getDayByDate, createDay, updateDay };
