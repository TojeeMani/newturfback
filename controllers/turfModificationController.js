const TurfModification = require('../models/TurfModification');
const Turf = require('../models/Turf');
const User = require('../models/User');
const ErrorResponse = require('../utils/errorResponse');
const asyncHandler = require('../middleware/async');
const { sendEmail } = require('../utils/universalEmailService');

// @desc    Get owner access information
// @route   GET /api/turf-modifications/check-access
// @access  Private (any authenticated user)
exports.checkOwnerAccess = asyncHandler(async (req, res, next) => {
  const user = await User.findById(req.user.id);
  
  let accessInfo = {
    userType: user.userType,
    canAddTurfs: user.userType === 'owner',
    canAddSports: user.userType === 'owner',
    message: ''
  };
  
  if (user.userType !== 'owner') {
    accessInfo.message = 'You need to have an owner account to add turfs or sports. Please contact support to upgrade your account.';
  } else {
    accessInfo.message = 'You have owner access and can submit turf addition requests.';
  }
  
  res.status(200).json({
    success: true,
    data: accessInfo
  });
});

// @desc    Get turf modification process information
// @route   GET /api/turf-modifications/process-info
// @access  Public
exports.getProcessInfo = asyncHandler(async (req, res, next) => {
  const processInfo = {
    title: "Turf Addition Process",
    description: "Learn how to add new turfs or sports to existing turfs",
    steps: [
      {
        step: 1,
        title: "Account Requirements",
        description: "You must have an owner account to add turfs or sports",
        action: "Contact support to upgrade your account if needed"
      },
      {
        step: 2,
        title: "Submit Request",
        description: "Use the forms to submit your turf addition or sports addition request",
        action: "Fill out the required information and submit"
      },
      {
        step: 3,
        title: "Admin Review",
        description: "Your request will be reviewed by our admin team",
        action: "Wait for approval notification"
      },
      {
        step: 4,
        title: "Implementation",
        description: "Once approved, your changes will be automatically implemented",
        action: "Your turf or sports will be added to the system"
      }
    ],
    requirements: [
      "Valid owner account",
      "Complete turf information",
      "Sports details (for sports addition)",
      "Images (for new turf addition)"
    ]
  };
  
  res.status(200).json({
    success: true,
    data: processInfo
  });
});

const cloudinary = require('../config/cloudinary');

