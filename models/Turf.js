const mongoose = require('mongoose');

const TurfSchema = new mongoose.Schema({
  ownerId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: [true, 'Owner ID is required']
  },
  name: {
    type: String,
    required: [true, 'Turf name is required'],
    trim: true,
    maxlength: [100, 'Turf name cannot be more than 100 characters']
  },
  location: {
    address: {
      type: String,
      required: [true, 'Address is required'],
      trim: true
    },
    coordinates: {
      lat: {
        type: Number,
        required: false,
        min: [-90, 'Invalid latitude'],
        max: [90, 'Invalid latitude']
      },
      lng: {
        type: Number,
        required: false,
        min: [-180, 'Invalid longitude'],
        max: [180, 'Invalid longitude']
      }
    }
  },
  pricePerHour: {
    type: Number,
    required: [true, 'Price per hour is required'],
    min: [0, 'Price cannot be negative']
  },
  images: [{
    type: String,
    required: [true, 'At least one image is required'],
    validate: {
      validator: function(url) {
        // Accept HTTP/HTTPS URLs (including placeholder URLs for dev mode)
        return /^https?:\/\/.+/.test(url);
      },
      message: 'Image must be a valid HTTP/HTTPS URL'
    }
  }],
  sport: {
    type: String,
    required: [true, 'Sport type is required'],
    enum: ['Football', 'Cricket', 'Basketball', 'Tennis', 'Badminton', 'Volleyball']
  },
  description: {
    type: String,
    trim: true,
    maxlength: [500, 'Description cannot be more than 500 characters']
  },
  amenities: [{
    type: String,
    enum: [
      'Floodlights', 'Parking', 'Changing Room', 'Washroom', 'Drinking Water',
      'First Aid', 'Equipment Rental', 'Cafeteria', 'AC', 'Sound System',
      'Professional Pitch', 'Scoreboard', 'Pavilion', 'Pro Shop', 'Coaching'
    ]
  }],
  rating: {
    type: Number,
    default: 0,
    min: [0, 'Rating cannot be negative'],
    max: [5, 'Rating cannot be more than 5']
  },
  totalReviews: {
    type: Number,
    default: 0
  },
  isApproved: {
    type: Boolean,
    default: true
  },
  isFeatured: {
    type: Boolean,
    default: false
  },

  // Original registration data (cannot be changed by owner)
  originalRegistrationData: {
    name: {
      type: String,
      required: true
    },
    address: {
      type: String,
      required: true
    },
    businessName: {
      type: String,
      required: true
    }
  },

  // Slot Management Fields
  availableSlots: {
    monday: {
      isOpen: { type: Boolean, default: true },
      slots: [{
        startTime: { type: String, required: true },
        endTime: { type: String, required: true },
        price: { type: Number, required: true },
        isBooked: { type: Boolean, default: false },
        bookedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
        bookingDate: { type: Date }
      }]
    },
    tuesday: {
      isOpen: { type: Boolean, default: true },
      slots: [{
        startTime: { type: String, required: true },
        endTime: { type: String, required: true },
        price: { type: Number, required: true },
        isBooked: { type: Boolean, default: false },
        bookedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
        bookingDate: { type: Date }
      }]
    },
    wednesday: {
      isOpen: { type: Boolean, default: true },
      slots: [{
        startTime: { type: String, required: true },
        endTime: { type: String, required: true },
        price: { type: Number, required: true },
        isBooked: { type: Boolean, default: false },
        bookedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
        bookingDate: { type: Date }
      }]
    },
    thursday: {
      isOpen: { type: Boolean, default: true },
      slots: [{
        startTime: { type: String, required: true },
        endTime: { type: String, required: true },
        price: { type: Number, required: true },
        isBooked: { type: Boolean, default: false },
        bookedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
        bookingDate: { type: Date }
      }]
    },
    friday: {
      isOpen: { type: Boolean, default: true },
      slots: [{
        startTime: { type: String, required: true },
        endTime: { type: String, required: true },
        price: { type: Number, required: true },
        isBooked: { type: Boolean, default: false },
        bookedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
        bookingDate: { type: Date }
      }]
    },
    saturday: {
      isOpen: { type: Boolean, default: true },
      slots: [{
        startTime: { type: String, required: true },
        endTime: { type: String, required: true },
        price: { type: Number, required: true },
        isBooked: { type: Boolean, default: false },
        bookedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
        bookingDate: { type: Date }
      }]
    },
    sunday: {
      isOpen: { type: Boolean, default: true },
      slots: [{
        startTime: { type: String, required: true },
        endTime: { type: String, required: true },
        price: { type: Number, required: true },
        isBooked: { type: Boolean, default: false },
        bookedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
        bookingDate: { type: Date }
      }]
    }
  },

  slotDuration: {
    type: Number,
    default: 60, // minutes
    enum: [30, 60, 90, 120]
  },

  advanceBookingDays: {
    type: Number,
    default: 30,
    min: 1,
    max: 90
  },

  // Pending changes that require admin approval
  pendingChanges: {
    type: Map,
    of: mongoose.Schema.Types.Mixed,
    default: new Map()
  },

  // Status of pending changes
  changesApprovalStatus: {
    type: String,
    enum: ['none', 'pending', 'approved', 'rejected'],
    default: 'none'
  },

  // Admin notes for change approval/rejection
  changeApprovalNotes: {
    type: String,
    trim: true
  },
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

// Create geospatial index for location queries
TurfSchema.index({ 'location.coordinates': '2dsphere' }, { background: true });

// Virtual for formatted price
TurfSchema.virtual('formattedPrice').get(function() {
  return `₹${this.pricePerHour}/hour`;
});

// Virtual for formatted address
TurfSchema.virtual('formattedAddress').get(function() {
  return this.location.address;
});

// Pre-save middleware to update updatedAt and validate turf data
TurfSchema.pre('save', async function(next) {
  this.updatedAt = Date.now();

  // Check if owner is approved and active before saving
  if (this.ownerId) {
    const User = require('./User');
    const owner = await User.findById(this.ownerId);

    if (!owner || owner.adminApprovalStatus !== 'approved' || !owner.isActive) {
      // If owner is not approved or inactive, mark turf as not approved
      this.isApproved = false;
    }

    // For new turfs, validate against owner's registration data
    if (this.isNew) {
      // Set original registration data from owner's profile
      this.originalRegistrationData = {
        name: this.name,
        address: this.location.address,
        businessName: owner.businessName
      };

      // Strict validation for new turfs - must match registration data exactly
      if (this.name !== owner.businessName) {
        const error = new Error(`Turf name must match your business name from registration: "${owner.businessName}"`);
        error.name = 'ValidationError';
        return next(error);
      }

      if (this.location.address !== owner.turfLocation) {
        const error = new Error(`Turf location must match your registered location: "${owner.turfLocation}"`);
        error.name = 'ValidationError';
        return next(error);
      }

      // Check if sport type is allowed for this owner
      const allowedSports = owner.sportTypes || [owner.sportType];
      if (!allowedSports.includes(this.sport)) {
        const sportsList = allowedSports.join(', ');
        const error = new Error(`Sport type must be one of your registered sport types: ${sportsList}`);
        error.name = 'ValidationError';
        return next(error);
      }
    }
  }

  next();
});

// Static method to find turfs by owner
TurfSchema.statics.findByOwner = function(ownerId) {
  return this.find({ ownerId }).sort({ createdAt: -1 });
};

// Static method to find nearby turfs (only from approved owners)
TurfSchema.statics.findNearby = function(coordinates, maxDistance = 10000) {
  return this.aggregate([
    {
      $geoNear: {
        near: {
          type: 'Point',
          coordinates: [coordinates.lng, coordinates.lat]
        },
        distanceField: 'distance',
        maxDistance: maxDistance,
        spherical: true,
        query: { isApproved: true }
      }
    },
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
      $project: {
        owner: 0 // Remove owner data from response for privacy
      }
    }
  ]);
};

