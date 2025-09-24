const User = require('../models/User');
const crypto = require('crypto');
const admin = require('../config/firebase');
const redisClient = require('../config/redis');
const { validationResult } = require('express-validator');
const { sendOTPEmail, sendResendOTPEmail, sendEmail } = require('../utils/universalEmailService');

// @desc    Register user (Step 1: Create user and send OTP)
// @route   POST /api/auth/register
// @access  Public
exports.register = async (req, res, next) => {
  try {

    const {
      firstName,
      lastName,
      email,
      phone,
      password,
      userType,
      preferredSports,
      skillLevel,
      location,
      businessName,
      businessAddress,
      businessPhone,
      turfCount,
      turfLocation,
      sportType,
      sportTypes,
      agreeToTerms,
      agreeToMarketing,
      govIdFileUrl,
      ownershipProofFileUrl,
      businessCertFileUrl

    } = req.body;
console.log(req.body)
    // Check if user already exists
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      console.log('❌ Backend: User already exists:', email);
      return res.status(400).json({
        success: false,
        message: 'User already exists with this email'
      });
    }

    // Prepare user data based on user type
    const userData = {
      firstName,
      lastName,
      email,
      phone,
      password,
      userType,
      agreeToTerms,
      agreeToMarketing,
      isEmailVerified: false, // Will be set to true after OTP verification
      isOtpVerified: false
    };

    // Add player-specific fields
    if (userType === 'player') {
      userData.preferredSports = preferredSports || [];
      userData.skillLevel = skillLevel;
      userData.location = location;
    }

    // Add owner-specific fields
    if (userType === 'owner') {
      userData.govIdFileUrl=govIdFileUrl
      userData.ownershipProofFileUrl= ownershipProofFileUrl

      userData.businessCertFileUrl=businessCertFileUrl
      userData.businessName = businessName;
      userData.businessAddress = businessAddress;
      userData.businessPhone = businessPhone;
      userData.turfCount = turfCount;
      userData.turfLocation = turfLocation;
      
      // Handle multiple sport types
      if (sportTypes && sportTypes.length > 0) {
        userData.sportTypes = sportTypes;
        userData.sportType = sportTypes[0]; // Set first sport type for backward compatibility
      } else if (sportType) {
        userData.sportType = sportType;
        userData.sportTypes = [sportType]; // Convert single sport type to array
      }
      
      userData.isApprovedByAdmin = false;
      userData.adminApprovalStatus = 'pending';
    }

    // Create user
    const user = await User.create(userData);

    // Generate OTP (6 digits)
    const otp = Math.floor(100000 + Math.random() * 900000).toString();

    // Store OTP in Redis with expiration (10 minutes)
    const otpData = {
      otp,
      email,
      firstName,
      userType
    };
    
    try {
      await redisClient.setEx(`otp:${user._id.toString()}`, 10 * 60, JSON.stringify(otpData)); // 10 minutes expiration
    } catch (redisError) {
      console.log('Redis not available, storing OTP in memory (development only)');
      // For development, you could store in memory or skip OTP
    }

    // Send OTP email
    const emailResult = await sendOTPEmail(email, otp, firstName);

    if (!emailResult.success) {
      // If email fails, delete the user and return error
      await User.findByIdAndDelete(user._id);
      return res.status(500).json({
        success: false,
        message: 'Failed to send verification email. Please try again.'
      });
    }

    const responseData = {
      success: true,
      message: process.env.NODE_ENV === 'development'
        ? `Registration successful! Development Mode - Your OTP is: ${otp}`
        : 'Registration successful! Please check your email for verification OTP.',
      userType: user.userType,
      userId: user._id,
      email: user.email,
      requiresOtpVerification: true,
      ...(process.env.NODE_ENV === 'development' && emailResult.devMode && {
        devOtp: otp,
        devMessage: 'In development mode - OTP is shown here for testing'
      })
    };

    res.status(201).json(responseData);
  } catch (error) {
    console.log('❌ Backend: Registration error:', error);
    next(error);
  }
};

