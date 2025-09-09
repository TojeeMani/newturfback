const express = require('express');
const { protect, authorize } = require('../middleware/auth');
const {
  getUserBookings,
  getBooking,
  createBooking,
  cancelBooking,
  checkInBooking
} = require('../controllers/bookingController');

const router = express.Router();

// All booking routes require authentication
router.use(protect);

// User bookings
router.get('/', getUserBookings);
router.get('/:id', getBooking);
router.post('/', createBooking);
router.delete('/:id', cancelBooking);

// Owner actions
router.post('/checkin', authorize('owner'), checkInBooking);

module.exports = router;