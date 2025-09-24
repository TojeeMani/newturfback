const mongoose = require('mongoose');
const User = require('./models/User');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');

async function createFirebaseOwner() {
  try {
    await mongoose.connect('mongodb://localhost:27017/turfbooking');
    
    const userData = {
      firstName: 'Tojee',
      lastName: 'Mani',
      email: 'tojeemani8@gmail.com',
      phone: '0000000000',
      firebaseUid: 'nQVrS8PtRQcp8D0onwekxzogWZg1',
      password: crypto.randomBytes(32).toString('hex'),
      userType: 'owner',
      isEmailVerified: true,
      agreeToTerms: true,
      isActive: true,
      avatar: 'https://lh3.googleusercontent.com/a/ACg8ocKJezIZmZjo0MFIYIF_WBvt1vSwcyBbonut4gtVDL852L-Fcc2=s96-c',
      preferredSports: [],
      location: '',
      isApprovedByAdmin: true,
      adminApprovalStatus: 'approved',
      businessName: 'Tojee Mani Turfs',
      businessAddress: 'TBD',
      businessPhone: '0000000000',
      turfCount: '1',
      turfLocation: 'TBD',
      sportType: 'Football',
      sportTypes: ['Football']
    };
    
    console.log('Creating Firebase owner user...');
    const user = await User.create(userData);
    console.log('User created successfully!');
    console.log('User ID:', user._id.toString());
    console.log('Email:', user.email);
    console.log('User Type:', user.userType);
    console.log('Firebase UID:', user.firebaseUid);
    
    await mongoose.disconnect();
  } catch (error) {
    console.error('Error creating user:', error.message);
    process.exit(1);
  }
}

createFirebaseOwner();