// @desc    Login user
// @route   POST /api/auth/login
// @access  Public
exports.login = async (req, res, next) => {
  try {
    const { email, username, password } = req.body;

    // Validate input
    if (!email && !username) {
      return res.status(400).json({
        success: false,
        message: 'Please provide email or username',
        type: 'VALIDATION_ERROR'
      });
    }

    if (!password) {
      return res.status(400).json({
        success: false,
        message: 'Please provide password',
        type: 'VALIDATION_ERROR'
      });
    }

    // Find user by email or username
    const query = email
      ? { email: email.toLowerCase() }
      : { username: username.toLowerCase() };

    // Check for user
    const user = await User.findOne(query).select('+password');

    if (!user) {
      return res.status(401).json({
        success: false,
        message: 'Invalid email or password. Please check your credentials and try again.',
        type: 'INVALID_CREDENTIALS'
      });
    }

    // Check if password matches
    const isMatch = await user.matchPassword(password);

    if (!isMatch) {
      return res.status(401).json({
        success: false,
        message: 'Invalid email or password. Please check your credentials and try again.',
        type: 'INVALID_CREDENTIALS'
      });
    }

    // Check if user is active
    if (!user.isActive) {
      return res.status(401).json({
        success: false,
        message: 'Account is deactivated'
      });
    }

    // Check if user is blocked
    if (user.isBlocked) {
      return res.status(401).json({
        success: false,
        message: 'Account is blocked'
      });
    }

    // Check admin approval for owners
    if (user.userType === 'owner') {
      if (user.adminApprovalStatus === 'rejected') {
        return res.status(401).json({
          success: false,
          message: 'Your account has been rejected by the admin. Please contact support for more information.',
          type: 'ACCOUNT_REJECTED'
        });
      }

      if (user.adminApprovalStatus === 'pending' || !user.isApprovedByAdmin) {
        return res.status(401).json({
          success: false,
          message: 'Your account is pending admin approval. You will be notified once approved.',
          type: 'PENDING_APPROVAL'
        });
      }
    }

    // Generate token
    const token = user.getSignedJwtToken();

    // Update last login
    user.lastLogin = new Date();
    await user.save();

    console.log('🔧 Backend login: User data being returned:', {
      id: user._id,
      firstName: user.firstName,
      lastName: user.lastName,
      email: user.email,
      userType: user.userType,
      businessName: user.businessName,
      turfLocation: user.turfLocation,
      sportType: user.sportType,
      sportTypes: user.sportTypes
    });

    res.status(200).json({
      success: true,
      message: 'Login successful',
      token,
      user: {
        id: user._id,
        firstName: user.firstName,
        lastName: user.lastName,
        email: user.email,
        username: user.username,
        userType: user.userType,
        isEmailVerified: user.isEmailVerified,
        isApprovedByAdmin: user.isApprovedByAdmin,
        adminApprovalStatus: user.adminApprovalStatus,
        businessName: user.businessName,
        turfLocation: user.turfLocation,
        sportType: user.sportType,
        sportTypes: user.sportTypes,
        sportTypes: user.sportTypes
      }
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Send OTP for Login
// @route   POST /api/auth/send-login-otp
// @access  Public
exports.sendLoginOTP = async (req, res, next) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({
        success: false,
        message: 'Email is required'
      });
    }

    // Find user by email
    const user = await User.findOne({ email: email.toLowerCase() });

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'No account found with this email address'
      });
    }

    // Check if user is active
    if (!user.isActive) {
      return res.status(401).json({
        success: false,
        message: 'Account is deactivated'
      });
    }

    // Check if user is blocked
    if (user.isBlocked) {
      return res.status(401).json({
        success: false,
        message: 'Account is blocked'
      });
    }

    // Generate 4-digit OTP for login
    const otp = Math.floor(1000 + Math.random() * 9000).toString();

    // Store OTP in Redis with expiration (5 minutes for login OTP)
    const otpData = {
      otp,
      email: user.email,
      userId: user._id.toString(),
      type: 'login',
      firstName: user.firstName,
      timestamp: Date.now()
    };

    try {
      await redisClient.setEx(`login-otp:${user._id.toString()}`, 5 * 60, JSON.stringify(otpData)); // 5 minutes expiration
      console.log('🔧 Backend: Login OTP stored in Redis for user:', user._id);
    } catch (redisError) {
      console.log('Redis not available, storing OTP in memory (development only)');
      // For development, store in memory with a simple in-memory cache
      if (!global.otpCache) {
        global.otpCache = new Map();
      }
      global.otpCache.set(`login-otp:${user._id.toString()}`, {
        data: otpData,
        expiry: Date.now() + (5 * 60 * 1000) // 5 minutes
      });
      console.log('🔧 Backend: Login OTP stored in memory for user:', user._id);
    }

    // Send OTP email
    const emailResult = await sendOTPEmail(user.email, otp, user.firstName);

    if (!emailResult.success) {
      return res.status(500).json({
        success: false,
        message: 'Failed to send OTP. Please try again.'
      });
    }

    console.log('🔧 Backend: Login OTP sent successfully to:', user.email);

    const responseData = {
      success: true,
      message: 'OTP sent to your email successfully.',
      userId: user._id,
      email: user.email
    };

    res.status(200).json(responseData);
  } catch (error) {
    console.error('❌ Backend: Send login OTP error:', error);
    next(error);
  }
};

