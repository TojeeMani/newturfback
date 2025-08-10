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
  approveTurf
} = require('../controllers/turfController');

const router = express.Router();

// Public routes
router.get('/', getTurfs);
router.get('/nearby', getNearbyTurfs);
router.get('/:id', getTurf);

// Protected routes
router.use(protect);

// Owner routes
router.get('/owner/my', authorize('owner'), getMyTurfs);
router.post('/', authorize('owner'), createTurf);
router.put('/:id', authorize('owner'), updateTurf);
router.delete('/:id', authorize('owner'), deleteTurf);

// Admin routes
router.get('/admin/all', authorize('admin'), getAllTurfsForAdmin);
router.put('/:id/approve', authorize('admin'), approveTurf);

module.exports = router; 