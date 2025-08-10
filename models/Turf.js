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
        required: [true, 'Latitude is required'],
        min: [-90, 'Invalid latitude'],
        max: [90, 'Invalid latitude']
      },
      lng: {
        type: Number,
        required: [true, 'Longitude is required'],
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
    required: [true, 'At least one image is required']
  }],
  isApproved: {
    type: Boolean,
    default: false
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

// Pre-save middleware to update updatedAt
TurfSchema.pre('save', function(next) {
  this.updatedAt = Date.now();
  next();
});

// Static method to find turfs by owner
TurfSchema.statics.findByOwner = function(ownerId) {
  return this.find({ ownerId }).sort({ createdAt: -1 });
};

// Static method to find nearby turfs
TurfSchema.statics.findNearby = function(coordinates, maxDistance = 10000) {
  return this.find({
    'location.coordinates': {
      $near: {
        $geometry: {
          type: 'Point',
          coordinates: [coordinates.lng, coordinates.lat]
        },
        $maxDistance: maxDistance
      }
    },
    isApproved: true
  });
};

// Instance method to check if turf is available for booking
TurfSchema.methods.isAvailable = function(date, startTime, endTime) {
  // This would need to be implemented with booking logic
  return true;
};

module.exports = mongoose.model('Turf', TurfSchema);