// @desc    Login with OTP
// @route   POST /api/auth/login-otp
// @access  Public
exports.loginWithOTP = async (req, res, next) => {
  try {
    const { email, otp } = req.body;

    if (!email || !otp) {
      return res.status(400).json({
        success: false,
        message: 'Email and OTP are required'
      });
    }

    // Find user by email
    const user = await User.findOne({ email: email.toLowerCase() });

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'No account found with this email address'
      });
    }

    // Get stored OTP data from Redis or memory cache
    let storedOtpData;
    try {
      const storedOtpDataString = await redisClient.get(`login-otp:${user._id.toString()}`);
      if (!storedOtpDataString) {
        console.log('❌ Backend: Login OTP not found in Redis for user:', user._id);
        return res.status(400).json({
          success: false,
          message: 'OTP not found or expired. Please request a new OTP.'
        });
      }
      storedOtpData = JSON.parse(storedOtpDataString);
    } catch (redisError) {
      console.log('Redis error, checking memory cache for OTP');
      // Check in-memory cache for development
      if (global.otpCache && global.otpCache.has(`login-otp:${user._id.toString()}`)) {
        const cachedOtp = global.otpCache.get(`login-otp:${user._id.toString()}`);

        // Check if OTP has expired
        if (Date.now() > cachedOtp.expiry) {
          global.otpCache.delete(`login-otp:${user._id.toString()}`);
          console.log('❌ Backend: Login OTP expired in memory cache for user:', user._id);
          return res.status(400).json({
            success: false,
            message: 'OTP expired. Please request a new OTP.'
          });
        }

        storedOtpData = cachedOtp.data;
        console.log('🔧 Backend: Login OTP found in memory cache for user:', user._id);
      } else {
        console.log('❌ Backend: Login OTP not found in memory cache for user:', user._id);
        return res.status(400).json({
          success: false,
          message: 'OTP not found or expired. Please request a new OTP.'
        });
      }
    }

    console.log('🔧 Backend: Comparing login OTPs - Stored:', storedOtpData.otp, 'Received:', otp);

    // Verify OTP
    if (storedOtpData.otp !== otp) {
      console.log('❌ Backend: Login OTP mismatch');
      return res.status(400).json({
        success: false,
        message: 'Invalid OTP. Please try again.'
      });
    }

    console.log('✅ Backend: Login OTP verified successfully');

    // Clean up OTP storage from Redis and memory cache
    try {
      await redisClient.del(`login-otp:${user._id.toString()}`);
      console.log('🔧 Backend: Login OTP cleaned up from Redis for user:', user._id);
    } catch (redisError) {
      console.log('Redis cleanup error, cleaning memory cache');
      // Clean up from memory cache
      if (global.otpCache && global.otpCache.has(`login-otp:${user._id.toString()}`)) {
        global.otpCache.delete(`login-otp:${user._id.toString()}`);
        console.log('🔧 Backend: Login OTP cleaned up from memory cache for user:', user._id);
      }
    }

    // Check if user is active
    if (!user.isActive) {
      return res.status(401).json({
        success: false,
        message: 'Account is deactivated'
      });
    }

    // Check if user is blocked
    if (user.isBlocked) {
      return res.status(401).json({
        success: false,
        message: 'Account is blocked'
      });
    }

    // For owners, check admin approval
    if (user.userType === 'owner') {
      if (!user.isApprovedByAdmin) {
        let message = 'Your account is pending admin approval.';
        if (user.adminApprovalStatus === 'rejected') {
          message = 'Your account has been rejected by admin. Please contact support.';
        }
        return res.status(401).json({
          success: false,
          message,
          type: user.adminApprovalStatus === 'rejected' ? 'ACCOUNT_REJECTED' : 'PENDING_APPROVAL'
        });
      }
    }

    // Generate token
    const token = user.getSignedJwtToken();

    // Update last login
    user.lastLogin = new Date();
    await user.save();

    res.status(200).json({
      success: true,
      message: 'Login successful',
      token,
      user: {
        id: user._id,
        firstName: user.firstName,
        lastName: user.lastName,
        email: user.email,
        userType: user.userType,
        isEmailVerified: user.isEmailVerified,
        isApprovedByAdmin: user.isApprovedByAdmin,
        adminApprovalStatus: user.adminApprovalStatus,
        businessName: user.businessName,
        turfLocation: user.turfLocation,
        sportType: user.sportType
      }
    });
  } catch (error) {
    console.error('❌ Backend: Login with OTP error:', error);
    next(error);
  }
};

