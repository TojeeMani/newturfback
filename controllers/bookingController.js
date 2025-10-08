const Turf = require('../models/Turf');
const Match = require('../models/Match');
const Booking = require('../models/Booking');
const asyncHandler = require('../middleware/async');
const ErrorResponse = require('../utils/errorResponse');

// @desc    Get all bookings for the authenticated user
// @route   GET /api/bookings
// @access  Private
exports.getUserBookings = asyncHandler(async (req, res, next) => {
  const bookings = await Booking.findByCustomer(req.user.id);

  res.status(200).json({
    success: true,
    count: bookings.length,
    data: bookings
  });
});

// @desc    Get single booking (must belong to user)
// @route   GET /api/bookings/:id
// @access  Private
exports.getBooking = asyncHandler(async (req, res, next) => {
  const booking = await Booking.findById(req.params.id)
    .populate('turfId', 'name location sport images')
    .populate('ownerId', 'businessName');

  if (!booking) {
    return next(new ErrorResponse('Booking not found', 404));
  }

  if (booking.customerId?.toString() !== req.user.id) {
    return next(new ErrorResponse('Not authorized to view this booking', 403));
  }

  res.status(200).json({ success: true, data: booking });
});

// @desc    Create a new online booking (customer must be logged in)
// @route   POST /api/bookings
// @access  Private
exports.createBooking = asyncHandler(async (req, res, next) => {
  const { turfId, date, startTime, endTime, paymentMethod, slots, teams, courtType } = req.body;

  const isBulk = Array.isArray(slots) && slots.length > 0;

  if (!turfId) {
    return next(new ErrorResponse('turfId is required', 400));
  }
  if (!isBulk && (!date || !startTime || !endTime)) {
    return next(new ErrorResponse('date, startTime and endTime are required', 400));
  }

  const turf = await Turf.findById(turfId);
  if (!turf) {
    return next(new ErrorResponse('Turf not found', 404));
  }

  const toProcess = isBulk ? slots : [{ date, startTime, endTime, paymentMethod, courtType }];
  const created = [];

  for (const s of toProcess) {
    const sDate = new Date(s.date);
    const sDay = ['sunday','monday','tuesday','wednesday','thursday','friday','saturday'][sDate.getDay()];
    const daySlots = turf.availableSlots?.[sDay];
    if (!daySlots || !daySlots.isOpen) {
      return next(new ErrorResponse(`No slots available on ${sDay}`, 400));
    }
    const slot = daySlots.slots.find(ds => ds.startTime === s.startTime && ds.endTime === s.endTime);
    if (!slot) {
      return next(new ErrorResponse('Selected slot is not available', 400));
    }
    
    // Check if it's today and slot time has passed
    const today = new Date();
    const isToday = sDate.toDateString() === today.toDateString();
    if (isToday) {
      const currentTime = today.getHours() * 60 + today.getMinutes();
      const slotStartTime = turf.parseTimeToMinutes(s.startTime);
      if (slotStartTime <= currentTime) {
        return next(new ErrorResponse('Cannot book slots that have already passed', 400));
      }
    }
    
    const isAvailable = turf.isSlotAvailable(sDate, sDay, s.startTime, s.endTime);
    if (!isAvailable) {
      return next(new ErrorResponse('One or more selected slots are already booked', 400));
    }

    const pricePerHour = slot.price || turf.pricePerHour;
    const method = ['cash', 'card', 'upi', 'bank_transfer', 'online'].includes((s.paymentMethod || paymentMethod || '').toLowerCase())
      ? (s.paymentMethod || paymentMethod || 'online')
      : 'online';

    // Court type handling (defaults to 'full')
    const ct = ((s.courtType || courtType || 'full').toLowerCase() === 'half') ? 'half' : 'full';

    const booking = await Booking.create({
      turfId: turf._id,
      ownerId: turf.ownerId,
      customerId: req.user.id,
      customerInfo: {
        name: `${req.user.firstName || ''} ${req.user.lastName || ''}`.trim() || req.user.email || 'Customer',
        phone: req.user.phone || 'N/A',
        email: req.user.email || ''
      },
      bookingDate: sDate,
      startTime: s.startTime,
      endTime: s.endTime,
      pricePerHour,
      courtType: ct,
      status: 'confirmed',
      paymentStatus: method === 'online' ? 'pending' : 'pending',
      paymentMethod: method,
      bookingType: 'online'
    });

    await turf.bookSlot(sDate, sDay, s.startTime, s.endTime, booking._id);
    await turf.save();
    
    // Auto-create a match for this booking (one per slot)
    try {
      const startDateTime = new Date(sDate);
      const [sh, sm] = String(s.startTime || '').split(':');
      startDateTime.setHours(parseInt(sh || '0'), parseInt(sm || '0'), 0, 0);
      const endDateTime = new Date(sDate);
      const [eh, em] = String(s.endTime || '').split(':');
      endDateTime.setHours(parseInt(eh || '0'), parseInt(em || '0'), 0, 0);

      const providedTeams = Array.isArray(teams) && teams.length >= 2 ? teams.slice(0,2) : [];
      const defaultTeams = [
        { name: 'Team A', score: 0, players: [], captain: '' },
        { name: 'Team B', score: 0, players: [], captain: '' }
      ];

      await Match.create({
        turfId: turf._id,
        ownerId: turf.ownerId,
        bookingId: booking._id,
        customerId: req.user.id,
        customerName: `${req.user.firstName || ''} ${req.user.lastName || ''}`.trim() || req.user.email || 'Customer',
        matchName: `${turf.name} Match` ,
        matchType: (turf.sport || 'football').toLowerCase(),
        startTime: startDateTime,
        endTime: endDateTime,
        teams: (providedTeams.length ? providedTeams : defaultTeams).map(t => ({
          name: t.name || 'Team',
          score: 0,
          players: Array.isArray(t.players) ? t.players : (typeof t.players === 'string' ? t.players.split(',').map(p=>p.trim()).filter(Boolean) : []),
          captain: t.captain || ''
        })),
        isPublic: true,
        status: 'scheduled'
      });
    } catch (e) {
      // Non-fatal if match creation fails
      console.warn('Match auto-create failed:', e.message);
    }
    created.push(booking);
  }

  // Email confirmation deferred: will be sent after successful payment.

  res.status(201).json({
    success: true,
    message: isBulk ? 'Bookings created' : 'Booking created',
    data: isBulk ? created : created[0]
  });
});

