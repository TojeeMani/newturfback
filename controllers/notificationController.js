const Notification = require('../models/Notification');
const User = require('../models/User');
const ErrorResponse = require('../utils/errorResponse');
const asyncHandler = require('../middleware/async');

// @desc    Get all notifications for the authenticated user
// @route   GET /api/notifications
// @access  Private
exports.getNotifications = asyncHandler(async (req, res, next) => {
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 20;
  const category = req.query.category || null;
  const isRead = req.query.isRead !== undefined ? req.query.isRead === 'true' : null;

  const options = {
    page,
    limit,
    category,
    isRead,
    sortBy: req.query.sortBy || 'createdAt',
    sortOrder: req.query.sortOrder || 'desc'
  };

  const result = await Notification.getNotifications(req.user.id, options);

  res.status(200).json({
    success: true,
    data: result.notifications,
    pagination: {
      currentPage: result.currentPage,
      totalPages: result.totalPages,
      totalItems: result.total,
      itemsPerPage: limit
    }
  });
});

// @desc    Get unread notification count
// @route   GET /api/notifications/unread-count
// @access  Private
exports.getUnreadCount = asyncHandler(async (req, res, next) => {
  const count = await Notification.getUnreadCount(req.user.id);

  res.status(200).json({
    success: true,
    data: { count }
  });
});

// @desc    Mark notification as read
// @route   PATCH /api/notifications/:id/read
// @access  Private
exports.markAsRead = asyncHandler(async (req, res, next) => {
  const notification = await Notification.findOne({
    _id: req.params.id,
    recipient: req.user.id
  });

  if (!notification) {
    return next(new ErrorResponse('Notification not found', 404));
  }

  await notification.markAsRead();

  res.status(200).json({
    success: true,
    message: 'Notification marked as read',
    data: notification
  });
});

// @desc    Mark all notifications as read
// @route   PATCH /api/notifications/mark-all-read
// @access  Private
exports.markAllAsRead = asyncHandler(async (req, res, next) => {
  const result = await Notification.markAllAsRead(req.user.id);

  res.status(200).json({
    success: true,
    message: 'All notifications marked as read',
    data: { modifiedCount: result.modifiedCount }
  });
});

// @desc    Delete a notification
// @route   DELETE /api/notifications/:id
// @access  Private
exports.deleteNotification = asyncHandler(async (req, res, next) => {
  const notification = await Notification.findOne({
    _id: req.params.id,
    recipient: req.user.id
  });

  if (!notification) {
    return next(new ErrorResponse('Notification not found', 404));
  }

  await notification.remove();

  res.status(200).json({
    success: true,
    message: 'Notification deleted successfully'
  });
});

// @desc    Clear all read notifications
// @route   DELETE /api/notifications/clear-read
// @access  Private
exports.clearReadNotifications = asyncHandler(async (req, res, next) => {
  const result = await Notification.deleteMany({
    recipient: req.user.id,
    isRead: true
  });

  res.status(200).json({
    success: true,
    message: 'Read notifications cleared',
    data: { deletedCount: result.deletedCount }
  });
});

// @desc    Create a notification (internal use)
// @route   POST /api/notifications/create
// @access  Private (can be used by other controllers)
exports.createNotification = asyncHandler(async (req, res, next) => {
  const { recipient, sender, type, title, message, data, category, priority, actionUrl, relatedEntity } = req.body;

  // Validate recipient exists
  const recipientUser = await User.findById(recipient);
  if (!recipientUser) {
    return next(new ErrorResponse('Recipient user not found', 404));
  }

  const notification = await Notification.createNotification({
    recipient,
    sender: sender || req.user.id,
    type: type || 'info',
    title,
    message,
    data: data || {},
    category: category || 'general',
    priority: priority || 'medium',
    actionUrl,
    relatedEntity
  });

  // Populate sender information
  await notification.populate('sender', 'firstName lastName avatar');

  res.status(201).json({
    success: true,
    message: 'Notification created successfully',
    data: notification
  });
});

