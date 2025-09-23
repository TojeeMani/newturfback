const Match = require('../models/Match');
const Turf = require('../models/Turf');
const asyncHandler = require('../middleware/async');

// @desc    Create a new match
// @route   POST /api/matches
// @access  Private (Owner/Admin)
const createMatch = asyncHandler(async (req, res) => {
  const { turfId, matchName, matchType, startTime, endTime, teams } = req.body;

  // Verify turf ownership
  const turf = await Turf.findById(turfId);
  if (!turf) {
    return res.status(404).json({ success: false, message: 'Turf not found' });
  }

  if (turf.ownerId.toString() !== req.user.id && req.user.role !== 'admin') {
    return res.status(403).json({ success: false, message: 'Not authorized to create matches for this turf' });
  }

  const match = await Match.create({
    turfId,
    ownerId: turf.ownerId,
    matchName,
    matchType,
    startTime,
    endTime,
    teams
  });

  res.status(201).json({ success: true, data: match });
});

// @desc    Get all matches
// @route   GET /api/matches
// @access  Public
const getMatches = asyncHandler(async (req, res) => {
  const { status, matchType, turfId, ownerId, customerId, window, limit, isPublic, day, date } = req.query;

  const now = new Date();
  let orConditions = [];
  let query = {};

  if (status) query.status = status;
  if (matchType) query.matchType = matchType;
  if (turfId) query.turfId = turfId;
  if (ownerId) query.ownerId = ownerId;
  if (customerId) query.customerId = customerId;
  if (typeof isPublic !== 'undefined') query.isPublic = isPublic === 'true';

  if (window === 'live') {
    orConditions = [
      { status: 'live' },
      { startTime: { $lte: now }, endTime: { $gte: now } }
    ];
  } else if (window === 'upcoming') {
    // Upcoming: from now onwards
    query.status = query.status || 'scheduled';

    // Optional: constrain to today or a specific date
    if (day === 'today' || date) {
      const target = date ? new Date(date) : new Date();
      const startOfDay = new Date(target);
      startOfDay.setHours(0, 0, 0, 0);
      const endOfDay = new Date(target);
      endOfDay.setHours(23, 59, 59, 999);
      // Start time should be between now and end of the specified day
      const lowerBound = (day === 'today' && !date) ? now : startOfDay;
      query.startTime = { $gte: lowerBound, $lte: endOfDay };
    } else {
      // Default upcoming (no day constraint)
      query.startTime = { $gte: now };
    }
  }

  const baseQuery = orConditions.length > 0 ? { $or: orConditions, ...query } : query;

  let mongoQuery = Match.find(baseQuery)
    .populate('turfId', 'name location')
    .populate('ownerId', 'name')
    .sort({ startTime: 1 });

  if (limit) {
    const parsedLimit = parseInt(limit, 10);
    if (!Number.isNaN(parsedLimit) && parsedLimit > 0) {
      mongoQuery = mongoQuery.limit(parsedLimit);
    }
  }

  const matches = await mongoQuery;
  res.json({ success: true, data: matches });
});

// @desc    Get match by ID
// @route   GET /api/matches/:id
// @access  Public
const getMatch = asyncHandler(async (req, res) => {
  const match = await Match.findById(req.params.id)
    .populate('turfId', 'name location')
    .populate('ownerId', 'name');

  if (!match) {
    return res.status(404).json({ success: false, message: 'Match not found' });
  }

  res.json({ success: true, data: match });
});

// @desc    Get match by share code
// @route   GET /api/matches/share/:shareCode
// @access  Public
const getMatchByShareCode = asyncHandler(async (req, res) => {
  const match = await Match.findOne({ shareCode: req.params.shareCode })
    .populate('turfId', 'name location')
    .populate('ownerId', 'name');

  if (!match) {
    return res.status(404).json({ success: false, message: 'Match not found' });
  }

  res.json({ success: true, data: match });
});

// @desc    Update match status
// @route   PUT /api/matches/:id/status
// @access  Private (Owner/Admin)
const updateMatchStatus = asyncHandler(async (req, res) => {
  const { status } = req.body;
  
  const match = await Match.findById(req.params.id);
  if (!match) {
    return res.status(404).json({ success: false, message: 'Match not found' });
  }

  // Check authorization
  if (match.ownerId.toString() !== req.user.id && req.user.role !== 'admin') {
    return res.status(403).json({ success: false, message: 'Not authorized to update this match' });
  }

  match.status = status;
  await match.save();

  res.json({ success: true, data: match });
});

// @desc    Update match score
// @route   PUT /api/matches/:id/score
// @access  Private (Owner/Admin)
const updateMatchScore = asyncHandler(async (req, res) => {
  const { teamIndex, score } = req.body;
  
  const match = await Match.findById(req.params.id);
  if (!match) {
    return res.status(404).json({ success: false, message: 'Match not found' });
  }

  // Check authorization
  if (match.ownerId.toString() !== req.user.id && req.user.role !== 'admin') {
    return res.status(403).json({ success: false, message: 'Not authorized to update this match' });
  }

  if (teamIndex >= 0 && teamIndex < match.teams.length) {
    match.teams[teamIndex].score = score;
    await match.save();
  }

  res.json({ success: true, data: match });
});

// @desc    Add live update
// @route   POST /api/matches/:id/live-update
// @access  Private (Owner/Admin)
const addLiveUpdate = asyncHandler(async (req, res) => {
  const { type, team, player, description, time } = req.body;
  
  const match = await Match.findById(req.params.id);
  if (!match) {
    return res.status(404).json({ success: false, message: 'Match not found' });
  }

  // Check authorization
  if (match.ownerId.toString() !== req.user.id && req.user.role !== 'admin') {
    return res.status(403).json({ success: false, message: 'Not authorized to update this match' });
  }

  const update = {
    type,
    team,
    player,
    description,
    time,
    timestamp: new Date()
  };

  match.liveUpdates.push(update);
  await match.save();

  res.json({ success: true, data: match });
});

// @desc    Update match statistics
// @route   PUT /api/matches/:id/statistics
// @access  Private (Owner/Admin)
const updateMatchStatistics = asyncHandler(async (req, res) => {
  const { statistics } = req.body;
  
  const match = await Match.findById(req.params.id);
  if (!match) {
    return res.status(404).json({ success: false, message: 'Match not found' });
  }

  // Check authorization
  if (match.ownerId.toString() !== req.user.id && req.user.role !== 'admin') {
    return res.status(403).json({ success: false, message: 'Not authorized to update this match' });
  }

  match.statistics = { ...match.statistics, ...statistics };
  await match.save();

  res.json({ success: true, data: match });
});

// @desc    Delete match
// @route   DELETE /api/matches/:id
// @access  Private (Owner/Admin)
const deleteMatch = asyncHandler(async (req, res) => {
  const match = await Match.findById(req.params.id);
  if (!match) {
    return res.status(404).json({ success: false, message: 'Match not found' });
  }

  // Check authorization
  if (match.ownerId.toString() !== req.user.id && req.user.role !== 'admin') {
    return res.status(403).json({ success: false, message: 'Not authorized to delete this match' });
  }

  await match.deleteOne();

  res.json({ success: true, message: 'Match deleted successfully' });
});

module.exports = {
  createMatch,
  getMatches,
  getMatch,
  getMatchByShareCode,
  updateMatchStatus,
  updateMatchScore,
  addLiveUpdate,
  updateMatchStatistics,
  deleteMatch
};