// @desc    Submit new turf addition request
// @route   POST /api/turf-modifications/add-turf
// @access  Private (Owners only)
exports.submitAddTurfRequest = asyncHandler(async (req, res, next) => {
  const {
    name,
    description,
    address,
    city,
    state,
    pincode,
    contactNumber,
    email,
    sportTypes,
    amenities,
    rules,
    pricing,
    openingHours,
    slotDuration
  } = req.body;

  // Validate required fields
  if (!name || !description || !address || !city || !state || !pincode || 
      !contactNumber || !email || !sportTypes || !sportTypes.length || !pricing) {
    return next(new ErrorResponse('Please provide all required fields', 400));
  }

  // Get owner details
  const owner = await User.findById(req.user.id);
  if (!owner || owner.userType !== 'owner') {
    return next(new ErrorResponse('Only registered turf owners can submit new turf addition requests. Please ensure you are logged in as an owner account.', 403));
  }

  // Check if owner has any pending requests
  const pendingRequests = await TurfModification.countDocuments({
    ownerId: req.user.id,
    status: 'pending'
  });

  if (pendingRequests >= 3) {
    return next(new ErrorResponse('You can only have 3 pending turf modification requests at a time', 400));
  }

  // Process images if provided
  let processedImages = [];
  if (req.files && req.files.images) {
    const images = Array.isArray(req.files.images) ? req.files.images : [req.files.images];
    
    for (const image of images) {
      try {
        const result = await cloudinary.uploader.upload(image.tempFilePath, {
          folder: 'turf-modifications',
          resource_type: 'image'
        });
        
        processedImages.push({
          url: result.secure_url,
          publicId: result.public_id,
          caption: image.name || 'Turf Image'
        });
      } catch (error) {
        console.error('Error uploading image:', error);
      }
    }
  }

  // Create modification request
  const modificationRequest = await TurfModification.create({
    ownerId: req.user.id,
    ownerEmail: owner.email,
    ownerBusinessName: owner.businessName,
    modificationType: 'add_new_turf',
    newTurfData: {
      name,
      description,
      address,
      location: {
        type: 'Point',
        coordinates: req.body.coordinates || [0, 0] // Default coordinates, should be provided
      },
      city,
      state,
      pincode,
      contactNumber,
      email,
      sportTypes,
      amenities: amenities || [],
      rules: rules || [],
      images: processedImages,
      pricing,
      openingHours: openingHours || {
        monday: { open: '09:00', close: '22:00', isClosed: false },
        tuesday: { open: '09:00', close: '22:00', isClosed: false },
        wednesday: { open: '09:00', close: '22:00', isClosed: false },
        thursday: { open: '09:00', close: '22:00', isClosed: false },
        friday: { open: '09:00', close: '22:00', isClosed: false },
        saturday: { open: '09:00', close: '22:00', isClosed: false },
        sunday: { open: '09:00', close: '22:00', isClosed: false }
      },
      slotDuration: slotDuration || 60
    }
  });

  // Send notification email to admin
  try {
    await sendEmail({
      to: process.env.ADMIN_EMAIL || 'admin@turfease.com',
      subject: 'New Turf Addition Request Submitted',
      template: 'admin-turf-modification-notification',
      data: {
        ownerName: `${owner.firstName} ${owner.lastName}`,
        ownerEmail: owner.email,
        businessName: owner.businessName,
        turfName: name,
        modificationType: 'add_new_turf',
        sportTypes: sportTypes.join(', '),
        city,
        state
      }
    });
  } catch (emailError) {
    console.error('Error sending admin notification email:', emailError);
  }

  res.status(201).json({
    success: true,
    message: 'Turf addition request submitted successfully and is pending admin approval',
    data: {
      requestId: modificationRequest._id,
      status: modificationRequest.status,
      submittedAt: modificationRequest.submittedAt
    }
  });
});

// @desc    Submit request to add sports to existing turf
// @route   POST /api/turf-modifications/add-sports/:turfId
// @access  Private (Owners only)
exports.submitAddSportsRequest = asyncHandler(async (req, res, next) => {
  const { additionalSports } = req.body;
  const { turfId } = req.params;

  // Validate input
  if (!additionalSports || !Array.isArray(additionalSports) || additionalSports.length === 0) {
    return next(new ErrorResponse('Please provide sports to add', 400));
  }

  // Get owner details
  const owner = await User.findById(req.user.id);
  if (!owner || owner.userType !== 'owner') {
    return next(new ErrorResponse('Only registered turf owners can submit sports addition requests. Please ensure you are logged in as an owner account.', 403));
  }

  // Verify turf ownership
  const turf = await Turf.findById(turfId);
  if (!turf) {
    return next(new ErrorResponse('Turf not found', 404));
  }

  if (turf.owner.toString() !== req.user.id) {
    return next(new ErrorResponse('You can only add sports to your own turfs', 403));
  }

  // Check for duplicate sports
  const existingSports = turf.sportTypes || [];
  const duplicateSports = additionalSports.filter(sport => existingSports.includes(sport));
  
  if (duplicateSports.length > 0) {
    return next(new ErrorResponse(`Sports already available: ${duplicateSports.join(', ')}`, 400));
  }

  // Check if owner has any pending requests for this turf
  const pendingRequests = await TurfModification.countDocuments({
    ownerId: req.user.id,
    existingTurfId: turfId,
    status: 'pending'
  });

  if (pendingRequests > 0) {
    return next(new ErrorResponse('You already have a pending modification request for this turf', 400));
  }

  // Create modification request
  const modificationRequest = await TurfModification.create({
    ownerId: req.user.id,
    ownerEmail: owner.email,
    ownerBusinessName: owner.businessName,
    modificationType: 'add_sports_to_existing',
    existingTurfId: turfId,
    existingTurfName: turf.name,
    additionalSports
  });

  // Send notification email to admin
  try {
    await sendEmail({
      to: process.env.ADMIN_EMAIL || 'admin@turfease.com',
      subject: 'New Sports Addition Request Submitted',
      template: 'admin-turf-modification-notification',
      data: {
        ownerName: `${owner.firstName} ${owner.lastName}`,
        ownerEmail: owner.email,
        businessName: owner.businessName,
        turfName: turf.name,
        modificationType: 'add_sports_to_existing',
        additionalSports: additionalSports.join(', ')
      }
    });
  } catch (emailError) {
    console.error('Error sending admin notification email:', emailError);
  }

  res.status(201).json({
    success: true,
    message: 'Sports addition request submitted successfully and is pending admin approval',
    data: {
      requestId: modificationRequest._id,
      status: modificationRequest.status,
      submittedAt: modificationRequest.submittedAt,
      additionalSports
    }
  });
});

