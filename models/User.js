const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');

const userSchema = new mongoose.Schema({
  // Basic Information
  firstName: {
    type: String,
    required: [true, 'First name is required'],
    trim: true,
    maxlength: [15, 'First name cannot exceed 50 characters']
  },
  lastName: {
    type: String,
    required: [true, 'Last name is required'],
    trim: true,
    maxlength: [15, 'Last name cannot exceed 50 characters']
  },
  email: {
    type: String,
    required: [true, 'Email is required'],
    unique: true,
    lowercase: true,
    match: [
      /^\w+([.-]?\w+)*@\w+([.-]?\w+)*(\.\w{2,3})+$/,
      'Please enter a valid email'
    ]
  },
  username: {
    type: String,
    unique: true,
    sparse: true,
    trim: true,
    minlength: [3, 'Username must be at least 3 characters'],
    maxlength: [30, 'Username cannot exceed 30 characters'],
    match: [/^[a-zA-Z0-9_]+$/, 'Username can only contain letters, numbers, and underscores']
  },
  phone: {
    type: String,
    required: [true, 'Phone number is required'],
    match: [/^[0-9+\-\s()]+$/, 'Please enter a valid phone number']
  },
  password: {
    type: String,
    required: [true, 'Password is required'],
    minlength: [8, 'Password must be at least 8 characters'],
    select: false // Don't include password in queries by default
  },
  
  // User Type and Role
  userType: {
    type: String,
    required: [true, 'User type is required'],
    enum: ['player', 'owner', 'admin'],
    default: 'player'
  },
  
  // Authentication
  isEmailVerified: {
    type: Boolean,
    default: false // Will be set to true after OTP verification
  },
  isOtpVerified: {
    type: Boolean,
    default: false
  },
  
  // Admin Approval for Owners
  isApprovedByAdmin: {
    type: Boolean,
    default: function() {
      return this.userType !== 'owner'; // Only owners need admin approval
    }
  },
  adminApprovalStatus: {
    type: String,
    enum: ['pending', 'approved', 'rejected'],
    default: function() {
      return this.userType === 'owner' ? 'pending' : 'approved';
    }
  },
  adminApprovalDate: Date,
  adminApprovalNotes: String,
  
  // 2FA Fields
  twoFactorEnabled: {
    type: Boolean,
    default: false
  },
  twoFactorSecret: {
    type: String
  },
  twoFactorBackupCodes: [{
    type: String
  }],

  // Google OAuth
  googleId: {
    type: String,
    sparse: true
  },
  isGoogleUser: {
    type: Boolean,
    default: false
  },
  
  // Firebase Authentication
  firebaseUid: {
    type: String,
    sparse: true,
    unique: true
  },
  
  // Profile Information
  avatar: {
    type: String,
    default: ''
  },
  dateOfBirth: {
    type: Date
  },
  gender: {
    type: String,
    enum: ['male', 'female', 'other', 'prefer-not-to-say']
  },
  
  // Player Specific Fields
  preferredSports: [{
    type: String,
    enum: ['Football', 'Cricket', 'Basketball', 'Tennis', 'Badminton', 'Volleyball']
  }],
  skillLevel: {
    type: String,
    enum: ['Beginner', 'Intermediate', 'Advanced', 'Professional'],
    required: false
  },
  location: {
    type: String,
    trim: true
  },
  
  // Turf Owner Specific Fields
  businessName: {
    type: String,
    trim: true,
    maxlength: [100, 'Business name cannot exceed 100 characters']
  },
  businessAddress: {
    type: String,
    trim: true
  },
  businessPhone: {
    type: String,
    match: [/^[0-9+\-\s()]+$/, 'Please enter a valid business phone number']
  },
  turfCount: {
    type: String,
    enum: ['1', '2-5', '6-10', '10+'],
    required: function() {
      return this.userType === 'owner';
    }
  },
  turfLocation: {
    type: String,
    trim: true,
    required: function() {
      return this.userType === 'owner';
    }
  },
  sportTypes: [{
    type: String,
    enum: ['Football', 'Cricket', 'Basketball', 'Tennis', 'Badminton', 'Volleyball']
  }],
  // Keep sportType for backward compatibility
  sportType: {
    type: String,
    enum: ['Football', 'Cricket', 'Basketball', 'Tennis', 'Badminton', 'Volleyball'],
    required: function() {
      return this.userType === 'owner' && (!this.sportTypes || this.sportTypes.length === 0);
    }
  },

  // Owner Document URLs (Cloudinary)
  govIdFileUrl: { type: String }, // Government-issued ID proof
  ownershipProofFileUrl: { type: String }, // Turf ownership proof
  businessCertFileUrl: { type: String }, // Business registration certificate (optional)
  gstNumber: { type: String }, // GST number (optional)
  gstFileUrl: { type: String }, // GST document (optional)
  bankDetails: { type: String }, // Bank details/UPI (optional)
  bankProofFileUrl: { type: String }, // Bank proof (optional)
  
  // Account Status
  isActive: {
    type: Boolean,
    default: true
  },
  isBlocked: {
    type: Boolean,
    default: false
  },
  
  // Preferences
  agreeToTerms: {
    type: Boolean,
    required: [true, 'You must agree to terms and conditions']
  },
  agreeToMarketing: {
    type: Boolean,
    default: false
  },
  
  // Timestamps
  lastLogin: {
    type: Date
  },

  // Password Reset Fields
  resetPasswordToken: {
    type: String
  },
  resetPasswordExpire: {
    type: Date
  },
  
  // Refresh Token
  refreshToken: {
    type: String
  },
  refreshTokenExpire: {
    type: Date
  }
}, {
  timestamps: true
});

