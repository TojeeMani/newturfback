const express = require('express');
const router = express.Router();
const {
  createMatch,
  getMatches,
  getMatch,
  getMatchByShareCode,
  updateMatchStatus,
  updateMatchScore,
  addLiveUpdate,
  updateMatchStatistics,
  deleteMatch
} = require('../controllers/matchController');
const { protect, authorize } = require('../middleware/auth');

// Public routes
router.get('/', getMatches);
router.get('/share/:shareCode', getMatchByShareCode);
router.get('/:id', getMatch);

// Protected routes
router.post('/', protect, createMatch);
router.put('/:id/status', protect, updateMatchStatus);
router.put('/:id/score', protect, updateMatchScore);
router.post('/:id/live-update', protect, addLiveUpdate);
router.put('/:id/statistics', protect, updateMatchStatistics);
router.delete('/:id', protect, deleteMatch);

module.exports = router;