// @desc    Firebase Authentication (Players Only)
// @route   POST /api/auth/firebase
// @access  Public
exports.firebaseAuth = async (req, res, next) => {
  try {
    const { firebaseToken } = req.body;

    if (!firebaseToken) {
      return res.status(400).json({
        success: false,
        message: 'Firebase token is required'
      });
    }

    console.log('🔧 Backend: Firebase authentication request received');
    console.log('🔧 Backend: Firebase token received:', firebaseToken.substring(0, 50) + '...');

    // Verify Firebase token
    let decodedToken;
    try {
      console.log('🔧 Backend: Starting token verification...');
      decodedToken = await admin.auth().verifyIdToken(firebaseToken);
      console.log('🔧 Backend: Firebase token verified successfully');
      console.log('🔧 Backend: Decoded token data:', {
        uid: decodedToken.uid,
        email: decodedToken.email,
        name: decodedToken.name,
        picture: decodedToken.picture
      });
    } catch (verifyError) {
      console.error('❌ Backend: Firebase token verification failed:', verifyError);
      console.error('❌ Backend: Error details:', verifyError.message);
      return res.status(401).json({
        success: false,
        message: 'Invalid Firebase token: ' + verifyError.message
      });
    }

    const { uid, email, name, picture } = decodedToken;

    // Parse name with better fallbacks
    let firstName = 'User';
    let lastName = '';

    if (name && name.trim()) {
      const nameParts = name.trim().split(' ');
      firstName = nameParts[0] || 'User';
      if (nameParts.length > 1) {
        lastName = nameParts.slice(1).join(' ');
      }
    } else if (email) {
      // Use email prefix as fallback for firstName
      const emailPrefix = email.split('@')[0];
      firstName = emailPrefix.charAt(0).toUpperCase() + emailPrefix.slice(1);
    }

    console.log('🔧 Backend: Parsed name - firstName:', firstName, 'lastName:', lastName);

    // Check if user already exists in database
    let user = await User.findOne({
      $or: [
        { email: email },
        { firebaseUid: uid }
      ]
    });

    // If user exists with email but no firebaseUid, link the accounts
    if (user && !user.firebaseUid && user.email === email) {
      console.log('🔧 Backend: Linking existing email account with Firebase');
      user.firebaseUid = uid;
      if (picture && !user.avatar) {
        user.avatar = picture;
      }
      await user.save();
    }

    if (user) {
      console.log('🔧 Backend: Existing user found:', user.email);

      // Update Firebase UID if not set
      if (!user.firebaseUid) {
        user.firebaseUid = uid;
        await user.save();
      }

      // Update profile picture if available and not set
      if (picture && !user.avatar) {
        user.avatar = picture;
        await user.save();
      }

      // Check if user is active
      if (!user.isActive) {
        return res.status(401).json({
          success: false,
          message: 'Account is deactivated'
        });
      }

      // Check if user is blocked
      if (user.isBlocked) {
        return res.status(401).json({
          success: false,
          message: 'Account is blocked'
        });
      }

      // Check admin approval for owners
      if (user.userType === 'owner') {
        if (user.adminApprovalStatus === 'rejected') {
          return res.status(401).json({
            success: false,
            message: 'Your account has been rejected by the admin. Please contact support for more information.',
            type: 'ACCOUNT_REJECTED'
          });
        }

        if (user.adminApprovalStatus === 'pending' || !user.isApprovedByAdmin) {
          return res.status(401).json({
            success: false,
            message: 'Your account is pending admin approval. You will be notified once approved.',
            type: 'PENDING_APPROVAL'
          });
        }
      }

      // Update last login with retry logic for version conflicts
      try {
        user.lastLogin = new Date();
        await user.save();
      } catch (saveError) {
        if (saveError.name === 'VersionError') {
          // Handle version conflict - reload user and try again
          console.log('🔧 Backend: Version conflict detected, reloading user...');
          const freshUser = await User.findById(user._id);
          if (freshUser) {
            freshUser.lastLogin = new Date();
            await freshUser.save();
          }
        } else {
          throw saveError;
        }
      }

      // Generate JWT token
      const token = user.getSignedJwtToken();

      res.status(200).json({
        success: true,
        message: 'Firebase authentication successful',
        token,
        user: {
          id: user._id,
          firstName: user.firstName,
          lastName: user.lastName,
          email: user.email,
          userType: user.userType,
          isEmailVerified: user.isEmailVerified,
          isApprovedByAdmin: user.isApprovedByAdmin,
          adminApprovalStatus: user.adminApprovalStatus,
          avatar: user.avatar,
          phone: user.phone,
          preferredSports: user.preferredSports,
          skillLevel: user.skillLevel,
          location: user.location,
          businessName: user.businessName,
          turfLocation: user.turfLocation,
          sportType: user.sportType,
          needsProfileCompletion: !user.phone || user.phone === '0000000000' || !user.preferredSports || user.preferredSports.length === 0
        }
      });
    } else {
      console.log('🔧 Backend: Creating new user from Firebase');

      // Create new user (always as player for Firebase users)
      const userData = {
        firstName: firstName || 'User',
        lastName: lastName || '',
        email: email,
        phone: '0000000000', // Default phone for Firebase users - they'll need to update this
        firebaseUid: uid,
        password: crypto.randomBytes(32).toString('hex'), // Random password for Firebase users
        userType: 'player', // Always create as player
        isEmailVerified: true, // Firebase emails are verified
        agreeToTerms: true,
        isActive: true,
        avatar: picture || '',
        preferredSports: [], // Empty array - user needs to fill this
        location: '', // User needs to fill this
        isApprovedByAdmin: true, // Auto-approve Firebase users (players)
        adminApprovalStatus: 'approved' // Set approval status
      };

      console.log('🔧 Backend: Creating user with data:', {
        firstName: userData.firstName,
        lastName: userData.lastName,
        email: userData.email,
        phone: userData.phone,
        userType: userData.userType,
        firebaseUid: userData.firebaseUid
      });

      try {
        user = await User.create(userData);
        console.log('🔧 Backend: New user created successfully:', {
          id: user._id,
          email: user.email,
          firstName: user.firstName,
          lastName: user.lastName,
          userType: user.userType,
          firebaseUid: user.firebaseUid
        });
      } catch (createError) {
        console.error('❌ Backend: User creation failed:', createError);

        // Handle duplicate email error
        if (createError.code === 11000) {
          return res.status(409).json({
            success: false,
            message: 'An account with this email already exists. Please try logging in instead.',
            type: 'DUPLICATE_EMAIL'
          });
        }

        // Handle validation errors
        if (createError.name === 'ValidationError') {
          const validationErrors = Object.values(createError.errors).map(err => err.message);
          return res.status(400).json({
            success: false,
            message: 'User data validation failed',
            errors: validationErrors,
            type: 'VALIDATION_ERROR'
          });
        }

        throw createError; // Re-throw other errors
      }

      // Generate JWT token
      const token = user.getSignedJwtToken();

      res.status(201).json({
        success: true,
        message: 'Firebase authentication successful - new user created. Please complete your profile.',
        token,
        user: {
          id: user._id,
          firstName: user.firstName,
          lastName: user.lastName,
          email: user.email,
          userType: user.userType,
          isEmailVerified: user.isEmailVerified,
          isApprovedByAdmin: user.isApprovedByAdmin,
          adminApprovalStatus: user.adminApprovalStatus,
          avatar: user.avatar,
          phone: user.phone,
          preferredSports: user.preferredSports,
          skillLevel: user.skillLevel,
          location: user.location,
          businessName: user.businessName,
          turfLocation: user.turfLocation,
          sportType: user.sportType,
          needsProfileCompletion: true
        }
      });
    }
  } catch (error) {
    console.error('❌ Backend: Firebase auth error:', error);

    // Handle specific error types
    if (error.name === 'VersionError') {
      return res.status(409).json({
        success: false,
        message: 'Concurrent modification detected. Please try again.'
      });
    }

    if (error.name === 'ValidationError') {
      return res.status(400).json({
        success: false,
        message: 'User data validation failed',
        errors: Object.values(error.errors).map(err => err.message)
      });
    }

    res.status(500).json({
      success: false,
      message: 'Firebase authentication failed'
    });
  }
};

