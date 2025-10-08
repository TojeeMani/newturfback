const mongoose = require('mongoose');

const requestSchema = new mongoose.Schema({
  ownerId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  type: {
    type: String,
    enum: ['newTurf', 'newSport'],
    required: true
  },
  status: {
    type: String,
    enum: ['pending', 'approved', 'rejected'],
    default: 'pending'
  },
  data: {
    // Common fields for both types
    contactNumber: {
      type: String,
      required: true
    },
    pricing: {
      type: Number,
      required: true,
      min: 0
    },
    
    // New Turf specific fields
    turfName: String,
    turfDescription: String,
    location: {
      address: String,
      city: String,
      state: String,
      pincode: String,
      mapLink: String
    },
    availableSports: [String],
    turfImages: [String], // Cloudinary URLs
    
    // New Sport specific fields
    turfId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Turf'
    },
    sportName: String,
    sportCategory: {
      type: String,
      enum: ['Indoor', 'Outdoor']
    },
    sportDescription: String,
    sportImages: [String] // Cloudinary URLs
  },
  
  // Admin review fields
  reviewedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  reviewedAt: Date,
  rejectionReason: String,
  
  // Notification tracking
  ownerNotified: {
    type: Boolean,
    default: false
  },
  notificationSentAt: Date
}, {
  timestamps: true
});

// Indexes for efficient queries
requestSchema.index({ ownerId: 1, status: 1 });
requestSchema.index({ type: 1, status: 1 });
requestSchema.index({ createdAt: -1 });

module.exports = mongoose.model('Request', requestSchema);