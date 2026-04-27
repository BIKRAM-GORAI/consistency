const express = require('express');
const router = express.Router();
const { getAllDays, getDayByDate, createDay, updateDay } = require('../controllers/dayController');
const { createDayValidation, updateDayValidation } = require('../middleware/validation');
const { authenticateToken } = require('../middleware/auth');

// GET all days
router.get('/', authenticateToken, getAllDays);

// GET a specific day by date string (must come before /:id)
router.get('/:date', authenticateToken, getDayByDate);

// POST create a new day
router.post('/', authenticateToken, createDayValidation, createDay);

// PUT update a day by MongoDB _id
router.put('/:id', authenticateToken, updateDayValidation, updateDay);

module.exports = router;