// @desc    Cancel a booking (customer)
// @route   DELETE /api/bookings/:id
// @access  Private
exports.cancelBooking = asyncHandler(async (req, res, next) => {
  const booking = await Booking.findById(req.params.id);
  if (!booking) {
    return next(new ErrorResponse('Booking not found', 404));
  }

  if (booking.customerId?.toString() !== req.user.id) {
    return next(new ErrorResponse('Not authorized to cancel this booking', 403));
  }

  // Cancel booking record
  await booking.cancelBooking(req.user.id, 'Cancelled by customer');

  // Free the slot on turf
  const turf = await Turf.findById(booking.turfId);
  if (turf) {
    const dayOfWeek = ['sunday','monday','tuesday','wednesday','thursday','friday','saturday'][booking.bookingDate.getDay()];
    await turf.cancelSlotBooking(booking.bookingDate, dayOfWeek, booking.startTime, booking.endTime);
    await turf.save();
  }

  res.status(200).json({ success: true, message: 'Booking cancelled' });
});

// @desc    Owner check-in booking by bookingCode
// @route   POST /api/bookings/checkin
// @access  Private/Owner
exports.checkInBooking = asyncHandler(async (req, res, next) => {
  const { bookingCode, turfId, date } = req.body;
  if (!bookingCode) {
    return next(new ErrorResponse('bookingCode is required', 400));
  }

  // Find booking by code and owner
  const booking = await Booking.findOne({ bookingCode });
  if (!booking) {
    return next(new ErrorResponse('Booking not found', 404));
  }

  if (booking.ownerId.toString() !== req.user.id) {
    return next(new ErrorResponse('Not authorized to check in this booking', 403));
  }

  // Optional validations: turf and date
  if (turfId && booking.turfId.toString() !== turfId) {
    return next(new ErrorResponse('Booking does not belong to this turf', 400));
  }
  if (date) {
    const d = new Date(date);
    const bd = new Date(booking.bookingDate);
    const sameDay = d.getFullYear() === bd.getFullYear() && d.getMonth() === bd.getMonth() && d.getDate() === bd.getDate();
    if (!sameDay) {
      return next(new ErrorResponse('Booking is not for the selected date', 400));
    }
  }

  // Mark as in_progress on check-in
  booking.status = 'in_progress';
  await booking.save();

  res.status(200).json({ success: true, data: booking, message: 'Booking checked-in successfully' });
});


