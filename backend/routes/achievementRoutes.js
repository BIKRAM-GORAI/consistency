const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/achievementController');
const { createAchievementValidation, updateAchievementValidation } = require('../middleware/validation');
const { authenticateToken } = require('../middleware/auth');

router.get('/', authenticateToken, ctrl.getAllAchievements);
router.get('/day/:dayId', authenticateToken, ctrl.getAchievementsByDay);
router.get('/user/:userId', authenticateToken, ctrl.getAchievementsByUser);

router.post('/', authenticateToken, createAchievementValidation, ctrl.createAchievement);
router.put('/:id', authenticateToken, updateAchievementValidation, ctrl.updateAchievement);
router.delete('/:id', authenticateToken, ctrl.deleteAchievement);

module.exports = router;
