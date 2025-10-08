const mongoose = require('mongoose');

const turfModificationSchema = new mongoose.Schema({
  // Owner Information
  ownerId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  ownerEmail: {
    type: String,
    required: true
  },
  ownerBusinessName: {
    type: String,
    required: true
  },

  // Modification Type
  modificationType: {
    type: String,
    enum: ['add_new_turf', 'modify_existing_turf', 'add_sports_to_existing'],
    required: true
  },

  // For existing turf modifications
  existingTurfId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Turf',
    required: function() {
      return this.modificationType !== 'add_new_turf';
    }
  },
  existingTurfName: {
    type: String,
    required: function() {
      return this.modificationType !== 'add_new_turf';
    }
  },

  // New Turf Information (for add_new_turf and modify_existing_turf)
  newTurfData: {
    name: {
      type: String,
      required: function() {
        return this.modificationType !== 'add_sports_to_existing';
      },
      trim: true,
      maxlength: [100, 'Turf name cannot exceed 100 characters']
    },
    description: {
      type: String,
      required: function() {
        return this.modificationType !== 'add_sports_to_existing';
      },
      maxlength: [1000, 'Description cannot exceed 1000 characters']
    },
    address: {
      type: String,
      required: function() {
        return this.modificationType !== 'add_sports_to_existing';
      }
    },
    location: {
      type: {
        type: String,
        enum: ['Point'],
        default: 'Point'
      },
      coordinates: {
        type: [Number],
        required: function() {
          return this.modificationType !== 'add_sports_to_existing';
        },
        index: '2dsphere'
      }
    },
    city: {
      type: String,
      required: function() {
        return this.modificationType !== 'add_sports_to_existing';
      }
    },
    state: {
      type: String,
      required: function() {
        return this.modificationType !== 'add_sports_to_existing';
      }
    },
    pincode: {
      type: String,
      required: function() {
        return this.modificationType !== 'add_sports_to_existing';
      },
      match: [/^[0-9]{6}$/, 'Please enter a valid 6-digit pincode']
    },
    contactNumber: {
      type: String,
      required: function() {
        return this.modificationType !== 'add_sports_to_existing';
      },
      match: [/^[0-9]{10}$/, 'Please enter a valid 10-digit contact number']
    },
    email: {
      type: String,
      required: function() {
        return this.modificationType !== 'add_sports_to_existing';
      },
      match: [/^\S+@\S+\.\S+$/, 'Please enter a valid email address']
    },
    sportTypes: [{
      type: String,
      enum: ['Football', 'Cricket', 'Basketball', 'Tennis', 'Badminton', 'Volleyball'],
      required: true
    }],
    amenities: [{
      type: String,
      enum: ['Parking', 'Changing Room', 'Washroom', 'Water', 'Lighting', 'Seating', 'First Aid', 'Equipment Rental', 'Cafeteria', 'WiFi']
    }],
    rules: [{
      type: String,
      maxlength: [200, 'Each rule cannot exceed 200 characters']
    }],
    images: [{
      url: String,
      publicId: String,
      caption: String
    }],
    pricing: {
      hourlyRate: {
        type: Number,
        required: function() {
          return this.modificationType !== 'add_sports_to_existing';
        },
        min: [0, 'Hourly rate cannot be negative']
      },
      dailyRate: {
        type: Number,
        min: [0, 'Daily rate cannot be negative']
      },
      currency: {
        type: String,
        default: 'INR'
      }
    },
    openingHours: {
      monday: { open: String, close: String, isClosed: { type: Boolean, default: false } },
      tuesday: { open: String, close: String, isClosed: { type: Boolean, default: false } },
      wednesday: { open: String, close: String, isClosed: { type: Boolean, default: false } },
      thursday: { open: String, close: String, isClosed: { type: Boolean, default: false } },
      friday: { open: String, close: String, isClosed: { type: Boolean, default: false } },
      saturday: { open: String, close: String, isClosed: { type: Boolean, default: false } },
      sunday: { open: String, close: String, isClosed: { type: Boolean, default: false } }
    },
    slotDuration: {
      type: Number,
      default: 60,
      min: [30, 'Slot duration must be at least 30 minutes'],
      max: [240, 'Slot duration cannot exceed 240 minutes']
    }
  },

  // Additional Sports (for add_sports_to_existing)
  additionalSports: [{
    type: String,
    enum: ['Football', 'Cricket', 'Basketball', 'Tennis', 'Badminton', 'Volleyball']
  }],

  // Status and Approval
  status: {
    type: String,
    enum: ['pending', 'approved', 'rejected'],
    default: 'pending'
  },

  // Admin Review
  adminReview: {
    reviewedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    reviewedAt: Date,
    decision: {
      type: String,
      enum: ['approved', 'rejected']
    },
    comments: {
      type: String,
      maxlength: [500, 'Review comments cannot exceed 500 characters']
    },
    rejectionReason: {
      type: String,
      enum: ['incomplete_information', 'invalid_documents', 'location_issues', 'pricing_concerns', 'other']
    },
    customRejectionReason: {
      type: String,
      maxlength: [300, 'Custom rejection reason cannot exceed 300 characters']
    }
  },

  // Implementation Tracking
  implementationStatus: {
    type: String,
    enum: ['not_implemented', 'implementing', 'implemented', 'failed'],
    default: 'not_implemented'
  },
  implementedAt: Date,
  implementationError: String,

  // Timestamps
  submittedAt: {
    type: Date,
    default: Date.now
  },
  
  // Notifications
  ownerNotified: {
    type: Boolean,
    default: false
  },
  adminNotified: {
    type: Boolean,
    default: false
  }

}, {
  timestamps: true
});

// Indexes for better query performance
turfModificationSchema.index({ ownerId: 1, status: 1 });
turfModificationSchema.index({ status: 1, submittedAt: 1 });
turfModificationSchema.index({ modificationType: 1, status: 1 });
turfModificationSchema.index({ 'newTurfData.location': '2dsphere' });

module.exports = mongoose.model('TurfModification', turfModificationSchema);