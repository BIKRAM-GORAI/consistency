const Goal = require('../models/Goal');

function decodeEntities(str) {
  if (!str) return '';
  let s = String(str);
  for (let i = 0; i < 4; i++) {
    if (!/&(amp|lt|gt|quot|#39|#x2F);/i.test(s)) break;
    s = s
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/&#x2F;/gi, '/');
  }
  return s;
}

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

    const wasCompleted = goal.tasks && goal.tasks.length > 0 && goal.tasks.every(t => t.completed);

    // Calculate completedAt based on the updated tasks status
    let isCompletedNow = false;
    if (req.body.tasks) {
      isCompletedNow = req.body.tasks.length > 0 && req.body.tasks.every(t => t.completed);
    } else if (goal.tasks) {
      isCompletedNow = goal.tasks.length > 0 && goal.tasks.every(t => t.completed);
    }

    if (isCompletedNow) {
      if (!goal.completedAt) {
        req.body.completedAt = req.body.completedAt || new Date();
      }
    } else {
      req.body.completedAt = null;
    }

    const updated = await Goal.findByIdAndUpdate(
      req.params.id,
      { $set: req.body },
      { new: true, runValidators: true }
    );

    const isCompleted = updated.tasks && updated.tasks.length > 0 && updated.tasks.every(t => t.completed);

    // If goal was just fully completed, automatically log it as an achievement
    if (!wasCompleted && isCompleted) {
      const Day = require('../models/Day');
      const Achievement = require('../models/Achievement');
      
      // Get today's local date string (YYYY-MM-DD)
      const d = new Date();
      const todayStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

      // Ensure a Day exists for today to attach the achievement to
      let day = await Day.findOne({ userId, date: todayStr });
      if (!day) {
        day = new Day({ userId, date: todayStr, categories: [] });
        await day.save();
      }

      // Build a rich description listing the completed tasks
      const deadlineStr = new Date(updated.deadline).toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' });
      let description = `Goal Deadline: ${deadlineStr}\n\nTasks:\n`;
      updated.tasks.forEach(t => {
        const cleanTaskTitle = decodeEntities(t.title);
        description += `✅ ${cleanTaskTitle}\n`;
      });

      const cleanGoalTitle = decodeEntities(updated.title);
      const achievement = new Achievement({
        userId,
        dayId: day._id,
        date: todayStr,
        title: `Goal Achieved: ${cleanGoalTitle}`,
        description: decodeEntities(description.trim()),
        links: []
      });
      await achievement.save();
    }

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
