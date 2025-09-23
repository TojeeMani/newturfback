const mongoose = require('mongoose');

const OwnerDocumentSchema = new mongoose.Schema(
  {
    ownerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    documentType: {
      type: String,
      enum: ['business_license', 'pan_card', 'aadhaar_card', 'gst_certificate', 'other'],
      default: 'other'
    },
    fileUrl: {
      type: String,
      required: true
    },
    extractedText: {
      type: String,
      default: ''
    },
    verified: {
      type: Boolean,
      default: false
    },
    flaggedReason: {
      type: String,
      default: ''
    },
    nameMatch: {
      type: Boolean,
      default: false
    },
    detected: {
      aadhaar: { type: String, default: null },
      pan: { type: String, default: null },
      gst: { type: String, default: null }
    }
  },
  { timestamps: true }
);

module.exports = mongoose.model('OwnerDocument', OwnerDocumentSchema);


