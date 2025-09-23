const Turf = require('../models/Turf');
const Booking = require('../models/Booking');
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
  const turfs = allTurfs.filter(turf => turf.ownerId !== null);

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

  // Remove owner data from response for privacy
  const turfData = turf.toObject();
  delete turfData.ownerId;

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

  // Check if sport type is allowed for this owner (only if owner has registered sports)
  const allowedSports = Array.isArray(user.sportTypes) && user.sportTypes.length > 0
    ? user.sportTypes
    : (user.sportType ? [user.sportType] : []);
  if (allowedSports.length > 0 && !allowedSports.includes(req.body.sport)) {
    const sportsList = allowedSports.join(', ');
    return next(new ErrorResponse(`Sport type must be one of your registered sport types: ${sportsList}`.trim(), 400));
  }

  // Check if owner has reached their turf limit
  const existingTurfsCount = await Turf.countDocuments({ ownerId: req.user.id });
  let maxTurfs = 0;
  
  switch (user.turfCount) {
    case '1':
      maxTurfs = 1;
      break;
    case '2-5':
      maxTurfs = 5;
      break;
    case '6-10':
      maxTurfs = 10;
      break;
    case '10+':
      maxTurfs = 999; // Effectively unlimited
      break;
    default:
      maxTurfs = 1; // Default to 1 if not specified
  }
  
  if (existingTurfsCount >= maxTurfs) {
    return next(new ErrorResponse(`You have reached your maximum turf limit of ${user.turfCount}. You currently have ${existingTurfsCount} turf(s) registered.`, 400));
  }

  // Create turf with image URLs (auto-approved)
  const turfData = {
    ...req.body,
    images: imageUrls,
    isApproved: true,
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
    message: `Turf created successfully with ${imageUrls.length} Cloudinary images and is now live!`
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

  // Validate/merge location data if provided
  if (req.body.location) {
    const incoming = req.body.location;
    // If coordinates are provided, validate range; if omitted/null, keep existing
    if (incoming.coordinates) {
      const { lat, lng } = incoming.coordinates;
      if (lat < -90 || lat > 90 || lng < -180 || lng > 180) {
        return next(new ErrorResponse('Invalid coordinates', 400));
      }
    }
    // Do not force both address and coordinates. Address changes are handled via restricted fields above.
  }

  // Validate price if provided
  if (req.body.pricePerHour !== undefined && req.body.pricePerHour < 0) {
    return next(new ErrorResponse('Price cannot be negative', 400));
  }

  // Handle image updates: accept already-uploaded URLs or upload raw files
  if (req.body.images && req.body.images.length > 0) {
    const first = req.body.images[0];
    if (typeof first === 'string' && first.startsWith('http')) {
      // Images are URLs provided by the frontend (already uploaded via /upload/images)
      // Keep as-is, replacing existing images with provided URLs
      console.log(`✅ Received ${req.body.images.length} image URLs for update`);
    } else {
      try {
        const uploadResult = await imageUploadService.uploadMultipleImages(req.body.images, 'turfs');
        if (!uploadResult.success) {
          return next(new ErrorResponse('Failed to upload new images', 500));
        }
        const newImageUrls = uploadResult.images.map(img => img.url);
        if (newImageUrls.length === 0) {
          return next(new ErrorResponse('No new images were uploaded successfully', 500));
        }
        req.body.images = newImageUrls;
        console.log(`✅ Updated turf with ${newImageUrls.length} new images`);
      } catch (error) {
        console.error('❌ Image upload error during update:', error);
        return next(new ErrorResponse('Failed to upload new images', 500));
      }
    }
  }

  // Define fields that require admin approval
  const restrictedFields = ['name', 'location.address', 'pricePerHour', 'description', 'amenities', 'sport'];
  const protectedFields = []; // Allow edits; sensitive fields require approval via restrictedFields

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
      continue;
    }

    if (key === 'location') {
      const nextLocation = { ...turf.location };
      if (value.coordinates) {
        nextLocation.coordinates = value.coordinates;
      }
      if (value.address && value.address !== turf.location?.address) {
        // Address changes require admin approval
        needsApproval['location.address'] = value.address;
      }
      directUpdates.location = nextLocation;
      continue;
    }

    directUpdates[key] = value;
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
  
  // Check if it's today and slot time has passed
  const today = new Date();
  const isToday = bookingDate.toDateString() === today.toDateString();
  let isAvailable = turf.isSlotAvailable(bookingDate, dayOfWeek, startTime, endTime);
  
  if (isToday && isAvailable) {
    const currentTime = today.getHours() * 60 + today.getMinutes();
    const slotStartTime = turf.parseTimeToMinutes(startTime);
    if (slotStartTime <= currentTime) {
      isAvailable = false; // Slot has passed
    }
  }
  
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

  // Restrict offline booking to current date only
  const today = new Date();
  const toYmd = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).toISOString().slice(0,10);
  const reqYmd = (() => { try { const d = new Date(date); return toYmd(d); } catch { return null; } })();
  const todayYmd = toYmd(today);
  if (reqYmd !== todayYmd) {
    return next(new ErrorResponse('Offline bookings are allowed only for today', 400));
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
    // Check if slot time has passed (for today's bookings)
    const currentTime = today.getHours() * 60 + today.getMinutes();
    const slotStartTime = turf.parseTimeToMinutes(startTime);
    if (slotStartTime <= currentTime) {
      return next(new ErrorResponse('Cannot book slots that have already passed', 400));
    }
    
    // Check if slot is available
    const isAvailable = turf.isSlotAvailable(bookingDate, dayOfWeek, startTime, endTime);
    if (!isAvailable) {
      return next(new ErrorResponse('Slot is not available for booking', 400));
    }

    // Get slot price if not provided
    const daySlots = turf.availableSlots[dayOfWeek];
    const slot = daySlots.slots.find(s => s.startTime === startTime && s.endTime === endTime);
    const slotPrice = price || slot.price || turf.pricePerHour;

    // Create booking record (persist first)
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

    // Update turf slot status (mutate then save once)
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

// @desc    Get owner analytics data
// @route   GET /api/turfs/owner/analytics
// @access  Private/Owner
exports.getOwnerAnalytics = asyncHandler(async (req, res, next) => {
  try {
    const { period = '30d' } = req.query;
    
    // Calculate date range based on period
    const now = new Date();
    let startDate;
    
    switch (period) {
      case '7d':
        startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        break;
      case '30d':
        startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
        break;
      case '90d':
        startDate = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
        break;
      case '1y':
        startDate = new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000);
        break;
      default:
        startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    }

    // Get owner's turfs
    const turfs = await Turf.find({ ownerId: req.user.id });
    const turfIds = turfs.map(turf => turf._id);

    // Get booking statistics
    const totalBookings = await Booking.countDocuments({
      ownerId: req.user.id,
      bookingDate: { $gte: startDate }
    });

    const confirmedBookings = await Booking.countDocuments({
      ownerId: req.user.id,
      status: 'confirmed',
      bookingDate: { $gte: startDate }
    });

    const cancelledBookings = await Booking.countDocuments({
      ownerId: req.user.id,
      status: 'cancelled',
      bookingDate: { $gte: startDate }
    });

    // Calculate revenue
    const revenueData = await Booking.aggregate([
      {
        $match: {
          ownerId: req.user._id,
          status: 'confirmed',
          bookingDate: { $gte: startDate }
        }
      },
      {
        $group: {
          _id: null,
          totalRevenue: { $sum: '$totalAmount' },
          averageBookingValue: { $avg: '$totalAmount' }
        }
      }
    ]);

    const totalRevenue = revenueData.length > 0 ? revenueData[0].totalRevenue : 0;
    const averageBookingValue = revenueData.length > 0 ? revenueData[0].averageBookingValue : 0;

    // Get booking trends by day
    const bookingTrends = await Booking.aggregate([
      {
        $match: {
          ownerId: req.user._id,
          bookingDate: { $gte: startDate }
        }
      },
      {
        $group: {
          _id: {
            year: { $year: '$bookingDate' },
            month: { $month: '$bookingDate' },
            day: { $dayOfMonth: '$bookingDate' }
          },
          bookings: { $sum: 1 },
          revenue: { $sum: '$totalAmount' }
        }
      },
      {
        $sort: { '_id.year': 1, '_id.month': 1, '_id.day': 1 }
      }
    ]);

    // Get popular time slots
    const popularSlots = await Booking.aggregate([
      {
        $match: {
          ownerId: req.user._id,
          status: 'confirmed',
          bookingDate: { $gte: startDate }
        }
      },
      {
        $group: {
          _id: '$startTime',
          count: { $sum: 1 },
          revenue: { $sum: '$totalAmount' }
        }
      },
      {
        $sort: { count: -1 }
      },
      {
        $limit: 10
      }
    ]);

    // Get turf performance
    const turfPerformance = await Booking.aggregate([
      {
        $match: {
          ownerId: req.user._id,
          status: 'confirmed',
          bookingDate: { $gte: startDate }
        }
      },
      {
        $group: {
          _id: '$turfId',
          bookings: { $sum: 1 },
          revenue: { $sum: '$totalAmount' }
        }
      },
      {
        $lookup: {
          from: 'turfs',
          localField: '_id',
          foreignField: '_id',
          as: 'turf'
        }
      },
      {
        $unwind: '$turf'
      },
      {
        $project: {
          turfName: '$turf.name',
          bookings: 1,
          revenue: 1
        }
      },
      {
        $sort: { bookings: -1 }
      }
    ]);

    res.status(200).json({
      success: true,
      data: {
        period,
        summary: {
          totalBookings,
          confirmedBookings,
          cancelledBookings,
          totalRevenue,
          averageBookingValue,
          totalTurfs: turfs.length,
          activeTurfs: turfs.filter(turf => turf.isApproved).length
        },
        trends: bookingTrends,
        popularSlots,
        turfPerformance
      }
    });
  } catch (error) {
    return next(new ErrorResponse(error.message, 500));
  }
});