// @desc    Update user profile
// @route   PUT /api/auth/profile
// @access  Private
exports.updateProfile = async (req, res, next) => {
  try {
    const {
      firstName,
      lastName,
      phone,
      preferredSports,
      skillLevel,
      location,
      avatar,
      // Owner-specific fields
      businessName,
      businessAddress,
      businessPhone,
      turfCount,
      turfLocation
    } = req.body;

    console.log('🔧 Backend updateProfile - Request body:', req.body);
    console.log('🔧 Backend updateProfile - Avatar field:', avatar);

    const user = await User.findById(req.user.id);

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    console.log('🔧 Backend updateProfile - Current user avatar:', user.avatar);

    // Update common fields
    if (firstName) user.firstName = firstName;
    if (lastName) user.lastName = lastName;
    if (phone) user.phone = phone;
    if (location) user.location = location;
    if (avatar !== undefined) {
      user.avatar = avatar;
      console.log('🔧 Backend updateProfile - Updated avatar to:', user.avatar);
    }

    // Update player-specific fields
    if (user.userType === 'player') {
      if (preferredSports) user.preferredSports = preferredSports;
      if (skillLevel) user.skillLevel = skillLevel;
    }

    // Update owner-specific fields
    if (user.userType === 'owner') {
      if (businessName) user.businessName = businessName;
      if (businessAddress) user.businessAddress = businessAddress;
      if (businessPhone) user.businessPhone = businessPhone;
      if (turfCount) user.turfCount = turfCount;
      if (turfLocation) user.turfLocation = turfLocation;
    }

    await user.save();

    console.log('🔧 Backend updateProfile - User saved, avatar is now:', user.avatar);

    // Determine if profile completion is needed based on user type
    // For personal profile updates, we only check basic personal information
    let needsProfileCompletion = false;
    if (user.userType === 'player') {
      needsProfileCompletion = !user.phone || user.phone === '0000000000' ||
                              !user.preferredSports || user.preferredSports.length === 0 ||
                              !user.skillLevel || !user.location;
    } else if (user.userType === 'owner') {
      // For owners, only check basic personal info for profile completion
      // Business info is handled separately in the owner dashboard
      needsProfileCompletion = !user.phone || user.phone === '0000000000' ||
                              !user.location;
    }

    // Build response object with common fields
    const responseUser = {
      id: user._id,
      firstName: user.firstName,
      lastName: user.lastName,
      email: user.email,
      userType: user.userType,
      isEmailVerified: user.isEmailVerified,
      isApprovedByAdmin: user.isApprovedByAdmin,
      adminApprovalStatus: user.adminApprovalStatus,
      avatar: user.avatar,
      phone: user.phone,
      location: user.location,
      needsProfileCompletion
    };

    // Add user-type specific fields
    if (user.userType === 'player') {
      responseUser.preferredSports = user.preferredSports || [];
      responseUser.skillLevel = user.skillLevel || '';
    } else if (user.userType === 'owner') {
      // Only include business fields if they exist
      if (user.businessName) responseUser.businessName = user.businessName;
      if (user.businessAddress) responseUser.businessAddress = user.businessAddress;
      if (user.businessPhone) responseUser.businessPhone = user.businessPhone;
      if (user.turfCount) responseUser.turfCount = user.turfCount;
      if (user.turfLocation) responseUser.turfLocation = user.turfLocation;
      if (user.sportType) responseUser.sportType = user.sportType;
      if (user.sportTypes) responseUser.sportTypes = user.sportTypes;
    }

    res.status(200).json({
      success: true,
      message: 'Profile updated successfully',
      user: responseUser
    });

    console.log('🔧 Backend updateProfile - Response sent with avatar:', responseUser.avatar);
  } catch (error) {
    next(error);
  }
};

