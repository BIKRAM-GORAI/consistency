const express = require('express');
const router = express.Router();
const { getAllGoals, createGoal, updateGoal, deleteGoal } = require('../controllers/goalController');
const { createGoalValidation, updateGoalValidation } = require('../middleware/validation');
const { authenticateToken } = require('../middleware/auth');

// GET all goals
router.get('/', authenticateToken, getAllGoals);

// POST create a new goal
router.post('/', authenticateToken, createGoalValidation, createGoal);

// PUT update a goal by id
router.put('/:id', authenticateToken, updateGoalValidation, updateGoal);

// DELETE a goal by id
router.delete('/:id', authenticateToken, deleteGoal);

module.exports = router;
