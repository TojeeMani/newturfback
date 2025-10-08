const Request = require('../models/Request');
const User = require('../models/User');
const Turf = require('../models/Turf');
const asyncHandler = require('../middleware/async');
const ErrorResponse = require('../utils/errorResponse');
const { uploadToCloudinary } = require('../services/imageUploadService');
const { sendEmail, sendRequestApprovalEmail, sendRequestRejectionEmail } = require('../utils/universalEmailService');
const { createRequestStatusNotification } = require('./notificationController');

// @desc    Create new request (turf or sport)
// @route   POST /api/owner/add-request
// @access  Private (Owner only)
exports.createRequest = asyncHandler(async (req, res, next) => {
  // Check if user is an owner
  if (req.user.role !== 'owner') {
    return next(new ErrorResponse('Only owners can create requests', 403));
  }

  const { type } = req.body;

  // Validate request type
  if (!['newTurf', 'newSport'].includes(type)) {
    return next(new ErrorResponse('Invalid request type', 400));
  }

  let requestData = {
    ownerId: req.user.id,
    type,
    data: {
      contactNumber: req.body.contactNumber,
      pricing: req.body.pricing
    }
  };

  // Handle different request types
  if (type === 'newTurf') {
    // Validate required fields for new turf
    const requiredFields = ['turfName', 'turfDescription', 'location', 'availableSports', 'turfImages'];
    for (const field of requiredFields) {
      if (!req.body[field]) {
        return next(new ErrorResponse(`${field} is required for new turf request`, 400));
      }
    }

    // Upload turf images to Cloudinary
    const uploadedImages = [];
    if (req.body.turfImages && req.body.turfImages.length > 0) {
      for (const image of req.body.turfImages) {
        const result = await uploadToCloudinary(image, 'turf-requests');
        uploadedImages.push(result.secure_url);
      }
    }

    requestData.data = {
      ...requestData.data,
      turfName: req.body.turfName,
      turfDescription: req.body.turfDescription,
      location: req.body.location,
      availableSports: req.body.availableSports,
      turfImages: uploadedImages
    };
  } else if (type === 'newSport') {
    // Validate required fields for new sport
    const requiredFields = ['turfId', 'sportName', 'sportCategory'];
    for (const field of requiredFields) {
      if (!req.body[field]) {
        return next(new ErrorResponse(`${field} is required for new sport request`, 400));
      }
    }

    // Verify the turf belongs to the owner
    const turf = await Turf.findOne({ _id: req.body.turfId, ownerId: req.user.id });
    if (!turf) {
      return next(new ErrorResponse('Turf not found or does not belong to you', 404));
    }

    // Upload sport images if provided
    const uploadedImages = [];
    if (req.body.sportImages && req.body.sportImages.length > 0) {
      for (const image of req.body.sportImages) {
        const result = await uploadToCloudinary(image, 'sport-requests');
        uploadedImages.push(result.secure_url);
      }
    }

    requestData.data = {
      ...requestData.data,
      turfId: req.body.turfId,
      sportName: req.body.sportName,
      sportCategory: req.body.sportCategory,
      sportDescription: req.body.sportDescription || '',
      sportImages: uploadedImages
    };
  }

  const request = await Request.create(requestData);

  // Send notification for new request submission
  try {
    await createRequestStatusNotification(req.user.id, {
      requestId: request._id,
      type: 'owner',
      status: 'pending',
      requestType: request.type === 'newTurf' ? 'turf' : 'sport',
      requestName: request.type === 'newTurf' ? request.data.turfName : request.data.sportName,
      ownerEmail: req.user.email
    });
  } catch (notificationError) {
    console.error('Error sending notification:', notificationError);
  }

  res.status(201).json({
    success: true,
    data: request,
    message: 'Your request has been sent for admin approval.'
  });
});

// @desc    Get all pending requests (admin only)
// @route   GET /api/admin/requests
// @access  Private (Admin only)
exports.getPendingRequests = asyncHandler(async (req, res, next) => {
  // Check if user is an admin
  if (req.user.role !== 'admin') {
    return next(new ErrorResponse('Only admins can view requests', 403));
  }

  const { type, status } = req.query;
  
  let query = {};
  if (type) query.type = type;
  if (status) query.status = status;

  const requests = await Request.find(query)
    .populate('ownerId', 'firstName lastName email phone')
    .populate('reviewedBy', 'firstName lastName')
    .populate('data.turfId', 'name location')
    .sort({ createdAt: -1 });

  // Separate by type for easier frontend handling
  const newTurfRequests = requests.filter(req => req.type === 'newTurf');
  const newSportRequests = requests.filter(req => req.type === 'newSport');

  res.status(200).json({
    success: true,
    data: {
      allRequests: requests,
      newTurfRequests,
      newSportRequests
    }
  });
});