// @desc    Get current logged in user
// @route   GET /api/auth/me
// @access  Private
exports.getMe = async (req, res, next) => {
  try {
    const user = await User.findById(req.user.id);
    
    console.log('🔧 Backend getMe: User found:', {
      id: user._id,
      firstName: user.firstName,
      lastName: user.lastName,
      email: user.email,
      userType: user.userType,
      businessName: user.businessName,
      turfLocation: user.turfLocation,
      sportType: user.sportType
    });

    res.status(200).json({
      success: true,
      data: user
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Logout user / clear cookie
// @route   POST /api/auth/logout
// @access  Private
exports.logout = async (req, res, next) => {
  try {
    res.status(200).json({
      success: true,
      message: 'Logged out successfully'
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Forgot password
// @route   POST /api/auth/forgotpassword
// @access  Public
exports.forgotPassword = async (req, res, next) => {
  try {
    // Check for validation errors
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: errors.array()
      });
    }

    const user = await User.findOne({ email: req.body.email });

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'There is no user with that email'
      });
    }

    // Get reset token
    const resetToken = user.getResetPasswordToken();

    try {
      await user.save({ validateBeforeSave: false });
    } catch (saveError) {
      console.error('Failed to save user with reset token:', saveError);
      return res.status(500).json({
        success: false,
        message: 'Failed to generate reset token. Please try again.'
      });
    }

    // Create reset url
    const resetUrl = `${process.env.FRONTEND_URL}/reset-password/${resetToken}`;

    // Send email with reset link
    try {
      await sendEmail({
        email: user.email,
        subject: 'TurfEase - Password Reset Request',
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <div style="background: linear-gradient(135deg, #22c55e 0%, #16a34a 100%); padding: 30px; text-align: center;">
              <h1 style="color: white; margin: 0; font-size: 28px;">TurfEase</h1>
              <p style="color: white; margin: 10px 0 0 0; opacity: 0.9;">Sports Turf Booking Platform</p>
            </div>

            <div style="padding: 40px 30px; background: #ffffff;">
              <h2 style="color: #1f2937; margin: 0 0 20px 0;">Password Reset Request</h2>

              <p style="color: #4b5563; line-height: 1.6; margin: 0 0 20px 0;">
                Hello ${user.firstName},
              </p>

              <p style="color: #4b5563; line-height: 1.6; margin: 0 0 20px 0;">
                We received a request to reset your password for your TurfEase account. If you didn't make this request, you can safely ignore this email.
              </p>

              <div style="text-align: center; margin: 30px 0;">
                <a href="${resetUrl}"
                   style="background: #22c55e; color: white; padding: 15px 30px; text-decoration: none; border-radius: 8px; font-weight: bold; display: inline-block;">
                  Reset Your Password
                </a>
              </div>

              <p style="color: #6b7280; font-size: 14px; line-height: 1.6; margin: 20px 0 0 0;">
                This link will expire in 10 minutes for security reasons. If you need to reset your password after this time, please request a new reset link.
              </p>

              <p style="color: #6b7280; font-size: 14px; line-height: 1.6; margin: 10px 0 0 0;">
                If the button doesn't work, copy and paste this link into your browser:<br>
                <span style="word-break: break-all;">${resetUrl}</span>
              </p>
            </div>

            <div style="background: #f9fafb; padding: 20px 30px; text-align: center; border-top: 1px solid #e5e7eb;">
              <p style="color: #6b7280; font-size: 12px; margin: 0;">
                © 2024 TurfEase. All rights reserved.
              </p>
            </div>
          </div>
        `
      });

      res.status(200).json({
        success: true,
        message: 'Password reset email sent successfully'
      });
    } catch (emailError) {
      console.error('Failed to send password reset email:', emailError);

      // Clear the reset token if email fails
      user.resetPasswordToken = undefined;
      user.resetPasswordExpire = undefined;
      await user.save({ validateBeforeSave: false });

      return res.status(500).json({
        success: false,
        message: 'Email could not be sent. Please try again later.'
      });
    }
  } catch (error) {
    next(error);
  }
};

// @desc    Resend verification email
// @route   POST /api/auth/resend-verification
// @access  Public
exports.resendVerification = async (req, res, next) => {
  try {
    res.status(200).json({
      success: true,
      message: 'Email verification is not required in this version'
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Reset password
// @route   PUT /api/auth/resetpassword/:resettoken
// @access  Public
exports.resetPassword = async (req, res, next) => {
  try {
    // Check for validation errors
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: errors.array()
      });
    }

    // Get hashed token
    const resetPasswordToken = crypto
      .createHash('sha256')
      .update(req.params.resettoken)
      .digest('hex');

    const user = await User.findOne({
      resetPasswordToken,
      resetPasswordExpire: { $gt: Date.now() }
    });

    if (!user) {
      // Check if token exists but expired
      const expiredUser = await User.findOne({ resetPasswordToken });
      if (expiredUser) {
        return res.status(400).json({
          success: false,
          message: 'Reset token has expired. Please request a new password reset.'
        });
      }

      return res.status(400).json({
        success: false,
        message: 'Invalid or expired reset token'
      });
    }

    // Set new password
    user.password = req.body.password;
    user.resetPasswordToken = undefined;
    user.resetPasswordExpire = undefined;
    await user.save();

    // Generate token
    const token = user.getSignedJwtToken();

    res.status(200).json({
      success: true,
      message: 'Password reset successful',
      token
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Verify OTP (Step 2: Verify OTP and complete registration)
// @route   POST /api/auth/verify-otp
// @access  Public
exports.verifyOTP = async (req, res, next) => {
  try {
    console.log('🔧 Backend: OTP verification request received:', req.body);

    const { userId, otp } = req.body;

    if (!userId || !otp) {
      return res.status(400).json({
        success: false,
        message: 'User ID and OTP are required'
      });
    }

    // Find user
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    // Check if OTP is already verified
    if (user.isOtpVerified) {
      return res.status(400).json({
        success: false,
        message: 'Email is already verified'
      });
    }

    // Get stored OTP data from Redis
    let storedOtpData;
    try {
      const storedOtpDataString = await redisClient.get(`otp:${userId}`);
      if (!storedOtpDataString) {
        console.log('❌ Backend: OTP not found for userId:', userId);
        return res.status(400).json({
          success: false,
          message: 'OTP not found or expired. Please request a new OTP.'
        });
      }
      storedOtpData = JSON.parse(storedOtpDataString);
    } catch (redisError) {
      console.log('Redis error, skipping OTP verification for development');
      // For development, you might want to skip OTP verification
      storedOtpData = { otp: otp }; // Accept any OTP in development
    }

    console.log('🔧 Backend: Found OTP data:', storedOtpData);

    // Verify OTP
    console.log('🔧 Backend: Comparing OTPs - Stored:', storedOtpData.otp, 'Received:', otp);

    if (storedOtpData.otp !== otp) {
      console.log('❌ Backend: OTP mismatch');
      return res.status(400).json({
        success: false,
        message: 'Invalid OTP. Please try again.'
      });
    }

    console.log('✅ Backend: OTP match successful');

    // Mark user as verified
    user.isOtpVerified = true;
    user.isEmailVerified = true;
    await user.save();

    // Clean up OTP storage from Redis
    try {
      await redisClient.del(`otp:${userId}`);
    } catch (redisError) {
      console.log('Redis cleanup error (non-critical)');
    }

    console.log('🔧 Backend: OTP verified successfully');

    const responseData = {
      success: true,
      message: user.userType === 'owner'
        ? 'Email verified successfully! Your account is pending admin approval. You will be notified once approved.'
        : 'Email verified successfully! You can now login to your account.',
      userType: user.userType,
      user: {
        id: user._id,
        firstName: user.firstName,
        lastName: user.lastName,
        email: user.email,
        userType: user.userType,
        isEmailVerified: user.isEmailVerified,
        isApprovedByAdmin: user.isApprovedByAdmin,
        adminApprovalStatus: user.adminApprovalStatus
      }
    };

    console.log('🔧 Backend: Sending OTP verification response:', responseData);
    res.status(200).json(responseData);
  } catch (error) {
    console.log('❌ Backend: OTP verification error:', error);
    next(error);
  }
};

// @desc    Resend OTP
// @route   POST /api/auth/resend-otp
// @access  Public
exports.resendOTP = async (req, res, next) => {
  try {
    console.log('🔧 Backend: Resend OTP request received:', req.body);

    const { userId } = req.body;

    if (!userId) {
      return res.status(400).json({
        success: false,
        message: 'User ID is required'
      });
    }

    // Find user
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    // Check if OTP is already verified
    if (user.isOtpVerified) {
      return res.status(400).json({
        success: false,
        message: 'Email is already verified'
      });
    }

    // Generate new OTP (6 digits)
    const otp = Math.floor(100000 + Math.random() * 900000).toString();

    // Store new OTP in Redis with expiration (10 minutes)
    const otpData = {
      otp,
      email: user.email,
      firstName: user.firstName,
      userType: user.userType
    };
    
    try {
      await redisClient.setEx(`otp:${userId}`, 10 * 60, JSON.stringify(otpData)); // 10 minutes expiration
    } catch (redisError) {
      console.log('Redis not available for OTP storage');
    }

    console.log('🔧 Backend: New OTP generated');

    // Send new OTP email
    const emailResult = await sendResendOTPEmail(user.email, otp, user.firstName);

    if (!emailResult.success) {
      return res.status(500).json({
        success: false,
        message: 'Failed to send new OTP. Please try again.'
      });
    }

    const responseData = {
      success: true,
      message: process.env.NODE_ENV === 'development'
        ? `New OTP generated! Development Mode - Your new OTP is: ${otp}`
        : 'New OTP sent to your email successfully.',
      userId: user._id,
      email: user.email,
      ...(process.env.NODE_ENV === 'development' && emailResult.devMode && {
        devOtp: otp,
        devMessage: 'In development mode - OTP is shown here for testing'
      })
    };

    console.log('🔧 Backend: Sending resend OTP response:', responseData);
    res.status(200).json(responseData);
  } catch (error) {
    console.log('❌ Backend: Resend OTP error:', error);
    next(error);
  }
};

// @desc    Check if email exists
// @route   POST /api/auth/check-email
// @access  Public
exports.checkEmailExists = async (req, res, next) => {
  try {
    const { email } = req.body;

    // Check if user exists with this email
    const existingUser = await User.findOne({ email: email.toLowerCase() });

    res.status(200).json({
      success: true,
      exists: !!existingUser,
      message: existingUser ? 'Email is already registered' : 'Email is available'
    });
  } catch (error) {
    console.log('❌ Backend: Check email error:', error);
    next(error);
  }
};