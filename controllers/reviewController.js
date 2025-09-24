const Review = require('../models/Review');
const Booking = require('../models/Booking');
const Turf = require('../models/Turf');
const mongoose = require('mongoose');
const asyncHandler = require('../middleware/async');
const ErrorResponse = require('../utils/errorResponse');

// @desc    Get reviews for a turf
// @route   GET /api/turfs/:id/reviews
// @access  Public
exports.getTurfReviews = asyncHandler(async (req, res) => {
  const reviews = await Review.find({ turfId: req.params.id })
    .populate('userId', 'name')
    .populate('bookingId', 'bookingDate')
    .sort('-createdAt');
  
  res.status(200).json({ 
    success: true, 
    count: reviews.length,
    data: reviews 
  });
});

// @desc    Check if current user can review this turf
// @route   GET /api/turfs/:id/reviews/can
// @access  Private
exports.canReview = asyncHandler(async (req, res, next) => {
  const userId = req.user.id;
  const turfId = req.params.id;
  
  // Find completed bookings for this user and turf
  const now = new Date();
  const completedBookings = await Booking.find({
    turfId,
    customerId: userId,
    status: 'completed',
    bookingDate: { $lte: now }
  }).select('_id bookingDate');
  
  if (completedBookings.length === 0) {
    return res.status(200).json({ 
      success: true, 
      data: { 
        eligible: false, 
        reason: 'No completed bookings found',
        completedBookings: []
      } 
    });
  }
  
  // Check which bookings already have reviews
  const reviewedBookingIds = await Review.find({
    turfId,
    userId,
    bookingId: { $in: completedBookings.map(b => b._id) }
  }).distinct('bookingId');
  
  // Find bookings that can be reviewed (completed but not yet reviewed)
  const eligibleBookings = completedBookings.filter(
    booking => !reviewedBookingIds.some(reviewedId => reviewedId.toString() === booking._id.toString())
  );
  
  res.status(200).json({ 
    success: true, 
    data: { 
      eligible: eligibleBookings.length > 0,
      eligibleBookings: eligibleBookings,
      completedBookings: completedBookings.length,
      reviewedBookings: reviewedBookingIds.length
    } 
  });
});

// @desc    Create or update a review (upsert)
// @route   POST /api/turfs/:id/reviews
// @access  Private
exports.createReview = asyncHandler(async (req, res, next) => {
  const userId = req.user.id;
  const turfId = req.params.id;
  const { rating, comment, bookingId } = req.body || {};

  console.log('📥 Review submission received:', { userId, turfId, rating, comment, bookingId });

  const r = parseInt(rating, 10);
  if (!r || r < 1 || r > 5) {
    console.log('❌ Rating validation failed:', { rating, parsed: r });
    return next(new ErrorResponse(`Rating must be between 1-5 (received: ${rating})`, 400));
  }

  if (!bookingId) {
    console.log('❌ Missing bookingId');
    return next(new ErrorResponse('Booking ID is required', 400));
  }

  // Verify the booking exists and belongs to the user
  const booking = await Booking.findOne({
    _id: bookingId,
    turfId,
    customerId: userId,
    status: 'completed'
  });

  console.log('🔍 Booking lookup result:', { 
    found: !!booking, 
    bookingId, 
    turfId, 
    userId,
    bookingStatus: booking?.status 
  });

  if (!booking) {
    return next(new ErrorResponse('Invalid booking or booking not completed', 403));
  }

  // Check if booking date has passed
  const now = new Date();
  if (booking.bookingDate > now) {
    return next(new ErrorResponse('Cannot review future bookings', 403));
  }

  // Check if review already exists for this booking
  const existingReview = await Review.findOne({ bookingId });
  if (existingReview) {
    console.log('❌ Review already exists for this booking');
    return next(new ErrorResponse('You have already reviewed this booking', 400));
  }

  // Create the review
  const review = await Review.create({
    turfId,
    userId,
    bookingId,
    rating: r,
    comment: comment || ''
  });

  // Populate the review with user and booking info
  await review.populate('userId', 'name');
  await review.populate('bookingId', 'bookingDate');

  // Recompute turf rating and totalReviews
  const stats = await Review.aggregate([
    { $match: { turfId: new mongoose.Types.ObjectId(turfId) } },
    { 
      $group: { 
        _id: '$turfId', 
        avgRating: { $avg: '$rating' }, 
        count: { $sum: 1 } 
      } 
    }
  ]);

  const { avgRating, count } = stats[0] || { avgRating: r, count: 1 };
  await Turf.findByIdAndUpdate(turfId, { 
    rating: Math.round(avgRating * 10) / 10, 
    totalReviews: count 
  });

  res.status(201).json({ 
    success: true, 
    message: 'Review created successfully',
    data: review 
  });
});