// @desc    Get owner customers data
// @route   GET /api/turfs/owner/customers
// @access  Private/Owner
exports.getOwnerCustomers = asyncHandler(async (req, res, next) => {
  try {
    const { page = 1, limit = 20, search = '' } = req.query;
    const skip = (parseInt(page) - 1) * parseInt(limit);

    // Get unique customers who have booked owner's turfs
    const customerPipeline = [
      {
        $match: {
          ownerId: req.user._id,
          status: 'confirmed'
        }
      },
      {
        $group: {
          _id: '$customerId',
          totalBookings: { $sum: 1 },
          totalSpent: { $sum: '$totalAmount' },
          lastBooking: { $max: '$bookingDate' },
          firstBooking: { $min: '$bookingDate' }
        }
      },
      {
        $lookup: {
          from: 'users',
          localField: '_id',
          foreignField: '_id',
          as: 'customer'
        }
      },
      {
        $unwind: '$customer'
      },
      {
        $project: {
          customerId: '$_id',
          customerName: { $concat: ['$customer.firstName', ' ', '$customer.lastName'] },
          customerEmail: '$customer.email',
          customerPhone: '$customer.phone',
          totalBookings: 1,
          totalSpent: 1,
          lastBooking: 1,
          firstBooking: 1,
          avgBookingValue: { $divide: ['$totalSpent', '$totalBookings'] }
        }
      },
      {
        $sort: { totalSpent: -1 }
      }
    ];

    // Add search filter if provided
    if (search) {
      customerPipeline.splice(6, 0, {
        $match: {
          $or: [
            { 'customer.firstName': { $regex: search, $options: 'i' } },
            { 'customer.lastName': { $regex: search, $options: 'i' } },
            { 'customer.email': { $regex: search, $options: 'i' } }
          ]
        }
      });
    }

    // Get total count
    const countPipeline = [...customerPipeline, { $count: 'total' }];
    const countResult = await Booking.aggregate(countPipeline);
    const totalCustomers = countResult.length > 0 ? countResult[0].total : 0;

    // Add pagination
    customerPipeline.push(
      { $skip: skip },
      { $limit: parseInt(limit) }
    );

    const customers = await Booking.aggregate(customerPipeline);

    // Get customer statistics
    const statsPipeline = [
      {
        $match: {
          ownerId: req.user._id,
          status: 'confirmed'
        }
      },
      {
        $group: {
          _id: '$customerId',
          totalSpent: { $sum: '$totalAmount' }
        }
      },
      {
        $group: {
          _id: null,
          totalCustomers: { $sum: 1 },
          totalRevenue: { $sum: '$totalSpent' },
          avgCustomerValue: { $avg: '$totalSpent' }
        }
      }
    ];

    const statsResult = await Booking.aggregate(statsPipeline);
    const stats = statsResult.length > 0 ? statsResult[0] : {
      totalCustomers: 0,
      totalRevenue: 0,
      avgCustomerValue: 0
    };

    res.status(200).json({
      success: true,
      count: customers.length,
      total: totalCustomers,
      page: parseInt(page),
      pages: Math.ceil(totalCustomers / parseInt(limit)),
      stats,
      data: customers
    });
  } catch (error) {
    return next(new ErrorResponse(error.message, 500));
  }
});

