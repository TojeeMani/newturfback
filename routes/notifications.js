const express = require('express');
const { protect } = require('../middleware/auth');
const {
  getNotifications,
  getUnreadCount,
  markAsRead,
  markAllAsRead,
  deleteNotification,
  clearReadNotifications,
  createNotification,
  getNotificationsByCategory
} = require('../controllers/notificationController');

const router = express.Router();

// All notification routes require authentication
router.use(protect);

// Main notification routes
router.get('/', getNotifications);
router.get('/unread-count', getUnreadCount);
router.patch('/:id/read', markAsRead);
router.patch('/mark-all-read', markAllAsRead);
router.delete('/:id', deleteNotification);
router.delete('/clear-read', clearReadNotifications);
router.get('/category/:category', getNotificationsByCategory);

// Internal route for creating notifications (can be used by other services)
router.post('/create', createNotification);

module.exports = router;