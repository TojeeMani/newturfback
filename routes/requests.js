const express = require('express');
const { protect, authorize } = require('../middleware/auth');
const {
  createRequest,
  getPendingRequests,
  approveRequest,
  rejectRequest,
  getOwnerRequests
} = require('../controllers/requestController');

const router = express.Router();

// Owner routes
router.post('/owner/add-request', protect, authorize('owner'), createRequest);
router.get('/owner/my-requests', protect, authorize('owner'), getOwnerRequests);

// Admin routes
router.get('/admin/requests', protect, getPendingRequests);
router.patch('/admin/request/:id/approve', protect, approveRequest);
router.patch('/admin/request/:id/reject', protect, rejectRequest);

module.exports = router;