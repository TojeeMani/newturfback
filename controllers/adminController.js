const User = require('../models/User');
const Turf = require('../models/Turf');
const { sendOwnerApprovalEmail, sendOwnerRejectionEmail } = require('../utils/emailService');

// @desc    Get all registered users
// @route   GET /api/admin/users
// @access  Private (Admin only)
exports.getAllUsers = async (req, res, next) => {
  try {
    const { userType, status, search, page = 1, limit = 10 } = req.query;

    // Build filter object
    const filter = {};

    if (userType && userType !== 'all') {
      filter.userType = userType;
    }

    if (status && status !== 'all') {
      if (status === 'verified') {
        filter.isEmailVerified = true;
        filter.isOtpVerified = true;
      } else if (status === 'unverified') {
        filter.$or = [
          { isEmailVerified: false },
          { isOtpVerified: false }
        ];
      } else if (status === 'pending') {
        filter.adminApprovalStatus = 'pending';
      } else if (status === 'approved') {
        filter.adminApprovalStatus = 'approved';
      } else if (status === 'rejected') {
        filter.adminApprovalStatus = 'rejected';
      }
    }

    if (search) {
      filter.$or = [
        { firstName: { $regex: search, $options: 'i' } },
        { lastName: { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } },
        { businessName: { $regex: search, $options: 'i' } }
      ];
    }

    // Calculate pagination
    const skip = (page - 1) * limit;

    // Get users with pagination
    const users = await User.find(filter)
      .select('-password -otp -emailVerificationToken -resetPasswordToken')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit));

    // Get total count for pagination
    const totalUsers = await User.countDocuments(filter);

    // Get summary statistics
    const stats = {
      total: await User.countDocuments(),
      players: await User.countDocuments({ userType: 'player' }),
      owners: await User.countDocuments({ userType: 'owner' }),
      admins: await User.countDocuments({ userType: 'admin' }),
      verified: await User.countDocuments({ isEmailVerified: true, isOtpVerified: true }),
      pending: await User.countDocuments({ adminApprovalStatus: 'pending' })
    };

    res.status(200).json({
      success: true,
      count: users.length,
      total: totalUsers,
      page: parseInt(page),
      pages: Math.ceil(totalUsers / limit),
      stats,
      data: users
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Get all owners with approval status
// @route   GET /api/admin/all-owners
// @access  Private (Admin only)
exports.getAllOwnersWithStatus = async (req, res, next) => {
  try {
    const { status, page = 1, limit = 10 } = req.query;

    // Build filter for owners
    const filter = { userType: 'owner' };

    // Add status filter if specified
    if (status && status !== 'all') {
      filter.adminApprovalStatus = status;
    }

    // Calculate pagination
    const skip = (page - 1) * limit;

    // Get owners with pagination
    const owners = await User.find(filter)
      .select('-password -otp -emailVerificationToken -resetPasswordToken')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit));

    // Get counts for each status
    const statusCounts = {
      total: await User.countDocuments({ userType: 'owner' }),
      pending: await User.countDocuments({ userType: 'owner', adminApprovalStatus: 'pending' }),
      approved: await User.countDocuments({ userType: 'owner', adminApprovalStatus: 'approved' }),
      rejected: await User.countDocuments({ userType: 'owner', adminApprovalStatus: 'rejected' })
    };

    // Get total count for pagination
    const totalOwners = await User.countDocuments(filter);

    res.status(200).json({
      success: true,
      count: owners.length,
      total: totalOwners,
      page: parseInt(page),
      pages: Math.ceil(totalOwners / limit),
      statusCounts,
      data: owners
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Get all pending owner approvals
// @route   GET /api/admin/pending-owners
// @access  Private (Admin only)
exports.getPendingOwners = async (req, res, next) => {
  try {
    const pendingOwners = await User.find({
      userType: 'owner',
      adminApprovalStatus: 'pending'
    }).select('-password -otp -emailVerificationToken -resetPasswordToken');

    res.status(200).json({
      success: true,
      count: pendingOwners.length,
      data: pendingOwners
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Approve or reject owner
// @route   PUT /api/admin/owners/:id/approval
// @access  Private (Admin only)
exports.updateOwnerApproval = async (req, res, next) => {
  try {
    const { status, notes } = req.body;
    const { id } = req.params;

    if (!['approved', 'rejected'].includes(status)) {
      return res.status(400).json({
        success: false,
        message: 'Status must be either "approved" or "rejected"'
      });
    }

    const owner = await User.findById(id);

    if (!owner) {
      return res.status(404).json({
        success: false,
        message: 'Owner not found'
      });
    }

    if (owner.userType !== 'owner') {
      return res.status(400).json({
        success: false,
        message: 'User is not an owner'
      });
    }

    // Update approval status
    owner.adminApprovalStatus = status;
    owner.isApprovedByAdmin = status === 'approved';
    owner.adminApprovalDate = new Date();
    owner.adminApprovalNotes = notes || '';

    await owner.save();

    // Update all turfs belonging to this owner
    try {
      if (status === 'rejected') {
        // Hide all turfs from rejected owners
        await Turf.updateMany(
          { ownerId: owner._id },
          { isApproved: false }
        );
        console.log(`🏟️ Hidden all turfs for rejected owner: ${owner.email}`);
      } else if (status === 'approved') {
        // Show all turfs from approved owners (they can choose to approve individually later)
        await Turf.updateMany(
          { ownerId: owner._id },
          { isApproved: true }
        );
        console.log(`🏟️ Made all turfs visible for approved owner: ${owner.email}`);
      }
    } catch (turfUpdateError) {
      console.error('❌ Error updating turfs visibility:', turfUpdateError);
      // Don't fail the approval/rejection if turf update fails
    }

    // Send email notification
    try {
      if (status === 'approved') {
        console.log('📧 Sending approval email to:', owner.email);
        const emailResult = await sendOwnerApprovalEmail(
          owner.email,
          owner.firstName,
          owner.businessName || 'Your Business'
        );

        if (emailResult.success) {
          console.log('✅ Approval email sent successfully');
        } else {
          console.error('❌ Failed to send approval email:', emailResult.error);
        }
      } else if (status === 'rejected') {
        console.log('📧 Sending rejection email to:', owner.email);
        const emailResult = await sendOwnerRejectionEmail(
          owner.email,
          owner.firstName,
          owner.businessName || 'Your Business',
          notes
        );

        if (emailResult.success) {
          console.log('✅ Rejection email sent successfully');
        } else {
          console.error('❌ Failed to send rejection email:', emailResult.error);
        }
      }
    } catch (emailError) {
      console.error('❌ Error sending notification email:', emailError);
      // Don't fail the approval/rejection if email fails
    }

    res.status(200).json({
      success: true,
      message: `Owner ${status} successfully`,
      data: {
        id: owner._id,
        firstName: owner.firstName,
        lastName: owner.lastName,
        email: owner.email,
        businessName: owner.businessName,
        adminApprovalStatus: owner.adminApprovalStatus,
        isApprovedByAdmin: owner.isApprovedByAdmin,
        adminApprovalDate: owner.adminApprovalDate,
        adminApprovalNotes: owner.adminApprovalNotes
      }
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Get all owners with approval status
// @route   GET /api/admin/owners
// @access  Private (Admin only)
exports.getAllOwners = async (req, res, next) => {
  try {
    const { status, page = 1, limit = 10 } = req.query;

    const query = { userType: 'owner' };
    if (status) {
      query.adminApprovalStatus = status;
    }

    const owners = await User.find(query)
      .select('-password -otp -emailVerificationToken -resetPasswordToken')
      .sort({ createdAt: -1 })
      .limit(limit * 1)
      .skip((page - 1) * limit);

    const total = await User.countDocuments(query);

    res.status(200).json({
      success: true,
      count: owners.length,
      total,
      totalPages: Math.ceil(total / limit),
      currentPage: page,
      data: owners
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Get owner details
// @route   GET /api/admin/owners/:id
// @access  Private (Admin only)
exports.getOwnerDetails = async (req, res, next) => {
  try {
    const { id } = req.params;

    const owner = await User.findById(id).select('-password -otp -emailVerificationToken -resetPasswordToken');

    if (!owner) {
      return res.status(404).json({
        success: false,
        message: 'Owner not found'
      });
    }

    if (owner.userType !== 'owner') {
      return res.status(400).json({
        success: false,
        message: 'User is not an owner'
      });
    }

    res.status(200).json({
      success: true,
      data: owner
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Get turfs with pending changes
// @route   GET /api/admin/turfs/pending-changes
// @access  Private/Admin
exports.getTurfsWithPendingChanges = async (req, res, next) => {
  try {
    const turfs = await Turf.find({
      changesApprovalStatus: 'pending'
    }).populate('ownerId', 'firstName lastName email businessName');

    res.status(200).json({
      success: true,
      count: turfs.length,
      data: turfs
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Approve/Reject turf changes
// @route   PUT /api/admin/turfs/:id/approve-changes
// @access  Private/Admin
exports.approveTurfChanges = async (req, res, next) => {
  try {
    const { status, notes } = req.body; // status: 'approved' or 'rejected'

    if (!['approved', 'rejected'].includes(status)) {
      return res.status(400).json({
        success: false,
        message: 'Status must be either approved or rejected'
      });
    }

    const turf = await Turf.findById(req.params.id);

    if (!turf) {
      return res.status(404).json({
        success: false,
        message: `Turf not found with id of ${req.params.id}`
      });
    }

    if (turf.changesApprovalStatus !== 'pending') {
      return res.status(400).json({
        success: false,
        message: 'No pending changes to approve/reject'
      });
    }

    if (status === 'approved') {
      // Apply pending changes to the turf
      for (const [key, value] of turf.pendingChanges.entries()) {
        turf[key] = value;
      }
      turf.pendingChanges.clear();
      turf.changesApprovalStatus = 'approved';
      turf.changeApprovalNotes = notes || 'Changes approved by admin';

      console.log(`✅ Admin approved turf changes for: ${turf.name}`);
    } else {
      // Reject changes
      turf.pendingChanges.clear();
      turf.changesApprovalStatus = 'rejected';
      turf.changeApprovalNotes = notes || 'Changes rejected by admin';

      console.log(`❌ Admin rejected turf changes for: ${turf.name}`);
    }

    await turf.save();

    res.status(200).json({
      success: true,
      data: turf,
      message: `Turf changes ${status} successfully`
    });
  } catch (error) {
    next(error);
  }
};