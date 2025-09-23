const mongoose = require('mongoose');

const MatchSchema = new mongoose.Schema({
  turfId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Turf',
    required: true
  },
  ownerId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  // Link back to the originating booking and customer
  bookingId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Booking',
    index: true
  },
  customerId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    index: true
  },
  customerName: {
    type: String
  },
  matchName: {
    type: String,
    required: true
  },
  matchType: {
    type: String,
    enum: ['football', 'cricket', 'basketball', 'tennis', 'badminton', 'other'],
    required: true
  },
  startTime: {
    type: Date,
    required: true
  },
  endTime: {
    type: Date,
    required: true
  },
  status: {
    type: String,
    enum: ['scheduled', 'live', 'completed', 'cancelled'],
    default: 'scheduled'
  },
  teams: [{
    name: String,
    score: { type: Number, default: 0 },
    players: [String],
    captain: String
  }],
  statistics: {
    // Football specific
    goals: [{
      team: Number,
      player: String,
      time: String,
      type: { type: String, enum: ['goal', 'own_goal', 'penalty'] }
    }],
    cards: [{
      team: Number,
      player: String,
      time: String,
      type: { type: String, enum: ['yellow', 'red'] }
    }],
    substitutions: [{
      team: Number,
      playerOut: String,
      playerIn: String,
      time: String
    }],
    // Cricket specific
    overs: { type: Number, default: 0 },
    wickets: [{
      team: Number,
      batsman: String,
      bowler: String,
      time: String,
      type: String
    }],
    runs: [{
      team: Number,
      batsman: String,
      runs: Number,
      time: String
    }],
    // Basketball specific
    quarters: [{
      quarter: Number,
      team1Score: Number,
      team2Score: Number
    }],
    // General statistics
    possession: {
      team1: { type: Number, default: 50 },
      team2: { type: Number, default: 50 }
    },
    shots: {
      team1: { type: Number, default: 0 },
      team2: { type: Number, default: 0 }
    },
    fouls: {
      team1: { type: Number, default: 0 },
      team2: { type: Number, default: 0 }
    }
  },
  liveUpdates: [{
    type: {
      type: String,
      enum: ['goal', 'card', 'substitution', 'wicket', 'run', 'quarter', 'general'],
      required: true
    },
    team: Number,
    player: String,
    description: String,
    time: String,
    timestamp: { type: Date, default: Date.now }
  }],
  isPublic: {
    type: Boolean,
    default: true
  },
  shareCode: {
    type: String,
    unique: true,
    sparse: true
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
});

// Generate share code before saving
MatchSchema.pre('save', function(next) {
  if (this.isNew && !this.shareCode) {
    this.shareCode = Math.random().toString(36).substring(2, 8).toUpperCase();
  }
  this.updatedAt = Date.now();
  next();
});

module.exports = mongoose.model('Match', MatchSchema);
