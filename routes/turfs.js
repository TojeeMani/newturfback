const express = require('express');
const { protect, authorize } = require('../middleware/auth');
const {
  getTurfs,
  getTurf,
  createTurf,
  updateTurf,
  deleteTurf,
  getMyTurfs,
  getNearbyTurfs,
  getAllTurfsForAdmin,
  approveTurf,
  checkSlotAvailability,
  getAvailableSlots,
  bookSlot,
  cancelSlotBooking,
  getTurfBookings,
  getOwnerBookings,
  allocateSlotsForDay,
  getOwnerAnalytics,
  getOwnerCustomers
} = require('../controllers/turfController');

const router = express.Router();

// Public routes
router.get('/', getTurfs);
router.get('/nearby', getNearbyTurfs);
router.get('/:id', getTurf);
router.get('/:id/slots/check', checkSlotAvailability);
router.get('/:id/slots/available', getAvailableSlots);

// Protected routes
router.use(protect);

// Owner routes
router.get('/owner/my', authorize('owner'), getMyTurfs);
router.get('/owner/bookings', authorize('owner'), getOwnerBookings);
router.get('/owner/analytics', authorize('owner'), getOwnerAnalytics);
router.get('/owner/customers', authorize('owner'), getOwnerCustomers);
router.post('/', authorize('owner'), createTurf);
router.put('/:id', authorize('owner'), updateTurf);
router.delete('/:id', authorize('owner'), deleteTurf);
router.get('/:id/bookings', authorize('owner'), getTurfBookings);
router.post('/:id/slots/book', authorize('owner'), bookSlot);
router.post('/:id/slots/allocate', authorize('owner'), allocateSlotsForDay);
router.delete('/:id/slots/cancel', authorize('owner'), cancelSlotBooking);

// Admin routes
router.get('/admin/all', authorize('admin'), getAllTurfsForAdmin);
router.put('/:id/approve', authorize('admin'), approveTurf);

module.exports = router;