// @desc    Approve request
// @route   PATCH /api/admin/request/:id/approve
// @access  Private (Admin only)
exports.approveRequest = asyncHandler(async (req, res, next) => {
  // Check if user is an admin
  if (req.user.role !== 'admin') {
    return next(new ErrorResponse('Only admins can approve requests', 403));
  }

  const request = await Request.findById(req.params.id)
    .populate('ownerId', 'firstName lastName email')
    .populate('data.turfId');

  if (!request) {
    return next(new ErrorResponse('Request not found', 404));
  }

  if (request.status !== 'pending') {
    return next(new ErrorResponse('Request has already been processed', 400));
  }

  // Process based on request type
  if (request.type === 'newTurf') {
    // Create new turf
    const newTurfData = {
      name: request.data.turfName,
      description: request.data.turfDescription,
      location: request.data.location,
      contactNumber: request.data.contactNumber,
      sports: request.data.availableSports,
      images: request.data.turfImages,
      pricing: request.data.pricing,
      ownerId: request.ownerId,
      status: 'active' // Make it active since it's approved
    };

    const newTurf = await Turf.create(newTurfData);
    
    // Update request
    request.status = 'approved';
    request.reviewedBy = req.user.id;
    request.reviewedAt = new Date();
    await request.save();

    // Send approval email
    await sendRequestApprovalEmail(request.ownerId.email, request.ownerId.firstName, 'turf', newTurf.name);

    // Send in-app notification
    try {
      await createRequestStatusNotification(request.ownerId._id, {
        requestId: request._id,
        type: 'owner',
        status: 'approved',
        requestType: 'turf',
        requestName: newTurf.name,
        ownerEmail: request.ownerId.email
      });
    } catch (notificationError) {
      console.error('Error sending notification:', notificationError);
    }

  } else if (request.type === 'newSport') {
    // Add sport to existing turf
    const turf = await Turf.findById(request.data.turfId);
    if (!turf) {
      return next(new ErrorResponse('Associated turf not found', 404));
    }

    // Add new sport to the turf
    const newSport = {
      name: request.data.sportName,
      category: request.data.sportCategory,
      description: request.data.sportDescription,
      images: request.data.sportImages,
      pricing: request.data.pricing
    };

    turf.sports.push(newSport);
    await turf.save();

    // Update request
    request.status = 'approved';
    request.reviewedBy = req.user.id;
    request.reviewedAt = new Date();
    await request.save();

    // Send approval email
    await sendRequestApprovalEmail(request.ownerId.email, request.ownerId.firstName, 'sport', request.data.sportName);

    // Send in-app notification
    try {
      await createRequestStatusNotification(request.ownerId._id, {
        requestId: request._id,
        type: 'owner',
        status: 'approved',
        requestType: 'sport',
        requestName: request.data.sportName,
        ownerEmail: request.ownerId.email
      });
    } catch (notificationError) {
      console.error('Error sending notification:', notificationError);
    }
  }

  res.status(200).json({
    success: true,
    data: request,
    message: 'Request approved successfully'
  });
});

// @desc    Reject request
// @route   PATCH /api/admin/request/:id/reject
// @access  Private (Admin only)
exports.rejectRequest = asyncHandler(async (req, res, next) => {
  // Check if user is an admin
  if (req.user.role !== 'admin') {
    return next(new ErrorResponse('Only admins can reject requests', 403));
  }

  const { rejectionReason } = req.body;

  if (!rejectionReason || rejectionReason.trim().length === 0) {
    return next(new ErrorResponse('Rejection reason is required', 400));
  }

  const request = await Request.findById(req.params.id)
    .populate('ownerId', 'firstName lastName email');

  if (!request) {
    return next(new ErrorResponse('Request not found', 404));
  }

  if (request.status !== 'pending') {
    return next(new ErrorResponse('Request has already been processed', 400));
  }

  // Update request
  request.status = 'rejected';
  request.reviewedBy = req.user.id;
  request.reviewedAt = new Date();
  request.rejectionReason = rejectionReason.trim();
  await request.save();

  // Send rejection email
  await sendRequestRejectionEmail(
    request.ownerId.email, 
    request.ownerId.firstName, 
    request.type === 'newTurf' ? 'turf' : 'sport',
    rejectionReason
  );

  // Send in-app notification
  try {
    await createRequestStatusNotification(request.ownerId._id, {
      requestId: request._id,
      type: 'owner',
      status: 'rejected',
      requestType: request.type === 'newTurf' ? 'turf' : 'sport',
      requestName: request.type === 'newTurf' ? request.data.turfName : request.data.sportName,
      ownerEmail: request.ownerId.email,
      adminNotes: rejectionReason
    });
  } catch (notificationError) {
    console.error('Error sending notification:', notificationError);
  }

  res.status(200).json({
    success: true,
    data: request,
    message: 'Request rejected successfully'
  });
});

// @desc    Get owner's requests
// @route   GET /api/owner/my-requests
// @access  Private (Owner only)
exports.getOwnerRequests = asyncHandler(async (req, res, next) => {
  // Check if user is an owner
  if (req.user.role !== 'owner') {
    return next(new ErrorResponse('Only owners can view their requests', 403));
  }

  const requests = await Request.find({ ownerId: req.user.id })
    .populate('reviewedBy', 'firstName lastName')
    .populate('data.turfId', 'name')
    .sort({ createdAt: -1 });

  res.status(200).json({
    success: true,
    data: requests
  });
});