// Instance method to check if turf is available for booking
TurfSchema.methods.isAvailable = function(date, startTime, endTime) {
  // This would need to be implemented with booking logic
  return true;
};

// Method to check if a specific slot is available on a given date
TurfSchema.methods.isSlotAvailable = function(date, dayOfWeek, startTime, endTime) {
  const daySlots = this.availableSlots[dayOfWeek];
  
  if (!daySlots || !daySlots.isOpen) {
    return false;
  }

  // Find the slot that matches the time range
  const slot = daySlots.slots.find(slot => 
    slot.startTime === startTime && slot.endTime === endTime
  );

  if (!slot) {
    return false;
  }

  // Check if slot is already booked for this date
  return !slot.isBooked || 
         (slot.bookingDate && slot.bookingDate.toDateString() !== date.toDateString());
};

// Method to book a slot
TurfSchema.methods.bookSlot = function(date, dayOfWeek, startTime, endTime, userId) {
  const daySlots = this.availableSlots[dayOfWeek];
  
  if (!daySlots || !daySlots.isOpen) {
    throw new Error('Turf is closed on this day');
  }

  const slot = daySlots.slots.find(slot => 
    slot.startTime === startTime && slot.endTime === endTime
  );

  if (!slot) {
    throw new Error('Slot not found');
  }

  if (slot.isBooked && slot.bookingDate && 
      slot.bookingDate.toDateString() === date.toDateString()) {
    throw new Error('Slot is already booked for this date');
  }

  slot.isBooked = true;
  slot.bookedBy = userId;
  slot.bookingDate = date;

  // Do not save here; caller should persist once after all changes
  return this;
};

