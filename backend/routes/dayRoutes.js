const express = require('express');
const router = express.Router();
const { getAllDays, getDayByDate, createDay, updateDay } = require('../controllers/dayController');

// GET all days
router.get('/', getAllDays);

// GET a specific day by date string (must come before /:id)
router.get('/:date', getDayByDate);

// POST create a new day
router.post('/', createDay);

// PUT update a day by MongoDB _id
router.put('/:id', updateDay);

module.exports = router;
