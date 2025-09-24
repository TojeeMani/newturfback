const Turf = require('../models/Turf');
const Booking = require('../models/Booking');
const Review = require('../models/Review');
const mongoose = require('mongoose');
const aiAnalyticsService = require('../services/aiAnalyticsService');
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

  // Finding resource with owner approval check
  query = Turf.find(JSON.parse(queryStr)).populate({
    path: 'ownerId',
    select: 'adminApprovalStatus isActive',
    match: {
      adminApprovalStatus: 'approved',
      isActive: true
    }
  });

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
  // Count only turfs from approved and active owners
  const totalQuery = await Turf.aggregate([
    {
      $lookup: {
        from: 'users',
        localField: 'ownerId',
        foreignField: '_id',
        as: 'owner'
      }
    },
    {
      $match: {
        'owner.adminApprovalStatus': 'approved',
        'owner.isActive': true
      }
    },
    {
      $count: 'total'
    }
  ]);

  const total = totalQuery.length > 0 ? totalQuery[0].total : 0;

  query = query.skip(startIndex).limit(limit);

  // Executing query
  const allTurfs = await query;

  // Filter out turfs where owner population failed (owner not approved or inactive)
  const turfs = allTurfs.filter(turf => turf.ownerId !== null).map(turf => {
    const turfData = turf.toObject();
    delete turfData.ownerId; // Remove owner data for privacy
    
    // Ensure rating and totalReviews are included
    turfData.rating = turfData.rating || 0;
    turfData.totalReviews = turfData.totalReviews || 0;
    
    return turfData;
  });

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
  const turf = await Turf.findById(req.params.id).populate({
    path: 'ownerId',
    select: 'adminApprovalStatus isActive'
  });

  if (!turf) {
    return next(new ErrorResponse(`Turf not found with id of ${req.params.id}`, 404));
  }

  // Check if owner is approved and active
  if (!turf.ownerId || turf.ownerId.adminApprovalStatus !== 'approved' || !turf.ownerId.isActive) {
    return next(new ErrorResponse(`Turf not available`, 404));
  }

  // Remove owner data from response for privacy but keep rating data
  const turfData = turf.toObject();
  delete turfData.ownerId;

  // Ensure rating and totalReviews are included in response
  turfData.rating = turfData.rating || 0;
  turfData.totalReviews = turfData.totalReviews || 0;

  res.status(200).json({
    success: true,
    data: turfData
  });
});