// Method to cancel a slot booking
TurfSchema.methods.cancelSlotBooking = function(date, dayOfWeek, startTime, endTime) {
  const daySlots = this.availableSlots[dayOfWeek];
  
  if (!daySlots) {
    throw new Error('Invalid day');
  }

  const slot = daySlots.slots.find(slot => 
    slot.startTime === startTime && slot.endTime === endTime
  );

  if (!slot) {
    throw new Error('Slot not found');
  }

  if (!slot.isBooked || !slot.bookingDate || 
      slot.bookingDate.toDateString() !== date.toDateString()) {
    throw new Error('No booking found for this slot on this date');
  }

  slot.isBooked = false;
  slot.bookedBy = null;
  slot.bookingDate = null;

  // Do not save here; caller should persist once after all changes
  return this;
};

// Helper method to parse time string to minutes
TurfSchema.methods.parseTimeToMinutes = function(timeString) {
  if (!timeString) return 0;
  
  // Handle formats like "10:30", "10:30 AM", "10:30 PM"
  const time = timeString.replace(/\s*(AM|PM)\s*/i, '').trim();
  const [hours, minutes] = time.split(':').map(Number);
  
  let totalMinutes = hours * 60 + (minutes || 0);
  
  // Handle AM/PM if present
  if (timeString.toUpperCase().includes('PM') && hours !== 12) {
    totalMinutes += 12 * 60; // Add 12 hours for PM
  } else if (timeString.toUpperCase().includes('AM') && hours === 12) {
    totalMinutes -= 12 * 60; // Subtract 12 hours for 12 AM
  }
  
  return totalMinutes;
};

// Method to get available slots for a specific date
TurfSchema.methods.getAvailableSlots = function(date) {
  const dayOfWeek = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'][date.getDay()];
  const daySlots = this.availableSlots[dayOfWeek];
  
  if (!daySlots || !daySlots.isOpen) {
    return [];
  }

  const today = new Date();
  const isToday = date.toDateString() === today.toDateString();
  const currentTime = today.getHours() * 60 + today.getMinutes(); // Current time in minutes

  return daySlots.slots.filter(slot => {
    // Check if slot is booked for this specific date
    const isBookedForThisDate = slot.isBooked && 
      slot.bookingDate && 
      slot.bookingDate.toDateString() === date.toDateString();
    
    if (isBookedForThisDate) {
      return false; // Don't show booked slots
    }

    // If it's today, filter out past time slots
    if (isToday) {
      const slotStartTime = this.parseTimeToMinutes(slot.startTime);
      if (slotStartTime <= currentTime) {
        return false; // Don't show past slots
      }
    }

    return true;
  }).map(slot => ({
    startTime: slot.startTime,
    endTime: slot.endTime,
    price: slot.price,
    isAvailable: true
  }));
};

// Method to get all bookings for a specific date
TurfSchema.methods.getBookingsForDate = function(date) {
  const dayOfWeek = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'][date.getDay()];
  const daySlots = this.availableSlots[dayOfWeek];
  
  if (!daySlots) {
    return [];
  }

  return daySlots.slots.filter(slot => 
    slot.isBooked && 
    slot.bookingDate && 
    slot.bookingDate.toDateString() === date.toDateString()
  ).map(slot => ({
    startTime: slot.startTime,
    endTime: slot.endTime,
    price: slot.price,
    bookedBy: slot.bookedBy,
    bookingDate: slot.bookingDate
  }));
};

module.exports = mongoose.model('Turf', TurfSchema);
