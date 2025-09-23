const Review = require('../models/Review');
const Booking = require('../models/Booking');
const Turf = require('../models/Turf');
const asyncHandler = require('../middleware/async');
const ErrorResponse = require('../utils/errorResponse');

// @desc    Get reviews for a turf
// @route   GET /api/turfs/:id/reviews
// @access  Public
exports.getTurfReviews = asyncHandler(async (req, res) => {
  const reviews = await Review.find({ turfId: req.params.id }).sort('-createdAt');
  res.status(200).json({ success: true, data: reviews });
});

// @desc    Check if current user can review this turf
// @route   GET /api/turfs/:id/reviews/can
// @access  Private
exports.canReview = asyncHandler(async (req, res, next) => {
  const userId = req.user.id;
  const turfId = req.params.id;
  // Has completed booking in the past?
  const now = new Date();
  const completed = await Booking.findOne({
    turfId,
    customerId: userId,
    status: 'completed',
    bookingDate: { $lte: now }
  });
  const already = await Review.findOne({ turfId, userId });
  res.status(200).json({ success: true, data: { eligible: !!completed && !already } });
});

// @desc    Create or update a review (upsert)
// @route   POST /api/turfs/:id/reviews
// @access  Private
exports.createReview = asyncHandler(async (req, res, next) => {
  const userId = req.user.id;
  const turfId = req.params.id;
  const { rating, comment } = req.body || {};

  const r = parseInt(rating, 10);
  if (!r || r < 1 || r > 5) return next(new ErrorResponse('Rating must be 1-5', 400));

  // Must have a completed booking for this turf whose end time is in the past
  const now = new Date();
  const completed = await Booking.findOne({
    turfId,
    customerId: userId,
    status: 'completed',
    bookingDate: { $lte: now }
  });
  if (!completed) return next(new ErrorResponse('You can review only after completing a booking', 403));

  // Upsert review
  const review = await Review.findOneAndUpdate(
    { turfId, userId },
    { $set: { rating: r, comment: comment || '' } },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );

  // Recompute turf rating and totalReviews
  const agg = await Review.aggregate([
    { $match: { turfId: Review.db.Types.ObjectId.createFromHexString(turfId) } },
    { $group: { _id: '$turfId', avgRating: { $avg: '$rating' }, count: { $sum: 1 } } }
  ]);
  const stats = agg[0] || { avgRating: r, count: 1 };
  await Turf.findByIdAndUpdate(turfId, { rating: Math.round(stats.avgRating * 10) / 10, totalReviews: stats.count });

  res.status(201).json({ success: true, data: review });
});