// @desc    Create new turf
// @route   POST /api/turfs
// @access  Private/Owner
exports.createTurf = asyncHandler(async (req, res, next) => {
  // Add owner to req.body
  req.body.ownerId = req.user.id;

  // Validate location data
  if (!req.body.location || !req.body.location.address) {
    return next(new ErrorResponse('Location address is required', 400));
  }

  // Validate price
  if (!req.body.pricePerHour || req.body.pricePerHour < 0) {
    return next(new ErrorResponse('Valid price per hour is required', 400));
  }

  // Handle image URLs (already uploaded to Cloudinary by frontend)
  let imageUrls = [];
  if (req.body.images && req.body.images.length > 0) {
    // Check if images are URLs (already uploaded) or base64/file data (need upload)
    const firstImage = req.body.images[0];

    if (typeof firstImage === 'string' && firstImage.startsWith('http')) {
      // Images are already HTTP/HTTPS URLs (Cloudinary URLs or placeholder URLs for dev mode)
      imageUrls = req.body.images;
      console.log(`✅ Received ${imageUrls.length} pre-uploaded image URLs`);
    } else {
      // Images are file data, need to upload to Cloudinary
      try {
        const uploadResult = await imageUploadService.uploadMultipleImages(req.body.images, 'turfs');

        if (!uploadResult.success) {
          return next(new ErrorResponse('Failed to upload images to Cloudinary', 500));
        }

        imageUrls = uploadResult.images.map(img => img.url);
        console.log(`✅ Uploaded ${imageUrls.length} images to Cloudinary`);
      } catch (error) {
        console.error('❌ Image upload error:', error);
        return next(new ErrorResponse('Failed to upload images to Cloudinary', 500));
      }
    }
  }

  // Validate that we have at least one image URL
  if (imageUrls.length === 0) {
    return next(new ErrorResponse('At least one image is required', 400));
  }

  // Get user data for originalRegistrationData
  const user = req.user;

  // Validate that turf data matches registration data
  if (req.body.name !== user.businessName) {
    return next(new ErrorResponse(`Turf name must match your business name from registration: "${user.businessName}"`, 400));
  }

  if (req.body.location.address !== user.turfLocation) {
    return next(new ErrorResponse(`Turf location must match your registered location: "${user.turfLocation}"`, 400));
  }

  // Check if sport type is allowed for this owner
  const allowedSports = user.sportTypes || [user.sportType];
  if (!allowedSports.includes(req.body.sport)) {
    const sportsList = allowedSports.join(', ');
    return next(new ErrorResponse(`Sport type must be one of your registered sport types: ${sportsList}`, 400));
  }

  // Create turf with image URLs (requires admin approval)
  const turfData = {
    ...req.body,
    images: imageUrls,
    isApproved: false, // New turfs require admin approval
    // Set original registration data (cannot be changed later)
    originalRegistrationData: {
      name: req.body.name,
      address: req.body.location.address,
      businessName: user.businessName || (user.firstName + ' ' + user.lastName)
    }
  };

  const turf = await Turf.create(turfData);

  res.status(201).json({
    success: true,
    data: turf,
    message: `Turf submitted successfully! It will be reviewed by admin and will be live once approved.`,
    approvalStatus: 'pending'
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

  // Define fields that require admin approval
  const restrictedFields = ['pricePerHour', 'description', 'amenities', 'sports'];
  const protectedFields = ['name', 'location.address']; // These cannot be changed at all

  // Check if trying to change protected fields
  for (const field of protectedFields) {
    if (req.body[field] || (field === 'location.address' && req.body.location?.address)) {
      const originalValue = field === 'location.address' ? turf.originalRegistrationData?.address : turf.originalRegistrationData?.name;
      const newValue = field === 'location.address' ? req.body.location?.address : req.body[field];

      if (newValue && originalValue && newValue !== originalValue) {
        return next(new ErrorResponse(`${field === 'location.address' ? 'Address' : 'Name'} cannot be changed. It must match your original registration: "${originalValue}"`, 400));
      }
    }
  }

  // Separate changes that need approval from those that don't
  const needsApproval = {};
  const directUpdates = {};

  for (const [key, value] of Object.entries(req.body)) {
    if (restrictedFields.includes(key)) {
      needsApproval[key] = value;
    } else if (!protectedFields.includes(key) && key !== 'location') {
      directUpdates[key] = value;
    } else if (key === 'location' && value.coordinates) {
      // Allow coordinate updates but not address changes
      directUpdates[key] = {
        ...turf.location,
        coordinates: value.coordinates
      };
    }
  }

  // Apply direct updates (non-restricted fields)
  if (Object.keys(directUpdates).length > 0) {
    Object.assign(turf, directUpdates);
  }

  // Handle changes that need approval
  if (Object.keys(needsApproval).length > 0) {
    turf.pendingChanges = new Map(Object.entries(needsApproval));
    turf.changesApprovalStatus = 'pending';
    turf.changeApprovalNotes = '';
  }

  await turf.save();

  const message = Object.keys(needsApproval).length > 0
    ? 'Turf updated. Some changes require admin approval.'
    : (req.body.images ? 'Turf updated successfully with new images' : 'Turf updated successfully');

  res.status(200).json({
    success: true,
    data: turf,
    message,
    pendingApproval: Object.keys(needsApproval).length > 0,
    pendingChanges: Object.keys(needsApproval)
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

// @desc    Add new sport to existing turf
// @route   POST /api/turfs/:id/sports
// @access  Private/Owner
exports.addSportToTurf = asyncHandler(async (req, res, next) => {
  const turf = await Turf.findById(req.params.id);

  if (!turf) {
    return next(new ErrorResponse(`Turf not found with id of ${req.params.id}`, 404));
  }

  // Make sure user is turf owner
  if (turf.ownerId.toString() !== req.user.id && req.user.role !== 'admin') {
    return next(new ErrorResponse(`User ${req.user.id} is not authorized to update this turf`, 401));
  }

  // Validate the new sport data
  const { sport, pricePerHour, availableSlots } = req.body;

  if (!sport || !['Football', 'Cricket', 'Basketball', 'Tennis', 'Badminton', 'Volleyball'].includes(sport)) {
    return next(new ErrorResponse('Valid sport type is required', 400));
  }

  if (!pricePerHour || pricePerHour < 0) {
    return next(new ErrorResponse('Valid price per hour is required', 400));
  }

  // Check if sport already exists for this turf
  if (turf.sport === sport) {
    return next(new ErrorResponse(`Sport ${sport} already exists for this turf`, 400));
  }

  // Create a new turf entry for the additional sport
  const newSportTurf = await Turf.create({
    ownerId: req.user.id,
    name: turf.name,
    location: turf.location,
    pricePerHour: pricePerHour,
    images: turf.images, // Use existing images
    sport: sport,
    description: turf.description,
    amenities: turf.amenities,
    isApproved: true, // Additional sports are auto-approved since owner is verified
    originalRegistrationData: turf.originalRegistrationData,
    availableSlots: availableSlots || turf.availableSlots,
    slotDuration: turf.slotDuration,
    advanceBookingDays: turf.advanceBookingDays
  });

  res.status(201).json({
    success: true,
    data: newSportTurf,
    message: `New sport ${sport} added to your turf successfully!`
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

// @desc    Get all turfs for admin (grouped by owner)
// @route   GET /api/turfs/admin/all
// @access  Private/Admin
exports.getAllTurfsForAdmin = asyncHandler(async (req, res, next) => {
  const page = parseInt(req.query.page, 10) || 1;
  const limit = parseInt(req.query.limit, 10) || 10;
  const startIndex = (page - 1) * limit;

  // Get turfs with owner information
  const turfs = await Turf.find()
    .populate('ownerId', 'firstName lastName email businessName phone')
    .sort('-createdAt')
    .skip(startIndex)
    .limit(limit);

  const total = await Turf.countDocuments();

  // Group turfs by owner
  const turfsByOwner = turfs.reduce((acc, turf) => {
    const ownerId = turf.ownerId._id.toString();
    if (!acc[ownerId]) {
      acc[ownerId] = {
        owner: turf.ownerId,
        turfs: [],
        totalTurfs: 0
      };
    }
    acc[ownerId].turfs.push(turf);
    acc[ownerId].totalTurfs++;
    return acc;
  }, {});

  // Pagination
  const pagination = {};
  const endIndex = page * limit;

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
    total,
    pagination,
    data: {
      turfs,
      turfsByOwner: Object.values(turfsByOwner)
    }
  });
});

// @desc    Approve turf (Admin only - legacy, now auto-approved)
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

// @desc    Check slot availability
// @route   GET /api/turfs/:id/slots/check
// @access  Public
exports.checkSlotAvailability = asyncHandler(async (req, res, next) => {
  const { date, startTime, endTime } = req.query;
  
  if (!date || !startTime || !endTime) {
    return next(new ErrorResponse('Date, start time, and end time are required', 400));
  }

  const turf = await Turf.findById(req.params.id);
  
  if (!turf) {
    return next(new ErrorResponse(`Turf not found with id of ${req.params.id}`, 404));
  }

  const bookingDate = new Date(date);
  const dayOfWeek = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'][bookingDate.getDay()];
  
  const isAvailable = turf.isSlotAvailable(bookingDate, dayOfWeek, startTime, endTime);
  
  res.status(200).json({
    success: true,
    data: {
      available: isAvailable,
      date,
      startTime,
      endTime
    }
  });
});

// @desc    Get available slots for a date
// @route   GET /api/turfs/:id/slots/available
// @access  Public
exports.getAvailableSlots = asyncHandler(async (req, res, next) => {
  const { date } = req.query;
  
  if (!date) {
    return next(new ErrorResponse('Date is required', 400));
  }

  const turf = await Turf.findById(req.params.id);
  
  if (!turf) {
    return next(new ErrorResponse(`Turf not found with id of ${req.params.id}`, 404));
  }

  const bookingDate = new Date(date);
  const availableSlots = turf.getAvailableSlots(bookingDate);
  
  res.status(200).json({
    success: true,
    data: {
      date,
      slots: availableSlots
    }
  });
});

// @desc    Book a slot (offline booking by owner)
// @route   POST /api/turfs/:id/slots/book
// @access  Private/Owner
exports.bookSlot = asyncHandler(async (req, res, next) => {
  const { date, startTime, endTime, customerName, customerPhone, customerEmail, price, notes } = req.body;
  
  if (!date || !startTime || !endTime || !customerName || !customerPhone) {
    return next(new ErrorResponse('Date, start time, end time, customer name, and customer phone are required', 400));
  }

  const turf = await Turf.findById(req.params.id);
  
  if (!turf) {
    return next(new ErrorResponse(`Turf not found with id of ${req.params.id}`, 404));
  }

  // Check if user is the owner of this turf
  if (turf.ownerId.toString() !== req.user.id) {
    return next(new ErrorResponse('Not authorized to book slots for this turf', 403));
  }

  const bookingDate = new Date(date);
  const dayOfWeek = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'][bookingDate.getDay()];
  
  try {
    // Check if slot is available
    const isAvailable = turf.isSlotAvailable(bookingDate, dayOfWeek, startTime, endTime);
    if (!isAvailable) {
      return next(new ErrorResponse('Slot is not available for booking', 400));
    }

    // Get slot price if not provided
    const daySlots = turf.availableSlots[dayOfWeek];
    const slot = daySlots.slots.find(s => s.startTime === startTime && s.endTime === endTime);
    const slotPrice = price || slot.price || turf.pricePerHour;

    // Create booking record
    const booking = await Booking.create({
      turfId: turf._id,
      ownerId: turf.ownerId,
      customerInfo: {
        name: customerName,
        phone: customerPhone,
        email: customerEmail || ''
      },
      bookingDate,
      startTime,
      endTime,
      pricePerHour: slotPrice,
      status: 'confirmed',
      paymentStatus: 'pending',
      paymentMethod: 'cash',
      bookingType: 'offline',
      notes: notes || ''
    });

    // Update turf slot status
    turf.bookSlot(bookingDate, dayOfWeek, startTime, endTime, booking._id);
    await turf.save();
    
    res.status(200).json({
      success: true,
      message: 'Slot booked successfully',
      data: {
        bookingId: booking._id,
        date,
        startTime,
        endTime,
        customerName,
        customerPhone,
        totalAmount: booking.totalAmount
      }
    });
  } catch (error) {
    return next(new ErrorResponse(error.message, 400));
  }
});

// @desc    Cancel a slot booking
// @route   DELETE /api/turfs/:id/slots/cancel
// @access  Private/Owner
exports.cancelSlotBooking = asyncHandler(async (req, res, next) => {
  const { date, startTime, endTime, bookingId, reason } = req.body;
  
  if (!date || !startTime || !endTime) {
    return next(new ErrorResponse('Date, start time, and end time are required', 400));
  }

  const turf = await Turf.findById(req.params.id);
  
  if (!turf) {
    return next(new ErrorResponse(`Turf not found with id of ${req.params.id}`, 404));
  }

  // Check if user is the owner of this turf
  if (turf.ownerId.toString() !== req.user.id) {
    return next(new ErrorResponse('Not authorized to cancel bookings for this turf', 403));
  }

  const bookingDate = new Date(date);
  const dayOfWeek = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'][bookingDate.getDay()];
  
  try {
    // Find and cancel the booking record if bookingId is provided
    if (bookingId) {
      const booking = await Booking.findById(bookingId);
      if (booking && booking.turfId.toString() === turf._id.toString()) {
        await booking.cancelBooking(req.user.id, reason || 'Cancelled by owner');
      }
    } else {
      // Find booking by date and time
      const booking = await Booking.findOne({
        turfId: turf._id,
        bookingDate,
        startTime,
        endTime,
        status: { $ne: 'cancelled' }
      });
      
      if (booking) {
        await booking.cancelBooking(req.user.id, reason || 'Cancelled by owner');
      }
    }

    // Update turf slot status
    turf.cancelSlotBooking(bookingDate, dayOfWeek, startTime, endTime);
    await turf.save();
    
    res.status(200).json({
      success: true,
      message: 'Booking cancelled successfully',
      data: {
        date,
        startTime,
        endTime
      }
    });
  } catch (error) {
    return next(new ErrorResponse(error.message, 400));
  }
});

// @desc    Get bookings for a turf on a specific date
// @route   GET /api/turfs/:id/bookings
// @access  Private/Owner
exports.getTurfBookings = asyncHandler(async (req, res, next) => {
  const { date, status } = req.query;
  
  if (!date) {
    return next(new ErrorResponse('Date is required', 400));
  }

  const turf = await Turf.findById(req.params.id);
  
  if (!turf) {
    return next(new ErrorResponse(`Turf not found with id of ${req.params.id}`, 404));
  }

  // Check if user is the owner of this turf
  if (turf.ownerId.toString() !== req.user.id) {
    return next(new ErrorResponse('Not authorized to view bookings for this turf', 403));
  }

  try {
    // Use the new Booking model for better data retrieval
    const bookings = await Booking.findByTurf(req.params.id, { date, status });
    
    res.status(200).json({
      success: true,
      count: bookings.length,
      data: {
        date,
        bookings
      }
    });
  } catch (error) {
    return next(new ErrorResponse(error.message, 500));
  }
});

// @desc    Get owner analytics
// @route   GET /api/turfs/owner/analytics
// @access  Private (Owner)
exports.getOwnerAnalytics = asyncHandler(async (req, res, next) => {
  try {
    const ownerId = req.user.id;
    
    // Get total turfs count
    const totalTurfs = await Turf.countDocuments({ ownerId });
    
    // Get total bookings count
    const totalBookings = await Booking.countDocuments({ ownerId });
    
    // Get revenue (sum of all completed bookings)
    const revenueResult = await Booking.aggregate([
      { $match: { ownerId: req.user.id, status: 'completed' } },
      { $group: { _id: null, totalRevenue: { $sum: '$totalAmount' } } }
    ]);
    const totalRevenue = revenueResult.length > 0 ? revenueResult[0].totalRevenue : 0;
    
    // Get monthly bookings for the current year
    const currentYear = new Date().getFullYear();
    const monthlyBookings = await Booking.aggregate([
      {
        $match: {
          ownerId: req.user.id,
          createdAt: {
            $gte: new Date(`${currentYear}-01-01`),
            $lte: new Date(`${currentYear}-12-31`)
          }
        }
      },
      {
        $group: {
          _id: { $month: '$createdAt' },
          count: { $sum: 1 },
          revenue: { $sum: '$totalAmount' }
        }
      },
      { $sort: { '_id': 1 } }
    ]);

    // Get rating analytics for owner's turfs
    const ratingAnalytics = await Review.aggregate([
      {
        $lookup: {
          from: 'turfs',
          localField: 'turfId',
          foreignField: '_id',
          as: 'turf'
        }
      },
      {
        $match: {
          'turf.ownerId': new mongoose.Types.ObjectId(ownerId)
        }
      },
      {
        $group: {
          _id: null,
          totalReviews: { $sum: 1 },
          averageRating: { $avg: '$rating' },
          ratingDistribution: {
            $push: '$rating'
          }
        }
      },
      {
        $project: {
          totalReviews: 1,
          averageRating: { $round: ['$averageRating', 1] },
          ratingDistribution: {
            5: { $size: { $filter: { input: '$ratingDistribution', cond: { $eq: ['$$this', 5] } } } },
            4: { $size: { $filter: { input: '$ratingDistribution', cond: { $eq: ['$$this', 4] } } } },
            3: { $size: { $filter: { input: '$ratingDistribution', cond: { $eq: ['$$this', 3] } } } },
            2: { $size: { $filter: { input: '$ratingDistribution', cond: { $eq: ['$$this', 2] } } } },
            1: { $size: { $filter: { input: '$ratingDistribution', cond: { $eq: ['$$this', 1] } } } }
          }
        }
      }
    ]);

    // Get recent reviews with customer info
    const recentReviews = await Review.find({
      turfId: { $in: await Turf.find({ ownerId }).distinct('_id') }
    })
    .populate('userId', 'name email')
    .populate('turfId', 'name')
    .sort({ createdAt: -1 })
    .limit(10)
    .select('rating comment createdAt turfId userId');

    // Get turf-specific rating summary
    const turfRatings = await Turf.aggregate([
      { $match: { ownerId: new mongoose.Types.ObjectId(ownerId) } },
      {
        $lookup: {
          from: 'reviews',
          localField: '_id',
          foreignField: 'turfId',
          as: 'reviews'
        }
      },
      {
        $project: {
          name: 1,
          totalReviews: { $size: '$reviews' },
          averageRating: {
            $cond: [
              { $gt: [{ $size: '$reviews' }, 0] },
              { $round: [{ $avg: '$reviews.rating' }, 1] },
              0
            ]
          }
        }
      },
      { $sort: { averageRating: -1, totalReviews: -1 } }
    ]);
    
    // Get popular time slots
    const popularSlots = await Booking.aggregate([
      { $match: { ownerId: req.user.id, status: 'completed' } },
      {
        $group: {
          _id: '$startTime',
          count: { $sum: 1 },
          revenue: { $sum: '$totalAmount' }
        }
      },
      { $sort: { count: -1 } },
      { $limit: 10 }
    ]);

    // Get turf performance
    const turfPerformance = await Turf.aggregate([
      { $match: { ownerId: new mongoose.Types.ObjectId(ownerId) } },
      {
        $lookup: {
          from: 'bookings',
          localField: '_id',
          foreignField: 'turfId',
          as: 'bookings'
        }
      },
      {
        $project: {
          turfName: '$name',
          bookings: { $size: '$bookings' },
          revenue: {
            $reduce: {
              input: '$bookings',
              initialValue: 0,
              in: { $add: ['$$value', '$$this.totalAmount'] }
            }
          }
        }
      },
      { $sort: { bookings: -1 } },
      { $limit: 10 }
    ]);

    // Get recent trends (last 30 days)
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    
    const trends = await Booking.aggregate([
      {
        $match: {
          ownerId: req.user.id,
          createdAt: { $gte: thirtyDaysAgo }
        }
      },
      {
        $group: {
          _id: {
            year: { $year: '$createdAt' },
            month: { $month: '$createdAt' },
            day: { $dayOfMonth: '$createdAt' }
          },
          bookings: { $sum: 1 },
          revenue: { $sum: '$totalAmount' }
        }
      },
      { $sort: { '_id.year': 1, '_id.month': 1, '_id.day': 1 } }
    ]);

    // Get confirmed and cancelled bookings for summary
    const confirmedBookings = await Booking.countDocuments({ 
      ownerId: req.user.id, 
      status: 'confirmed' 
    });
    
    const cancelledBookings = await Booking.countDocuments({ 
      ownerId: req.user.id, 
      status: 'cancelled' 
    });

    // Get historical data for AI/ML analysis
    const historicalBookings = await Booking.find({ 
      ownerId: req.user.id,
      status: 'completed'
    }).sort({ createdAt: -1 }).limit(365); // Last year of data

    // AI/ML Enhanced Analytics
    let aiInsights = {};
    try {
      // Predict popular time slots
      aiInsights.popularTimeSlots = await aiAnalyticsService.predictPopularTimeSlots(historicalBookings);
      
      // Enhanced rating analysis
      aiInsights.ratingAnalysis = await aiAnalyticsService.analyzeRatingDistribution(recentReviews);
      
      // Predictive booking trends
      aiInsights.bookingTrends = await aiAnalyticsService.predictBookingTrends(historicalBookings);
      
      // Revenue optimization
      aiInsights.revenueOptimization = await aiAnalyticsService.optimizeRevenue(historicalBookings, []);
      
    } catch (aiError) {
      console.error('AI Analytics Error:', aiError);
      aiInsights = {
        error: 'AI analytics temporarily unavailable',
        popularTimeSlots: {},
        ratingAnalysis: {},
        bookingTrends: {},
        revenueOptimization: {}
      };
    }

    res.status(200).json({
        success: true,
        data: {
          summary: {
            totalTurfs,
            totalBookings,
            totalRevenue,
            confirmedBookings,
            cancelledBookings,
            activeTurfs: totalTurfs, // Assuming all turfs are active
            averageBookingValue: totalBookings > 0 ? Math.round(totalRevenue / totalBookings) : 0
          },
          monthlyBookings,
          ratingAnalytics: ratingAnalytics[0] || {
            totalReviews: 0,
            averageRating: 0,
            ratingDistribution: { 5: 0, 4: 0, 3: 0, 2: 0, 1: 0 }
          },
          recentReviews,
          turfRatings,
          popularSlots,
          turfPerformance,
          trends,
          aiInsights // Add AI/ML enhanced insights
        }
      });
  } catch (error) {
    return next(new ErrorResponse(error.message, 500));
  }
});

// @desc    Get owner customers
// @route   GET /api/turfs/owner/customers
// @access  Private (Owner)
exports.getOwnerCustomers = asyncHandler(async (req, res, next) => {
  try {
    const ownerId = req.user.id;
    
    // Get unique customers who have booked turfs owned by this owner
    const customers = await Booking.aggregate([
      { $match: { ownerId: req.user.id } },
      {
        $group: {
          _id: '$userId',
          totalBookings: { $sum: 1 },
          totalSpent: { $sum: '$totalAmount' },
          lastBooking: { $max: '$createdAt' }
        }
      },
      {
        $lookup: {
          from: 'users',
          localField: '_id',
          foreignField: '_id',
          as: 'userDetails'
        }
      },
      {
        $unwind: '$userDetails'
      },
      {
        $project: {
          _id: 1,
          name: '$userDetails.name',
          email: '$userDetails.email',
          phone: '$userDetails.phone',
          totalBookings: 1,
          totalSpent: 1,
          lastBooking: 1
        }
      },
      { $sort: { totalSpent: -1 } }
    ]);
    
    res.status(200).json({
      success: true,
      count: customers.length,
      data: customers
    });
  } catch (error) {
    return next(new ErrorResponse(error.message, 500));
  }
});

// @desc    Allocate slots for a day
// @route   POST /api/turfs/:id/slots/allocate
// @access  Private (Owner)
exports.allocateSlotsForDay = asyncHandler(async (req, res, next) => {
  try {
    const { date, slots } = req.body;
    const turfId = req.params.id;
    
    // Verify turf ownership
    const turf = await Turf.findById(turfId);
    if (!turf) {
      return next(new ErrorResponse('Turf not found', 404));
    }
    
    if (turf.ownerId.toString() !== req.user.id) {
      return next(new ErrorResponse('Not authorized to access this turf', 401));
    }
    
    if (!date || !slots || !Array.isArray(slots)) {
      return next(new ErrorResponse('Please provide date and slots array', 400));
    }
    
    // Validate date format
    const allocateDate = new Date(date);
    if (isNaN(allocateDate.getTime())) {
      return next(new ErrorResponse('Invalid date format', 400));
    }
    
    // Check if date is not in the past
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    if (allocateDate < today) {
      return next(new ErrorResponse('Cannot allocate slots for past dates', 400));
    }
    
    // Update turf with allocated slots for the specific date
    const dateString = allocateDate.toISOString().split('T')[0];
    
    // Initialize allocatedSlots if it doesn't exist
    if (!turf.allocatedSlots) {
      turf.allocatedSlots = new Map();
    }
    
    turf.allocatedSlots.set(dateString, slots);
    await turf.save();
    
    res.status(200).json({
      success: true,
      message: `Slots allocated successfully for ${dateString}`,
      data: {
        date: dateString,
        slots: slots
      }
    });
  } catch (error) {
    return next(new ErrorResponse(error.message, 500));
  }
});

// @desc    Get all bookings for owner's turfs
// @route   GET /api/turfs/owner/bookings
// @access  Private/Owner
exports.getOwnerBookings = asyncHandler(async (req, res, next) => {
  const { date, turfId, status, limit = 50, page = 1 } = req.query;
  
  try {
    // Use the new Booking model for efficient data retrieval
    const options = { 
      date, 
      status, 
      turfId 
    };
    
    // Get bookings using the Booking model
    const bookings = await Booking.findByOwner(req.user.id, options)
      .limit(parseInt(limit))
      .skip((parseInt(page) - 1) * parseInt(limit));
    
    // Get total count for pagination
    const totalBookings = await Booking.countDocuments({
      ownerId: req.user.id,
      ...(date && {
        bookingDate: {
          $gte: new Date(date + 'T00:00:00.000Z'),
          $lte: new Date(date + 'T23:59:59.999Z')
        }
      }),
      ...(status && { status }),
      ...(turfId && { turfId })
    });
    
    res.status(200).json({
      success: true,
      count: bookings.length,
      total: totalBookings,
      page: parseInt(page),
      pages: Math.ceil(totalBookings / parseInt(limit)),
      data: bookings
    });
  } catch (error) {
    return next(new ErrorResponse(error.message, 500));
  }
});
