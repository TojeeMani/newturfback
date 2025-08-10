const mongoose = require('mongoose');
const User = require('../models/User');
require('dotenv').config();

const checkUsers = async () => {
  try {
    // Connect to MongoDB
    const mongoURI = process.env.NODE_ENV === 'production' 
      ? (process.env.MONGODB_URI_PROD || 'mongodb://localhost:27017/turfease')
      : (process.env.MONGODB_URI || 'mongodb://localhost:27017/turfease');
    
    await mongoose.connect(mongoURI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });
    console.log('Connected to MongoDB');

    // Get all users
    const users = await User.find({}).select('firstName lastName email userType isEmailVerified isOtpVerified createdAt');
    
    console.log('📋 Users in database:');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    
    if (users.length === 0) {
      console.log('No users found in database');
    } else {
      users.forEach((user, index) => {
        console.log(`${index + 1}. ${user.firstName} ${user.lastName}`);
        console.log(`   Email: ${user.email}`);
        console.log(`   Type: ${user.userType}`);
        console.log(`   Email Verified: ${user.isEmailVerified}`);
        console.log(`   OTP Verified: ${user.isOtpVerified}`);
        console.log(`   Created: ${user.createdAt}`);
        console.log('   ────────────────────────────────────');
      });
    }
    
    process.exit(0);
  } catch (error) {
    console.error('❌ Error checking users:', error.message);
    process.exit(1);
  }
};

// Run the script
checkUsers();
