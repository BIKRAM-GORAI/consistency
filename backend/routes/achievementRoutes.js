const express = require('express');
const router  = express.Router();
const {
  getAllAchievements,
  getAchievementsByDay,
  getAchievementsByUser,
  createAchievement,
  updateAchievement,
  deleteAchievement,
} = require('../controllers/achievementController');

// GET all achievements for a user  ?userId=...
router.get('/',                  getAllAchievements);

// GET achievements for a specific day card
router.get('/day/:dayId',        getAchievementsByDay);

// GET public achievements for any user (group member view)
router.get('/user/:userId',      getAchievementsByUser);

// POST create
router.post('/',                 createAchievement);

// PUT update
router.put('/:id',               updateAchievement);

// DELETE
router.delete('/:id',            deleteAchievement);

module.exports = router;
