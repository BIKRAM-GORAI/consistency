const express = require('express');
const router = express.Router();
const reviewController = require('../controllers/reviewController');

router.post('/', reviewController.submitReview);
router.get('/', reviewController.getReviews);
router.get('/access-mode', reviewController.getAccessMode);

module.exports = router;
