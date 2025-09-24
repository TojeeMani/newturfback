const mongoose = require('mongoose');
const Booking = require('./models/Booking');
const Turf = require('./models/Turf');
const User = require('./models/User');

async function checkUserData() {
  try {
    await mongoose.connect('mongodb://localhost:27017/turfbooking');
    
    console.log('=== DATABASE OVERVIEW ===');
    console.log('Total users:', await User.countDocuments());
    console.log('Total turfs:', await Turf.countDocuments());
    console.log('Total bookings:', await Booking.countDocuments());
    console.log('');
    
    // Find the user in MongoDB by email
    const userEmail = 'tojeemani8@gmail.com';
    console.log('Looking up user by email:', userEmail);
    
    const user = await User.findOne({ email: userEmail });
    if (!user) {
      console.log('User not found in MongoDB!');
      console.log('Available users:', await User.find().select('email userType').limit(5));
      await mongoose.disconnect();
      return;
    }
    
    console.log('Found user:', user._id.toString(), 'Type:', user.userType, 'Firebase UID:', user.firebaseUid);
    console.log('');
    
    // Find turfs for this user
    console.log('=== TURF DATA ===');
    const turfs = await Turf.find({ ownerId: user._id });
    console.log('Turfs owned by this user:', turfs.length);
    
    if (turfs.length === 0) {
      console.log('No turfs found for this user!');
      console.log('All turfs in database:', await Turf.find().select('name ownerId').limit(5));
    } else {
      turfs.forEach(turf => {
        console.log(`- ${turf.name} (ID: ${turf._id})`);
      });
    }
    console.log('');
    
    // Find bookings for this user
    console.log('=== BOOKING DATA ===');
    const bookings = await Booking.find({ ownerId: user._id.toString() });
    console.log('Bookings for this user:', bookings.length);
    
    if (bookings.length === 0) {
      console.log('No bookings found for this user!');
      console.log('Sample bookings in database:', await Booking.find().select('ownerId turfId status').limit(3));
    } else {
      console.log('Booking summary:');
      bookings.forEach(booking => {
        console.log(`- ${booking.bookingDate.toDateString()} ${booking.startTime}-${booking.endTime} (${booking.status}) - ₹${booking.totalAmount}`);
      });
      console.log('Total revenue:', bookings.reduce((sum, b) => sum + (b.totalAmount || 0), 0));
    }
    
    await mongoose.disconnect();
  } catch (error) {
    console.error('Error:', error.message);
    process.exit(1);
  }
}

checkUserData();