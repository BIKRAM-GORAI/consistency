const express = require('express');
const router = express.Router();
const { getAllDays, getDayByDate, getDayById, createDay, updateDay, deleteDay, getScratchpad, saveScratchpad, getGraceLimits, applyGrace } = require('../controllers/dayController');
const { createDayValidation, updateDayValidation } = require('../middleware/validation');
const { authenticateToken } = require('../middleware/auth');

// GET all days
router.get('/', authenticateToken, getAllDays);

// GET Grace Limits (must come before dynamic date selector)
router.get('/grace-limits', authenticateToken, getGraceLimits);

// GET scratchpad (Must come before generic dynamic routes if conflict, but it is /:id/scratchpad, which does not conflict with /id/:id or /:date since it has two segments)
router.get('/:id/scratchpad', authenticateToken, getScratchpad);

// PUT scratchpad
router.put('/:id/scratchpad', authenticateToken, saveScratchpad);

// GET a specific day by MongoDB _id
router.get('/id/:id', authenticateToken, getDayById);

// GET a specific day by date string (must come before /:id)
router.get('/:date', authenticateToken, getDayByDate);

// POST create a new day
router.post('/', authenticateToken, createDayValidation, createDay);

// POST apply Grace Day streak protection
router.post('/:id/apply-grace', authenticateToken, applyGrace);

// PUT update a day by MongoDB _id
router.put('/:id', authenticateToken, updateDayValidation, updateDay);

// DELETE a day by MongoDB _id
router.delete('/:id', authenticateToken, deleteDay);

module.exports = router;
