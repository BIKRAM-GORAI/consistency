const Goal = require('../models/Goal');

/**
 * GET /api/goals
 * Retrieve all goals for the authenticated user sorted by deadline ascending
 */
const getAllGoals = async (req, res) => {
  try {
    // Get userId from authenticated user (from JWT token)
    const userId = req.user.userId;

    const goals = await Goal.find({ userId }).sort({ deadline: 1 });
    res.json(goals);
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

/**
 * POST /api/goals
 * Create a new long-term goal for the authenticated user
 */
const createGoal = async (req, res) => {
  try {
    // Get userId from authenticated user (from JWT token)
    const userId = req.user.userId;
    const { title, deadline, tasks } = req.body;

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
 * Only the owner of the goal can update it
 */
const updateGoal = async (req, res) => {
  try {
    // Get userId from authenticated user (from JWT token)
    const userId = req.user.userId;

    const goal = await Goal.findById(req.params.id);
    if (!goal) return res.status(404).json({ message: 'Goal not found' });

    // Verify ownership - only the owner can update their own goals
    if (goal.userId.toString() !== userId.toString()) {
      return res.status(403).json({ message: 'Access denied. You can only update your own goals.' });
    }

    const updated = await Goal.findByIdAndUpdate(
      req.params.id,
      { $set: req.body },
      { new: true, runValidators: true }
    );
    res.json(updated);
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

/**
 * DELETE /api/goals/:id
 * Delete a goal
 * Only the owner of the goal can delete it
 */
const deleteGoal = async (req, res) => {
  try {
    // Get userId from authenticated user (from JWT token)
    const userId = req.user.userId;

    const goal = await Goal.findById(req.params.id);
    if (!goal) return res.status(404).json({ message: 'Goal not found' });

    // Verify ownership - only the owner can delete their own goals
    if (goal.userId.toString() !== userId.toString()) {
      return res.status(403).json({ message: 'Access denied. You can only delete your own goals.' });
    }

    await Goal.findByIdAndDelete(req.params.id);
    res.json({ message: 'Goal deleted successfully' });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

module.exports = { getAllGoals, createGoal, updateGoal, deleteGoal };
