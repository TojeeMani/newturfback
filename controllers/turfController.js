const Turf = require('../models/Turf');
const asyncHandler = require('../middleware/async');
const ErrorResponse = require('../utils/errorResponse');
const imageUploadService = require('../services/imageUploadService');

// @desc    Get all turfs
// @route   GET /api/turfs
// @access  Public
exports.getTurfs = asyncHandler(async (req, res, next) => {
  let query;

  // Copy req.query
  const reqQuery = { ...req.query };

  // Fields to exclude
  const removeFields = ['select', 'sort', 'page', 'limit'];

  // Loop over removeFields and delete them from reqQuery
  removeFields.forEach(param => delete reqQuery[param]);

  // Create query string
  let queryStr = JSON.stringify(reqQuery);

  // Create operators ($gt, $gte, etc)
  queryStr = queryStr.replace(/\b(gt|gte|lt|lte|in)\b/g, match => `$${match}`);

  // Finding resource
  query = Turf.find(JSON.parse(queryStr));

  // Select Fields
  if (req.query.select) {
    const fields = req.query.select.split(',').join(' ');
    query = query.select(fields);
  }

  // Sort
  if (req.query.sort) {
    const sortBy = req.query.sort.split(',').join(' ');
    query = query.sort(sortBy);
  } else {
    query = query.sort('-createdAt');
  }

  // Pagination
  const page = parseInt(req.query.page, 10) || 1;
  const limit = parseInt(req.query.limit, 10) || 25;
  const startIndex = (page - 1) * limit;
  const endIndex = page * limit;
  const total = await Turf.countDocuments();

  query = query.skip(startIndex).limit(limit);

  // Executing query
  const turfs = await query;

  // Pagination result
  const pagination = {};

  if (endIndex < total) {
    pagination.next = {
      page: page + 1,
      limit
    };
  }

  if (startIndex > 0) {
    pagination.prev = {
      page: page - 1,
      limit
    };
  }

  res.status(200).json({
    success: true,
    count: turfs.length,
    pagination,
    data: turfs
  });
});

// @desc    Get single turf
// @route   GET /api/turfs/:id
// @access  Public
exports.getTurf = asyncHandler(async (req, res, next) => {
  const turf = await Turf.findById(req.params.id);

  if (!turf) {
    return next(new ErrorResponse(`Turf not found with id of ${req.params.id}`, 404));
  }

  res.status(200).json({
    success: true,
    data: turf
  });
});

// @desc    Create new turf
// @route   POST /api/turfs
// @access  Private/Owner
exports.createTurf = asyncHandler(async (req, res, next) => {
  // Add owner to req.body
  req.body.ownerId = req.user.id;

  // Validate location data
  if (!req.body.location || !req.body.location.address || !req.body.location.coordinates) {
    return next(new ErrorResponse('Location with address and coordinates is required', 400));
  }

  // Validate coordinates
  const { lat, lng } = req.body.location.coordinates;
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) {
    return next(new ErrorResponse('Invalid coordinates', 400));
  }

  // Validate price
  if (!req.body.pricePerHour || req.body.pricePerHour < 0) {
    return next(new ErrorResponse('Valid price per hour is required', 400));
  }

  // Handle image uploads if provided
  let imageUrls = [];
  if (req.body.images && req.body.images.length > 0) {
    try {
      // Upload images to Cloudinary
      const uploadResult = await imageUploadService.uploadMultipleImages(req.body.images, 'turfs');
      
      if (!uploadResult.success) {
        return next(new ErrorResponse('Failed to upload images', 500));
      }

      // Extract URLs from successful uploads
      imageUrls = uploadResult.images.map(img => img.url);
      
      if (imageUrls.length === 0) {
        return next(new ErrorResponse('No images were uploaded successfully', 500));
      }

      console.log(`✅ Uploaded ${imageUrls.length} images for turf`);
    } catch (error) {
      console.error('❌ Image upload error:', error);
      return next(new ErrorResponse('Failed to upload images', 500));
    }
  }

  // Validate that we have at least one image
  if (imageUrls.length === 0) {
    return next(new ErrorResponse('At least one image is required', 400));
  }

  // Create turf with image URLs
  const turfData = {
    ...req.body,
    images: imageUrls
  };

  const turf = await Turf.create(turfData);

  res.status(201).json({
    success: true,
    data: turf,
    message: `Turf created successfully with ${imageUrls.length} images`
  });
});

