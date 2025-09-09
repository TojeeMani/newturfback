const express = require('express');
const { body } = require('express-validator');
const {
  getAllUsers,
  getAllOwnersWithStatus,
  getPendingOwners,
  updateOwnerApproval,
  getAllOwners,
  getOwnerDetails,
  getTurfsWithPendingChanges,
  approveTurfChanges
} = require('../controllers/adminController');
const { protect, authorize } = require('../middleware/auth');

const router = express.Router();

// Protect all routes and authorize admin only
router.use(protect);
router.use(authorize('admin'));

// Validation middleware
const approvalValidation = [
  body('status').isIn(['approved', 'rejected']).withMessage('Status must be either "approved" or "rejected"'),
  body('notes').optional().isString().withMessage('Notes must be a string')
];

const turfChangeApprovalValidation = [
  body('status').isIn(['approved', 'rejected']).withMessage('Status must be either "approved" or "rejected"'),
  body('notes').optional().isString().withMessage('Notes must be a string')
];

// Routes
router.get('/users', getAllUsers);
router.get('/all-owners', getAllOwnersWithStatus);
router.get('/pending-owners', getPendingOwners);
router.get('/owners', getAllOwners);
router.get('/owners/:id', getOwnerDetails);
router.put('/owners/:id/approval', approvalValidation, updateOwnerApproval);

// Turf management routes
router.get('/turfs/pending-changes', getTurfsWithPendingChanges);
router.put('/turfs/:id/approve-changes', turfChangeApprovalValidation, approveTurfChanges);

module.exports = router; 