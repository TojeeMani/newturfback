const mongoose = require('mongoose');
const User = require('../models/User');
require('dotenv').config();

const createAdminUser = async () => {
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

    // Check if admin user already exists
    const existingAdmin = await User.findOne({ userType: 'admin' });
    
    if (existingAdmin) {
      console.log('Admin user already exists:');
      console.log(`Email: ${existingAdmin.email}`);
      console.log(`Username: ${existingAdmin.username || 'Not set'}`);
      console.log('User ID:', existingAdmin._id);
      process.exit(0);
    }

    // Create default admin user
    const adminData = {
      firstName: 'Admin',
      lastName: 'User',
      username: 'admin',
      email: 'admin@turfease.com',
      phone: '+1234567890',
      password: 'Admin@123',
      userType: 'admin',
      isEmailVerified: true,
      isApprovedByAdmin: true,
      adminApprovalStatus: 'approved',
      isActive: true,
      agreeToTerms: true,
      agreeToMarketing: false
    };

    const adminUser = await User.create(adminData);
    
    console.log('✅ Default admin user created successfully!');
    console.log('📋 Admin Credentials:');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log(`👤 Username: ${adminData.username}`);
    console.log(`📧 Email: ${adminData.email}`);
    console.log(`🔑 Password: ${adminData.password}`);
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('⚠️  IMPORTANT: Change these credentials after first login!');
    console.log('🔗 Admin Dashboard: http://localhost:3000/admin-dashboard');
    
    process.exit(0);
  } catch (error) {
    console.error('❌ Error creating admin user:', error.message);
    process.exit(1);
  }
};

// Run the script
createAdminUser(); 