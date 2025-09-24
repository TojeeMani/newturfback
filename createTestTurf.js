const mongoose = require('mongoose');
const Turf = require('./models/Turf');
const User = require('./models/User');

async function createTestTurf() {
  try {
    await mongoose.connect('mongodb://localhost:27017/turfbooking');
    
    // Find the user we just created
    const user = await User.findOne({ email: 'tojeemani8@gmail.com' });
    if (!user) {
      console.log('User not found!');
      return;
    }
    
    const turfData = {
      name: 'Tojee Mani Football Ground',
      description: 'A premium football turf with excellent facilities',
      location: {
        address: '123 Main Street, Chennai',
        coordinates: {
          lat: 13.0827,
          lng: 80.2707
        }
      },
      ownerId: user._id,
      pricePerHour: 1200,
      images: ['https://example.com/turf1.jpg', 'https://example.com/turf2.jpg'],
      sport: 'Football',
      amenities: ['Parking', 'Changing Room', 'Drinking Water'],
      originalRegistrationData: {
        name: 'Tojee Mani Football Ground',
        address: '123 Main Street, Chennai',
        businessName: 'Tojee Mani Turfs'
      },
      isActive: true,
      isApproved: true,
      rating: 4.5,
      totalReviews: 0,
      totalBookings: 0
    };
    
    console.log('Creating test turf...');
    const turf = await Turf.create(turfData);
    console.log('Turf created successfully!');
    console.log('Turf ID:', turf._id.toString());
    console.log('Turf Name:', turf.name);
    console.log('Owner:', turf.ownerName);
    
    await mongoose.disconnect();
  } catch (error) {
    console.error('Error creating turf:', error.message);
    process.exit(1);
  }
}

createTestTurf();