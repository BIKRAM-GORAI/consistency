const express = require('express');
const router = express.Router();
const { getAllGoals, createGoal, updateGoal, deleteGoal } = require('../controllers/goalController');

// GET all goals
router.get('/', getAllGoals);

// POST create a new goal
router.post('/', createGoal);

// PUT update a goal by id
router.put('/:id', updateGoal);

// DELETE a goal by id
router.delete('/:id', deleteGoal);

module.exports = router;
