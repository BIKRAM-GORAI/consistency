const Goal = require('../models/Goal');

/**
 * GET /api/goals?userId=...
 * Retrieve all goals for a user sorted by deadline ascending
 */
const getAllGoals = async (req, res) => {
  try {
    const { userId } = req.query;
    if (!userId) return res.status(400).json({ message: 'userId is required' });

    const goals = await Goal.find({ userId }).sort({ deadline: 1 });
    res.json(goals);
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

/**
 * POST /api/goals
 * Create a new long-term goal for a user
 */
const createGoal = async (req, res) => {
  try {
    const { userId, title, deadline, tasks } = req.body;
    if (!userId) return res.status(400).json({ message: 'userId is required' });

    const goal = new Goal({ userId, title, deadline, tasks: tasks || [] });
    const saved = await goal.save();
    res.status(201).json(saved);
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

/**
 * PUT /api/goals/:id
 * Update a goal's tasks or details
 */
const updateGoal = async (req, res) => {
  try {
    const updated = await Goal.findByIdAndUpdate(
      req.params.id,
      { $set: req.body },
      { new: true, runValidators: true }
    );
    if (!updated) return res.status(404).json({ message: 'Goal not found' });
    res.json(updated);
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

/**
 * DELETE /api/goals/:id
 * Delete a goal
 */
const deleteGoal = async (req, res) => {
  try {
    const deleted = await Goal.findByIdAndDelete(req.params.id);
    if (!deleted) return res.status(404).json({ message: 'Goal not found' });
    res.json({ message: 'Goal deleted successfully' });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

module.exports = { getAllGoals, createGoal, updateGoal, deleteGoal };
