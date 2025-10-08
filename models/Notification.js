const mongoose = require('mongoose');

const notificationSchema = new mongoose.Schema({
  recipient: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  sender: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: false
  },
  type: {
    type: String,
    enum: ['info', 'success', 'warning', 'error'],
    default: 'info'
  },
  title: {
    type: String,
    required: true,
    maxlength: 100
  },
  message: {
    type: String,
    required: true,
    maxlength: 500
  },
  data: {
    type: mongoose.Schema.Types.Mixed,
    default: {}
  },
  category: {
    type: String,
    enum: ['request', 'booking', 'match', 'payment', 'system', 'general'],
    default: 'general'
  },
  isRead: {
    type: Boolean,
    default: false
  },
  readAt: {
    type: Date,
    default: null
  },
  actionUrl: {
    type: String,
    default: null
  },
  priority: {
    type: String,
    enum: ['low', 'medium', 'high'],
    default: 'medium'
  },
  expiresAt: {
    type: Date,
    default: null
  },
  relatedEntity: {
    type: {
      type: String,
      enum: ['Request', 'Booking', 'Match', 'Turf', 'User']
    },
    id: mongoose.Schema.Types.ObjectId
  }
}, {
  timestamps: true
});

// Indexes for performance
notificationSchema.index({ recipient: 1, isRead: 1, createdAt: -1 });
notificationSchema.index({ recipient: 1, category: 1, createdAt: -1 });
notificationSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

// Instance methods
notificationSchema.methods.markAsRead = function() {
  if (!this.isRead) {
    this.isRead = true;
    this.readAt = new Date();
    return this.save();
  }
  return Promise.resolve(this);
};

notificationSchema.methods.isExpired = function() {
  return this.expiresAt && new Date() > this.expiresAt;
};

// Static methods
notificationSchema.statics.createNotification = async function(notificationData) {
  const notification = new this(notificationData);
  return await notification.save();
};

notificationSchema.statics.getUnreadCount = async function(userId) {
  return await this.countDocuments({
    recipient: userId,
    isRead: false,
    $or: [
      { expiresAt: null },
      { expiresAt: { $gt: new Date() } }
    ]
  });
};

notificationSchema.statics.getNotifications = async function(userId, options = {}) {
  const {
    page = 1,
    limit = 20,
    category = null,
    isRead = null,
    sortBy = 'createdAt',
    sortOrder = 'desc'
  } = options;

  const query = {
    recipient: userId,
    $or: [
      { expiresAt: null },
      { expiresAt: { $gt: new Date() } }
    ]
  };

  if (category) query.category = category;
  if (isRead !== null) query.isRead = isRead;

  const sortOptions = {};
  sortOptions[sortBy] = sortOrder === 'desc' ? -1 : 1;

  const notifications = await this.find(query)
    .populate('sender', 'firstName lastName avatar')
    .sort(sortOptions)
    .limit(limit * 1)
    .skip((page - 1) * limit);

  const total = await this.countDocuments(query);

  return {
    notifications,
    totalPages: Math.ceil(total / limit),
    currentPage: page,
    total
  };
};

notificationSchema.statics.markAllAsRead = async function(userId) {
  return await this.updateMany(
    { 
      recipient: userId, 
      isRead: false,
      $or: [
        { expiresAt: null },
        { expiresAt: { $gt: new Date() } }
      ]
    },
    { 
      isRead: true, 
      readAt: new Date() 
    }
  );
};

notificationSchema.statics.deleteOldNotifications = async function(daysOld = 90) {
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - daysOld);
  
  return await this.deleteMany({
    createdAt: { $lt: cutoffDate },
    isRead: true
  });
};

module.exports = mongoose.model('Notification', notificationSchema);