// @desc    Allocate slots for a specific day
// @route   POST /api/turfs/:id/slots/allocate
// @access  Private/Owner
exports.allocateSlotsForDay = asyncHandler(async (req, res, next) => {
  const { date, slots } = req.body;
  
  if (!date || !slots || !Array.isArray(slots) || slots.length === 0) {
    return next(new ErrorResponse('Date and slots array are required', 400));
  }

  // Validate date is within allowed range (next 5 days)
  const today = new Date();
  const maxDate = new Date();
  maxDate.setDate(today.getDate() + 5);
  
  const allocationDate = new Date(date);
  if (allocationDate < today || allocationDate > maxDate) {
    return next(new ErrorResponse('You can only allocate slots for the next 5 days from today', 400));
  }

  const turf = await Turf.findById(req.params.id);
  
  if (!turf) {
    return next(new ErrorResponse(`Turf not found with id of ${req.params.id}`, 404));
  }

  // Check if user is the owner of this turf
  if (turf.ownerId.toString() !== req.user.id) {
    return next(new ErrorResponse('Not authorized to allocate slots for this turf', 403));
  }

  const dayOfWeek = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'][allocationDate.getDay()];
  
  try {
    // Validate all slots
    for (const slot of slots) {
      if (!slot.startTime || !slot.endTime || !slot.price) {
        return next(new ErrorResponse('Each slot must have startTime, endTime, and price', 400));
      }
      
      if (slot.startTime >= slot.endTime) {
        return next(new ErrorResponse('End time must be after start time', 400));
      }
      
      if (slot.price <= 0) {
        return next(new ErrorResponse('Price must be greater than 0', 400));
      }
    }

    // Check if day is open
    const daySlots = turf.availableSlots[dayOfWeek];
    if (!daySlots || !daySlots.isOpen) {
      return next(new ErrorResponse(`Turf is closed on ${dayOfWeek}`, 400));
    }

    // Add slots to the day
    const newSlots = slots.map(slot => ({
      startTime: slot.startTime,
      endTime: slot.endTime,
      price: slot.price,
      isBooked: false,
      bookedBy: null,
      bookingDate: null
    }));

    // Add new slots to existing slots
    turf.availableSlots[dayOfWeek].slots.push(...newSlots);
    
    await turf.save();
    
    res.status(200).json({
      success: true,
      message: 'Slots allocated successfully',
      data: {
        date,
        dayOfWeek,
        allocatedSlots: newSlots.length,
        totalSlots: turf.availableSlots[dayOfWeek].slots.length
      }
    });
  } catch (error) {
    return next(new ErrorResponse(error.message, 400));
  }
});
