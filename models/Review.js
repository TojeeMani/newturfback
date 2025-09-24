const mongoose = require('mongoose');

const ReviewSchema = new mongoose.Schema({
  turfId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Turf',
    required: true
  },
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  bookingId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Booking',
    required: true
  },
  rating: {
    type: Number,
    min: 1,
    max: 5,
    required: true
  },
  comment: {
    type: String,
    trim: true,
    default: ''
  },
  isVerified: {
    type: Boolean,
    default: true // Set to true since we validate booking completion
  }
}, { timestamps: true });

ReviewSchema.index({ bookingId: 1 }, { unique: true }); // One review per booking

module.exports = mongoose.model('Review', ReviewSchema);


