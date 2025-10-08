const express = require('express');
const router = express.Router();
const { protect, authorize } = require('../middleware/auth');
const {
  getAllTurfModifications,
  getTurfModificationDetails,
  reviewTurfModification
} = require('../controllers/adminController');

// All routes require admin authentication
router.use(protect, authorize('admin'));

// @route   GET /api/admin/turf-modifications
// @desc    Get all turf modification requests with filters and pagination
// @access  Private (Admin only)
router.get('/turf-modifications', getAllTurfModifications);

// @route   GET /api/admin/turf-modifications/:id
// @desc    Get single turf modification request details
// @access  Private (Admin only)
router.get('/turf-modifications/:id', getTurfModificationDetails);

// @route   PUT /api/admin/turf-modifications/:id/review
// @desc    Approve or reject turf modification request
// @access  Private (Admin only)
router.put('/turf-modifications/:id/review', reviewTurfModification);

module.exports = router;