// Index for better query performance
userSchema.index({ email: 1 });
userSchema.index({ googleId: 1 });
userSchema.index({ userType: 1 });

// Encrypt password before saving
userSchema.pre('save', async function(next) {
  if (!this.isModified('password')) {
    next();
  }
  
  const salt = await bcrypt.genSalt(10);
  this.password = await bcrypt.hash(this.password, salt);
});

// Compare entered password with hashed password
userSchema.methods.matchPassword = async function(enteredPassword) {
  return await bcrypt.compare(enteredPassword, this.password);
};

// Generate JWT token with optional remember me functionality
userSchema.methods.getSignedJwtToken = function(rememberMe = false) {
  // Set expiration based on rememberMe option
  let expiresIn;
  if (rememberMe) {
    expiresIn = process.env.JWT_REMEMBER_EXPIRE || '30d'; // 30 days for remember me
  } else {
    expiresIn = process.env.JWT_EXPIRE || '7d'; // 7 days for normal login
  }

  return jwt.sign(
    {
      id: this._id,
      userType: this.userType,
      email: this.email,
      rememberMe: rememberMe
    },
    process.env.JWT_SECRET || 'your_super_secret_jwt_key_here_make_it_long_and_secure_123456789',
    {
      expiresIn: expiresIn
    }
  );
};

// Generate email verification token
userSchema.methods.getEmailVerificationToken = function() {
  // Generate token
  const verificationToken = crypto.randomBytes(20).toString('hex');
  
  // Hash token and set to emailVerificationToken field
  this.emailVerificationToken = crypto
    .createHash('sha256')
    .update(verificationToken)
    .digest('hex');
  
  // Set expire
  this.emailVerificationExpire = Date.now() + 10 * 60 * 1000; // 10 minutes
  
  return verificationToken;
};



// Generate password reset token
userSchema.methods.getResetPasswordToken = function() {
  // Generate token
  const resetToken = crypto.randomBytes(20).toString('hex');

  // Hash token and set to resetPasswordToken field
  this.resetPasswordToken = crypto
    .createHash('sha256')
    .update(resetToken)
    .digest('hex');

  // Set expire
  this.resetPasswordExpire = Date.now() + 30 * 60 * 1000; // 30 minutes

  return resetToken;
};

// Generate refresh token
userSchema.methods.getRefreshToken = function() {
  // Generate token
  const refreshToken = crypto.randomBytes(40).toString('hex');
  
  // Set refresh token and expiration (30 days)
  this.refreshToken = refreshToken;
  this.refreshTokenExpire = Date.now() + 30 * 24 * 60 * 60 * 1000; // 30 days

  return refreshToken;
};

// Validate refresh token
userSchema.methods.validateRefreshToken = function(token) {
  return this.refreshToken === token && this.refreshTokenExpire > Date.now();
};

// Generate 2FA secret
userSchema.methods.generateTwoFactorSecret = function() {
  const speakeasy = require('speakeasy');
  
  const secret = speakeasy.generateSecret({
    name: `TurfEase (${this.email})`,
    issuer: 'TurfEase'
  });
  
  this.twoFactorSecret = secret.base32;
  return secret;
};

// Verify 2FA token
userSchema.methods.verifyTwoFactorToken = function(token) {
  const speakeasy = require('speakeasy');
  
  return speakeasy.totp.verify({
    secret: this.twoFactorSecret,
    encoding: 'base32',
    token: token,
    window: 2 // Allow for time drift
  });
};

// Generate backup codes
userSchema.methods.generateTwoFactorBackupCodes = function() {
  const crypto = require('crypto');
  
  const codes = [];
  for (let i = 0; i < 10; i++) {
    const code = crypto.randomBytes(4).toString('hex');
    codes.push(code);
  }
  
  this.twoFactorBackupCodes = codes;
  return codes;
};

// Verify backup code
userSchema.methods.verifyTwoFactorBackupCode = function(code) {
  const index = this.twoFactorBackupCodes.indexOf(code);
  if (index !== -1) {
    // Remove the used backup code
    this.twoFactorBackupCodes.splice(index, 1);
    return true;
  }
  return false;
};

module.exports = mongoose.model('User', userSchema);