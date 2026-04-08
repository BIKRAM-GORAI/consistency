const Goal = require('../models/Goal');

/**
 * GET /api/goals
 * Retrieve all goals sorted by deadline ascending
 */
const getAllGoals = async (req, res) => {
  try {
    const goals = await Goal.find().sort({ deadline: 1 });
    res.json(goals);
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

/**
 * POST /api/goals
 * Create a new long-term goal
 */
const createGoal = async (req, res) => {
  try {
    const { title, deadline, tasks } = req.body;
    const goal = new Goal({ title, deadline, tasks: tasks || [] });
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
