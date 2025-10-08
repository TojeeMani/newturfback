const express = require('express');
const router = express.Router();
const { protect, authorize } = require('../middleware/auth');
const fileUpload = require('express-fileupload');

const {
  submitAddTurfRequest,
  submitAddSportsRequest,
  getOwnerModificationRequests,
  getModificationRequestDetails,
  cancelModificationRequest,
  getOwnerTurfsForModification,
  checkOwnerAccess,
  getProcessInfo
} = require('../controllers/turfModificationController');

// Public route - get process information
router.get('/process-info', getProcessInfo);

// File upload middleware
const uploadMiddleware = fileUpload({
  createParentPath: true,
  limits: { 
    fileSize: 10 * 1024 * 1024 // 10MB max file size
  },
  abortOnLimit: true,
  responseOnLimit: 'File size too large. Maximum file size is 10MB.'
});

// Owner routes
router.use(protect); // All routes require authentication

// Check owner access (available to any authenticated user)
router.get('/check-access', checkOwnerAccess);

// Submit new turf addition request (with file upload)
router.post('/add-turf', 
  authorize('owner'), 
  uploadMiddleware,
  submitAddTurfRequest
);

// Submit request to add sports to existing turf
router.post('/add-sports/:turfId', 
  authorize('owner'), 
  submitAddSportsRequest
);

// Get owner's turf modification requests
router.get('/my-requests', 
  authorize('owner'), 
  getOwnerModificationRequests
);

// Get single modification request details
router.get('/:requestId', 
  authorize('owner'), 
  getModificationRequestDetails
);

// Cancel pending modification request
router.put('/:requestId/cancel', 
  authorize('owner'), 
  cancelModificationRequest
);

// Get available turfs for owner (for sports addition)
router.get('/my-turfs', 
  authorize('owner'), 
  getOwnerTurfsForModification
);

module.exports = router;