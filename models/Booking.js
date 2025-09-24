const mongoose = require('mongoose');

const BookingSchema = new mongoose.Schema({
  // Basic booking information
  turfId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Turf',
    required: [true, 'Turf ID is required']
  },
  ownerId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: [true, 'Owner ID is required']
  },
  customerId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: false // For offline bookings, this might be null
  },
  
  // Customer information (for offline bookings)
  customerInfo: {
    name: {
      type: String,
      required: [true, 'Customer name is required'],
      trim: true
    },
    phone: {
      type: String,
      required: [true, 'Customer phone is required'],
      trim: true
    },
    email: {
      type: String,
      trim: true,
      lowercase: true
    }
  },
  
  // Booking details
  bookingDate: {
    type: Date,
    required: [true, 'Booking date is required']
  },
  startTime: {
    type: String,
    required: [true, 'Start time is required']
  },
  endTime: {
    type: String,
    required: [true, 'End time is required']
  },
  duration: {
    type: Number, // in minutes
    required: false,
    default: 0
  },
  
  // Pricing information
  pricePerHour: {
    type: Number,
    required: [true, 'Price per hour is required'],
    min: [0, 'Price cannot be negative']
  },
  totalAmount: {
    type: Number,
    required: false,
    default: 0,
    min: [0, 'Total amount cannot be negative']
  },
  
  // Booking status
  status: {
    type: String,
    enum: ['confirmed', 'in_progress', 'pending', 'cancelled', 'completed', 'no-show'],
    default: 'confirmed'
  },
  
  // Payment information
  paymentStatus: {
    type: String,
    enum: ['pending', 'paid', 'partial', 'refunded', 'failed'],
    default: 'pending'
  },
  paymentMethod: {
    type: String,
    enum: ['cash', 'card', 'upi', 'bank_transfer', 'online'],
    default: 'cash'
  },
  paymentAmount: {
    type: Number,
    default: 0,
    min: [0, 'Payment amount cannot be negative']
  },
  
  // Booking type
  bookingType: {
    type: String,
    enum: ['online', 'offline', 'walk-in'],
    default: 'offline'
  },
  
  // Additional information
  notes: {
    type: String,
    trim: true,
    maxlength: [500, 'Notes cannot be more than 500 characters']
  },
  
  // Cancellation information
  cancellationReason: {
    type: String,
    trim: true
  },
  cancelledAt: {
    type: Date
  },
  cancelledBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  
  // Refund information
  refundAmount: {
    type: Number,
    default: 0,
    min: [0, 'Refund amount cannot be negative']
  },
  refundStatus: {
    type: String,
    enum: ['none', 'pending', 'processed', 'failed'],
    default: 'none'
  },
  
  // Post-completion email
  reviewEmailSent: {
    type: Boolean,
    default: false
  },

  // Verification helpers
  bookingCode: {
    type: String,
    index: true
  },
  
  // Timestamps
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Virtual populate for reviews
BookingSchema.virtual('reviews', {
  ref: 'Review',
  localField: '_id',
  foreignField: 'bookingId',
  justOne: false
});

// Indexes for better query performance
BookingSchema.index({ turfId: 1, bookingDate: 1 });
BookingSchema.index({ ownerId: 1, bookingDate: 1 });
BookingSchema.index({ customerId: 1, bookingDate: 1 });
BookingSchema.index({ status: 1 });
BookingSchema.index({ paymentStatus: 1 });
BookingSchema.index({ bookingDate: 1, startTime: 1, endTime: 1 });
BookingSchema.index({ bookingCode: 1 });

// Virtual for formatted booking time
BookingSchema.virtual('timeSlot').get(function() {
  return `${this.startTime} - ${this.endTime}`;
});

// Virtual for formatted date
BookingSchema.virtual('formattedDate').get(function() {
  return this.bookingDate.toLocaleDateString('en-IN');
});

// Virtual for booking duration in hours
BookingSchema.virtual('durationHours').get(function() {
  return this.duration / 60;
});

// QR payload virtual
BookingSchema.virtual('qrPayload').get(function() {
  return JSON.stringify({
    bookingId: this._id?.toString(),
    bookingCode: this.bookingCode,
    turfId: this.turfId?.toString(),
    date: this.bookingDate,
    startTime: this.startTime,
    endTime: this.endTime
  });
});

// Virtual to check if booking has a review
BookingSchema.virtual('hasReview').get(function() {
  return this.reviews && this.reviews.length > 0;
});

