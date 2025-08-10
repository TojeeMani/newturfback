const mongoose = require('mongoose');
const User = require('../models/User');
require('dotenv').config();

const createAdmin = async () => {
  try {
    // Connect to MongoDB
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected to MongoDB');

    // Admin user details
    const adminEmail = 'tojeemani8@gmail.com'; // Your email
    const adminData = {
      firstName: 'Admin',
      lastName: 'User',
      email: adminEmail,
      password: 'admin123', // Change this to a secure password
      userType: 'admin',
      isEmailVerified: true,
      isApprovedByAdmin: true,
      adminApprovalStatus: 'approved'
    };

    // Check if admin already exists
    let admin = await User.findOne({ email: adminEmail });
    
    if (admin) {
      // Update existing user to admin
      admin.userType = 'admin';
      admin.isEmailVerified = true;
      admin.isApprovedByAdmin = true;
      admin.adminApprovalStatus = 'approved';
      await admin.save();
      console.log('✅ Existing user updated to admin:', adminEmail);
    } else {
      // Create new admin user
      admin = await User.create(adminData);
      console.log('✅ New admin user created:', adminEmail);
    }

    console.log('Admin user details:');
    console.log('- Email:', admin.email);
    console.log('- User Type:', admin.userType);
    console.log('- Email Verified:', admin.isEmailVerified);
    console.log('- Admin Approved:', admin.isApprovedByAdmin);

    process.exit(0);
  } catch (error) {
    console.error('❌ Error creating admin:', error);
    process.exit(1);
  }
};

// Run the script
createAdmin();
