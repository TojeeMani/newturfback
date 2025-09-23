const express = require('express');
const { protect } = require('../middleware/auth');
const { getTurfReviews, canReview, createReview } = require('../controllers/reviewController');

const router = express.Router({ mergeParams: true });

// Public
router.get('/', getTurfReviews);

// Private
router.get('/can', protect, canReview);
router.post('/', protect, createReview);

module.exports = router;


