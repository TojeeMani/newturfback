const express = require('express');
const { protect, authorize } = require('../middleware/auth');

const router = express.Router();

// All routes require authentication
router.use(protect);

// @desc    Get user profile
// @route   GET /api/users/profile
// @access  Private
router.get('/profile', (req, res) => {
  res.status(200).json({
    success: true,
    data: req.user
  });
});

// @desc    Update user profile
// @route   PUT /api/users/profile
// @access  Private
router.put('/profile', (req, res) => {
  res.status(200).json({
    success: true,
    message: 'Profile update endpoint - to be implemented'
  });
});

// @desc    Get all users (Admin only)
// @route   GET /api/users
// @access  Private/Admin
router.get('/', authorize('admin'), (req, res) => {
  res.status(200).json({
    success: true,
    message: 'Get all users endpoint - to be implemented'
  });
});

module.exports = router; 