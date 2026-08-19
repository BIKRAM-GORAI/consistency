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
    const formatted = goals.map(g => {
      const obj = g.toObject();
      if (!obj.createdAt && g._id) {
        obj.createdAt = g._id.getTimestamp();
      }
      return obj;
    });
    res.json(formatted);
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
    const { title, deadline, tasks, createdAt } = req.body;

    if (!title || !String(title).trim()) {
      return res.status(400).json({ message: 'Goal title is required.' });
    }
    if (!deadline) {
      return res.status(400).json({ message: 'Goal deadline is required.' });
    }

    const parsedDeadline = new Date(deadline);
    if (isNaN(parsedDeadline.getTime())) {
      return res.status(400).json({ message: 'Invalid goal deadline date format.' });
    }

    const validTasks = (tasks || [])
      .filter(t => t && typeof t === 'object' && t.title && String(t.title).trim() !== '')
      .map(t => ({ title: String(t.title).trim(), completed: Boolean(t.completed) }));

    if (validTasks.length === 0) {
      return res.status(400).json({ message: 'At least one subtask is mandatory to create a goal.' });
    }

    const goal = new Goal({
      userId,
      title: String(title).trim(),
      deadline: parsedDeadline,
      tasks: validTasks
    });

    if (createdAt) {
      const parsedCreated = new Date(createdAt);
      if (!isNaN(parsedCreated.getTime())) {
        goal.createdAt = parsedCreated;
      }
    }

    const saved = await goal.save();
    
    const result = saved.toObject();
    if (!result.createdAt && saved._id) {
      result.createdAt = saved._id.getTimestamp();
    }

    res.status(201).json(result);
  } catch (error) {
    console.error('Error creating goal:', error);
    res.status(400).json({ message: error.message || 'Server error creating goal' });
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

    // 15-minute creation edit window check calibrated with DB createdAt or ObjectID timestamp
    const createdTime = goal.createdAt
      ? new Date(goal.createdAt).getTime()
      : (goal._id ? goal._id.getTimestamp().getTime() : Date.now());
    const isWithin15Min = (Date.now() - createdTime) <= 15 * 60 * 1000;

    if (!isWithin15Min) {
      // Check title modification
      if (req.body.title && req.body.title.trim() !== goal.title) {
        return res.status(400).json({ message: 'Goal title cannot be modified after 15 minutes of creation.' });
      }
      // Check deadline modification
      if (req.body.deadline && new Date(req.body.deadline).getTime() !== new Date(goal.deadline).getTime()) {
        return res.status(400).json({ message: 'Goal deadline cannot be modified after 15 minutes of creation.' });
      }

      // Check tasks modification (existing tasks cannot be deleted or renamed after 15 mins)
      if (req.body.tasks && Array.isArray(req.body.tasks)) {
        for (const existingTask of goal.tasks) {
          const matching = req.body.tasks.find(t => t._id && t._id.toString() === existingTask._id.toString());
          if (!matching) {
            return res.status(400).json({ message: 'Existing subtasks cannot be deleted after 15 minutes of creation. You can only add new subtasks.' });
          }
          if (matching.title && matching.title.trim() !== existingTask.title) {
            return res.status(400).json({ message: 'Existing subtasks cannot be renamed after 15 minutes of creation. You can only add new subtasks.' });
          }
        }
      }
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

    // If goal was just fully completed, automatically create/append category to today's Day card and log achievement
    if (!wasCompleted && isCompleted) {
      const Day = require('../models/Day');
      const Achievement = require('../models/Achievement');
      
      // Get today's local date string (YYYY-MM-DD), prioritizing client header if provided
      const d = new Date();
      const clientDateStr = req.headers['x-client-date'];
      const todayStr = (clientDateStr && /^\d{4}-\d{2}-\d{2}$/.test(clientDateStr))
        ? clientDateStr
        : `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

      // Ensure a Day card exists for today
      let day = await Day.findOne({ userId, date: todayStr });
      if (!day) {
        day = new Day({ userId, date: todayStr, categories: [] });
      }

      // ── Create or append Goal Category & Subtasks in today's Daily Card ──
      const cleanGoalTitle = decodeEntities(updated.title);
      const categoryName = `🎯 Goal: ${cleanGoalTitle}`;

      const goalTasks = (updated.tasks || []).map(t => ({
        title: decodeEntities(t.title),
        completed: true
      }));

      // Check if this category already exists in day.categories
      const existingCatIndex = day.categories.findIndex(c => c.name === categoryName);
      if (existingCatIndex !== -1) {
        day.categories[existingCatIndex].tasks = goalTasks;
      } else {
        day.categories.push({
          name: categoryName,
          tasks: goalTasks
        });
      }
      await day.save();

      // Build a rich description listing the completed tasks for Achievement
      const deadlineStr = new Date(updated.deadline).toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' });
      let description = `Goal Deadline: ${deadlineStr}\n\nTasks:\n`;
      updated.tasks.forEach(t => {
        const cleanTaskTitle = decodeEntities(t.title);
        description += `✅ ${cleanTaskTitle}\n`;
      });

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
 * Only the owner of the goal can delete it (within 15 minutes of creation)
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

    // 15-minute creation edit window check calibrated with DB createdAt or ObjectID timestamp
    const createdTime = goal.createdAt
      ? new Date(goal.createdAt).getTime()
      : (goal._id ? goal._id.getTimestamp().getTime() : Date.now());
    const isWithin15Min = (Date.now() - createdTime) <= 15 * 60 * 1000;
    if (!isWithin15Min) {
      return res.status(400).json({ message: 'Goals cannot be deleted after 15 minutes of creation.' });
    }

    await Goal.findByIdAndDelete(req.params.id);
    res.json({ message: 'Goal deleted successfully' });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

module.exports = { getAllGoals, createGoal, updateGoal, deleteGoal };