// @desc    Get owner's turf modification requests
// @route   GET /api/turf-modifications/my-requests
// @access  Private (Owners only)
exports.getOwnerModificationRequests = asyncHandler(async (req, res, next) => {
  const owner = await User.findById(req.user.id);
  if (!owner || owner.userType !== 'owner') {
    return next(new ErrorResponse('Only turf owners can view modification requests', 403));
  }

  const requests = await TurfModification.find({ ownerId: req.user.id })
    .populate('existingTurfId', 'name address')
    .sort({ submittedAt: -1 });

  res.status(200).json({
    success: true,
    count: requests.length,
    data: requests
  });
});

// @desc    Get single modification request details
// @route   GET /api/turf-modifications/:requestId
// @access  Private (Owners only)
exports.getModificationRequestDetails = asyncHandler(async (req, res, next) => {
  const { requestId } = req.params;

  const request = await TurfModification.findOne({
    _id: requestId,
    ownerId: req.user.id
  }).populate('existingTurfId', 'name address sportTypes');

  if (!request) {
    return next(new ErrorResponse('Modification request not found', 404));
  }

  res.status(200).json({
    success: true,
    data: request
  });
});

// @desc    Cancel pending modification request
// @route   PUT /api/turf-modifications/:requestId/cancel
// @access  Private (Owners only)
exports.cancelModificationRequest = asyncHandler(async (req, res, next) => {
  const { requestId } = req.params;

  const request = await TurfModification.findOne({
    _id: requestId,
    ownerId: req.user.id,
    status: 'pending'
  });

  if (!request) {
    return next(new ErrorResponse('Pending modification request not found', 404));
  }

  request.status = 'rejected';
  request.adminReview = {
    reviewedBy: req.user.id,
    reviewedAt: new Date(),
    decision: 'rejected',
    comments: 'Cancelled by owner'
  };

  await request.save();

  res.status(200).json({
    success: true,
    message: 'Modification request cancelled successfully'
  });
});

// @desc    Get available turfs for owner (for sports addition)
// @route   GET /api/turf-modifications/my-turfs
// @access  Private (Owners only)
exports.getOwnerTurfsForModification = asyncHandler(async (req, res, next) => {
  const owner = await User.findById(req.user.id);
  if (!owner || owner.userType !== 'owner') {
    return next(new ErrorResponse('Only turf owners can access this feature', 403));
  }

  const turfs = await Turf.find({ owner: req.user.id })
    .select('name address sportTypes city state')
    .sort({ createdAt: -1 });

  res.status(200).json({
    success: true,
    count: turfs.length,
    data: turfs
  });
});