// Ensure duration and totalAmount are set before validation
BookingSchema.pre('validate', function(next) {
  if (this.startTime && this.endTime && this.pricePerHour != null) {
    const start = new Date(`2000-01-01 ${this.startTime}`);
    const end = new Date(`2000-01-01 ${this.endTime}`);
    const minutes = (end - start) / (1000 * 60);
    this.duration = minutes;
    this.totalAmount = (minutes / 60) * this.pricePerHour;
  }
  next();
});

// Pre-save middleware to update timestamps and generate booking code
BookingSchema.pre('save', async function(next) {
  this.updatedAt = Date.now();
  if (this.isNew && !this.bookingCode) {
    // Generate a simple 4-digit numeric code, ensure low-collision by retrying a few times
    for (let i = 0; i < 5; i++) {
      const code = String(Math.floor(1000 + Math.random() * 9000));
      // Check for uniqueness only among upcoming bookings to avoid long scans
      // eslint-disable-next-line no-await-in-loop
      const exists = await this.constructor.findOne({ bookingCode: code });
      if (!exists) {
        this.bookingCode = code;
        break;
      }
    }
    // Fallback if still not set
    if (!this.bookingCode) {
      this.bookingCode = String(Math.floor(1000 + Math.random() * 9000));
    }
  }
  next();
});

// Static method to find bookings by turf
BookingSchema.statics.findByTurf = function(turfId, options = {}) {
  const query = { turfId };
  
  if (options.date) {
    const startOfDay = new Date(options.date);
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date(options.date);
    endOfDay.setHours(23, 59, 59, 999);
    
    query.bookingDate = {
      $gte: startOfDay,
      $lte: endOfDay
    };
  }
  
  if (options.status) {
    query.status = options.status;
  }
  
  return this.find(query)
    .populate('turfId', 'name location sport')
    .populate('customerId', 'name email phone')
    .sort({ bookingDate: 1, startTime: 1 });
};

// Static method to find bookings by owner
BookingSchema.statics.findByOwner = function(ownerId, options = {}) {
  const query = { ownerId };
  
  if (options.date) {
    const startOfDay = new Date(options.date);
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date(options.date);
    endOfDay.setHours(23, 59, 59, 999);
    
    query.bookingDate = {
      $gte: startOfDay,
      $lte: endOfDay
    };
  }
  
  if (options.status) {
    query.status = options.status;
  }
  
  if (options.turfId) {
    query.turfId = options.turfId;
  }
  
  return this.find(query)
    .populate('turfId', 'name location sport')
    .populate('customerId', 'name email phone')
    .sort({ bookingDate: 1, startTime: 1 });
};

// Static method to find bookings by customer
BookingSchema.statics.findByCustomer = function(customerId, options = {}) {
  const query = { customerId };
  
  if (options.status) {
    query.status = options.status;
  }
  
  return this.find(query)
    .populate('turfId', 'name location sport images')
    .populate('ownerId', 'name businessName')
    .populate({
      path: 'reviews',
      match: { userId: customerId },
      select: 'rating comment'
    })
    .sort({ bookingDate: -1 });
};

// Instance method to check if booking can be cancelled
BookingSchema.methods.canBeCancelled = function() {
  if (this.status === 'cancelled' || this.status === 'completed') {
    return false;
  }
  
  // Check if booking is at least 2 hours in the future
  const bookingDateTime = new Date(this.bookingDate);
  const [hours, minutes] = this.startTime.split(':');
  bookingDateTime.setHours(parseInt(hours), parseInt(minutes), 0, 0);
  
  const now = new Date();
  const timeDiff = bookingDateTime - now;
  const hoursDiff = timeDiff / (1000 * 60 * 60);
  
  return hoursDiff >= 2;
};

// Instance method to cancel booking
BookingSchema.methods.cancelBooking = function(cancelledBy, reason) {
  if (!this.canBeCancelled()) {
    throw new Error('Booking cannot be cancelled');
  }
  
  this.status = 'cancelled';
  this.cancellationReason = reason;
  this.cancelledAt = new Date();
  this.cancelledBy = cancelledBy;
  
  return this.save();
};

// Instance method to mark as completed
BookingSchema.methods.markCompleted = function() {
  this.status = 'completed';
  return this.save();
};

// Instance method to update payment status
BookingSchema.methods.updatePayment = function(paymentData) {
  this.paymentStatus = paymentData.status;
  this.paymentMethod = paymentData.method;
  this.paymentAmount = paymentData.amount;
  
  return this.save();
};

module.exports = mongoose.model('Booking', BookingSchema);