// @desc    Update turf
// @route   PUT /api/turfs/:id
// @access  Private/Owner
exports.updateTurf = asyncHandler(async (req, res, next) => {
  let turf = await Turf.findById(req.params.id);

  if (!turf) {
    return next(new ErrorResponse(`Turf not found with id of ${req.params.id}`, 404));
  }

  // Make sure user is turf owner
  if (turf.ownerId.toString() !== req.user.id && req.user.role !== 'admin') {
    return next(new ErrorResponse(`User ${req.user.id} is not authorized to update this turf`, 401));
  }

  // Validate location data if provided
  if (req.body.location) {
    if (!req.body.location.address || !req.body.location.coordinates) {
      return next(new ErrorResponse('Location must include address and coordinates', 400));
    }

    const { lat, lng } = req.body.location.coordinates;
    if (lat < -90 || lat > 90 || lng < -180 || lng > 180) {
      return next(new ErrorResponse('Invalid coordinates', 400));
    }
  }

  // Validate price if provided
  if (req.body.pricePerHour !== undefined && req.body.pricePerHour < 0) {
    return next(new ErrorResponse('Price cannot be negative', 400));
  }

  // Handle image uploads if new images are provided
  if (req.body.images && req.body.images.length > 0) {
    try {
      // Upload new images to Cloudinary
      const uploadResult = await imageUploadService.uploadMultipleImages(req.body.images, 'turfs');
      
      if (!uploadResult.success) {
        return next(new ErrorResponse('Failed to upload new images', 500));
      }

      // Extract URLs from successful uploads
      const newImageUrls = uploadResult.images.map(img => img.url);
      
      if (newImageUrls.length === 0) {
        return next(new ErrorResponse('No new images were uploaded successfully', 500));
      }

      // Replace existing images with new ones
      req.body.images = newImageUrls;
      
      console.log(`✅ Updated turf with ${newImageUrls.length} new images`);
    } catch (error) {
      console.error('❌ Image upload error during update:', error);
      return next(new ErrorResponse('Failed to upload new images', 500));
    }
  }

  turf = await Turf.findByIdAndUpdate(req.params.id, req.body, {
    new: true,
    runValidators: true
  });

  res.status(200).json({
    success: true,
    data: turf,
    message: req.body.images ? 'Turf updated successfully with new images' : 'Turf updated successfully'
  });
});

// @desc    Delete turf
// @route   DELETE /api/turfs/:id
// @access  Private/Owner
exports.deleteTurf = asyncHandler(async (req, res, next) => {
  const turf = await Turf.findById(req.params.id);

  if (!turf) {
    return next(new ErrorResponse(`Turf not found with id of ${req.params.id}`, 404));
  }

  // Make sure user is turf owner
  if (turf.ownerId.toString() !== req.user.id && req.user.role !== 'admin') {
    return next(new ErrorResponse(`User ${req.user.id} is not authorized to delete this turf`, 401));
  }

  await turf.deleteOne();

  res.status(200).json({
    success: true,
    data: {}
  });
});

// @desc    Get turfs by owner
// @route   GET /api/turfs/owner/my
// @access  Private/Owner
exports.getMyTurfs = asyncHandler(async (req, res, next) => {
  const turfs = await Turf.findByOwner(req.user.id);

  res.status(200).json({
    success: true,
    count: turfs.length,
    data: turfs
  });
});

// @desc    Get nearby turfs
// @route   GET /api/turfs/nearby
// @access  Public
exports.getNearbyTurfs = asyncHandler(async (req, res, next) => {
  const { lat, lng, distance = 10000 } = req.query;

  if (!lat || !lng) {
    return next(new ErrorResponse('Latitude and longitude are required', 400));
  }

  const coordinates = {
    lat: parseFloat(lat),
    lng: parseFloat(lng)
  };

  // Validate coordinates
  if (coordinates.lat < -90 || coordinates.lat > 90 || coordinates.lng < -180 || coordinates.lng > 180) {
    return next(new ErrorResponse('Invalid coordinates', 400));
  }

  const turfs = await Turf.findNearby(coordinates, parseInt(distance));

  res.status(200).json({
    success: true,
    count: turfs.length,
    data: turfs
  });
});

// @desc    Approve turf (Admin only)
// @route   PUT /api/turfs/:id/approve
// @access  Private/Admin
exports.approveTurf = asyncHandler(async (req, res, next) => {
  const turf = await Turf.findById(req.params.id);

  if (!turf) {
    return next(new ErrorResponse(`Turf not found with id of ${req.params.id}`, 404));
  }

  turf.isApproved = true;
  await turf.save();

  res.status(200).json({
    success: true,
    data: turf
  });
});