// @desc    Get notifications by category
// @route   GET /api/notifications/category/:category
// @access  Private
exports.getNotificationsByCategory = asyncHandler(async (req, res, next) => {
  const { category } = req.params;
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 20;

  const validCategories = ['request', 'booking', 'match', 'payment', 'system', 'general'];
  if (!validCategories.includes(category)) {
    return next(new ErrorResponse('Invalid category', 400));
  }

  const options = {
    page,
    limit,
    category,
    sortBy: req.query.sortBy || 'createdAt',
    sortOrder: req.query.sortOrder || 'desc'
  };

  const result = await Notification.getNotifications(req.user.id, options);

  res.status(200).json({
    success: true,
    data: result.notifications,
    pagination: {
      currentPage: result.currentPage,
      totalPages: result.totalPages,
      totalItems: result.total,
      itemsPerPage: limit
    }
  });
});

// @desc    Create request status notification (helper function)
// @access  Internal
exports.createRequestStatusNotification = async (recipientId, requestData) => {
  try {
    const { type, status, requestType, requestName, ownerEmail, adminNotes } = requestData;
    
    let title, message, notificationType, priority;

    switch (status) {
      case 'approved':
        title = 'Request Approved!';
        message = `Your ${requestType} request for "${requestName}" has been approved!`;
        notificationType = 'success';
        priority = 'high';
        break;
      case 'rejected':
        title = 'Request Rejected';
        message = `Your ${requestType} request for "${requestName}" was rejected. ${adminNotes ? `Reason: ${adminNotes}` : ''}`;
        notificationType = 'error';
        priority = 'high';
        break;
      case 'pending':
        title = 'Request Submitted';
        message = `Your ${requestType} request for "${requestName}" has been submitted and is pending admin review.`;
        notificationType = 'info';
        priority = 'medium';
        break;
      default:
        title = 'Request Update';
        message = `There has been an update to your ${requestType} request for "${requestName}".`;
        notificationType = 'info';
        priority = 'medium';
    }

    const notification = await Notification.createNotification({
      recipient: recipientId,
      type: notificationType,
      title,
      message,
      category: 'request',
      priority,
      data: requestData,
      relatedEntity: {
        type: 'Request',
        id: requestData.requestId
      }
    });

    return notification;
  } catch (error) {
    console.error('Error creating request status notification:', error);
    throw error;
  }
};

// @desc    Create booking notification (helper function)
// @access  Internal
exports.createBookingNotification = async (recipientId, bookingData) => {
  try {
    const { action, bookingId, turfName, bookingDate, startTime, endTime } = bookingData;
    
    let title, message, notificationType;

    switch (action) {
      case 'created':
        title = 'Booking Confirmed!';
        message = `Your booking for ${turfName} on ${bookingDate} from ${startTime} to ${endTime} has been confirmed.`;
        notificationType = 'success';
        break;
      case 'cancelled':
        title = 'Booking Cancelled';
        message = `Your booking for ${turfName} on ${bookingDate} has been cancelled.`;
        notificationType = 'warning';
        break;
      case 'reminder':
        title = 'Booking Reminder';
        message = `Reminder: You have a booking for ${turfName} today from ${startTime} to ${endTime}.`;
        notificationType = 'info';
        break;
      default:
        title = 'Booking Update';
        message = `There has been an update to your booking for ${turfName}.`;
        notificationType = 'info';
    }

    const notification = await Notification.createNotification({
      recipient: recipientId,
      type: notificationType,
      title,
      message,
      category: 'booking',
      priority: 'medium',
      data: bookingData,
      relatedEntity: {
        type: 'Booking',
        id: bookingId
      }
    });

    return notification;
  } catch (error) {
    console.error('Error creating booking notification:', error);
    throw error;
  }
};