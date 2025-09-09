const mongoose = require('mongoose');
const User = require('../models/User');
const Turf = require('../models/Turf');
const Booking = require('../models/Booking');
const bcrypt = require('bcryptjs');

// Database initialization script
const initDatabase = async () => {
  try {
    console.log('Starting database initialization...');
    
    // Connect to MongoDB
    if (mongoose.connection.readyState === 0) {
      await mongoose.connect(process.env.MONGO_URI || 'mongodb://localhost:27017/turfbooking');
      console.log('Connected to MongoDB');
    }
    
    // Check if we already have data
    const userCount = await User.countDocuments({});
    const turfCount = await Turf.countDocuments({});
    
    console.log(`Current database state: ${userCount} users, ${turfCount} turfs`);
    
    // Create sample users if none exist
    if (userCount === 0) {
      console.log('Creating sample users...');
      
      const sampleUsers = [
        {
          firstName: 'Admin',
          lastName: 'User',
          email: 'admin@turfbooking.com',
          password: await bcrypt.hash('admin123', 12),
          userType: 'admin',
          phone: '+91-9999999999',
          isEmailVerified: true,
          isOtpVerified: true,
          agreeToTerms: true
        },
        {
          firstName: 'John',
          lastName: 'Owner',
          email: 'john.owner@example.com',
          password: await bcrypt.hash('owner123', 12),
          userType: 'owner',
          phone: '+91-9876543210',
          isEmailVerified: true,
          isOtpVerified: true,
          agreeToTerms: true,
          adminApprovalStatus: 'approved',
          isApprovedByAdmin: true,
          businessName: 'John Sports Complex',
          turfCount: '2-5',
          turfLocation: 'Mumbai',
          sportType: 'Football',
          sportTypes: ['Football', 'Cricket']
        },
        {
          firstName: 'Jane',
          lastName: 'Owner',
          email: 'jane.owner@example.com',
          password: await bcrypt.hash('owner123', 12),
          userType: 'owner',
          phone: '+91-9876543211',
          isEmailVerified: true,
          isOtpVerified: true,
          agreeToTerms: true,
          adminApprovalStatus: 'approved',
          isApprovedByAdmin: true,
          businessName: 'Jane Sports Arena',
          turfCount: '1',
          turfLocation: 'Mumbai',
          sportType: 'Cricket',
          sportTypes: ['Cricket', 'Tennis', 'Badminton']
        },
        {
          firstName: 'Mike',
          lastName: 'Customer',
          email: 'mike.customer@example.com',
          password: await bcrypt.hash('customer123', 12),
          userType: 'player',
          phone: '+91-9876543212',
          isEmailVerified: true,
          isOtpVerified: true,
          agreeToTerms: true
        }
      ];
      
      for (const userData of sampleUsers) {
        const user = await User.create(userData);
        console.log(`Created user: ${user.firstName} ${user.lastName} (${user.userType})`);
      }
    }
    
    // Create sample turfs if none exist
    if (turfCount === 0) {
      console.log('Creating sample turfs...');
      
      const owners = await User.find({ userType: 'owner' });
      
      if (owners.length === 0) {
        console.log('No owners found. Cannot create turfs.');
        return;
      }
      
      // Default slot structure
      const defaultSlots = {
        monday: {
          isOpen: true,
          slots: [
            { startTime: '06:00', endTime: '07:00', price: 500, isBooked: false },
            { startTime: '07:00', endTime: '08:00', price: 500, isBooked: false },
            { startTime: '08:00', endTime: '09:00', price: 600, isBooked: false },
            { startTime: '09:00', endTime: '10:00', price: 600, isBooked: false },
            { startTime: '10:00', endTime: '11:00', price: 600, isBooked: false },
            { startTime: '16:00', endTime: '17:00', price: 700, isBooked: false },
            { startTime: '17:00', endTime: '18:00', price: 700, isBooked: false },
            { startTime: '18:00', endTime: '19:00', price: 800, isBooked: false },
            { startTime: '19:00', endTime: '20:00', price: 800, isBooked: false },
            { startTime: '20:00', endTime: '21:00', price: 800, isBooked: false }
          ]
        }
      };
      
      // Copy Monday slots to all other days
      const allDaysSlots = {};
      const days = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
      days.forEach(day => {
        allDaysSlots[day] = JSON.parse(JSON.stringify(defaultSlots.monday));
      });
      
      const sampleTurfs = [
        {
          ownerId: owners[0]._id,
          name: 'John Sports Complex',
          location: {
            address: 'Mumbai',
            coordinates: {
              lat: 19.0760,
              lng: 72.8777
            }
          },
          pricePerHour: 600,
          images: [
            'https://images.unsplash.com/photo-1551698618-1dfe5d97d256?w=800',
            'https://images.unsplash.com/photo-1574629810360-7efbbe195018?w=800'
          ],
          sport: 'Football',
          description: 'Premium football turf with excellent facilities and lighting.',
          amenities: ['Parking', 'Changing Room', 'Floodlights', 'Drinking Water', 'Washroom'],
          rating: 4.5,
          totalReviews: 25,
          isApproved: true,
          isFeatured: true,
          availableSlots: allDaysSlots,
          slotDuration: 60,
          advanceBookingDays: 30,
          originalRegistrationData: {
            name: 'John Sports Complex',
            address: 'Mumbai',
            businessName: 'John Sports Complex'
          }
        },
        {
          ownerId: owners[1] ? owners[1]._id : owners[0]._id,
          name: 'Jane Sports Arena',
          location: {
            address: 'Mumbai',
            coordinates: {
              lat: 19.0760,
              lng: 72.8777
            }
          },
          pricePerHour: 500,
          images: [
            'https://images.unsplash.com/photo-1571019613454-1cb2f99b2d8b?w=800',
            'https://images.unsplash.com/photo-1574629810360-7efbbe195018?w=800'
          ],
          sport: 'Cricket',
          description: 'Well-maintained cricket turf suitable for all skill levels.',
          amenities: ['Parking', 'Changing Room', 'Floodlights', 'Drinking Water'],
          rating: 4.2,
          totalReviews: 18,
          isApproved: true,
          isFeatured: false,
          availableSlots: allDaysSlots,
          slotDuration: 60,
          advanceBookingDays: 15,
          originalRegistrationData: {
            name: 'Jane Sports Arena',
            address: 'Mumbai',
            businessName: 'Jane Sports Arena'
          }
        },
        {
          ownerId: owners[0]._id,
          name: 'John Sports Complex',
          location: {
            address: 'Mumbai',
            coordinates: {
              lat: 19.0760,
              lng: 72.8777
            }
          },
          pricePerHour: 400,
          images: [
            'https://images.unsplash.com/photo-1544551763-46a013bb70d5?w=800'
          ],
          sport: 'Football',
          description: 'Indoor football turf with professional-grade artificial grass.',
          amenities: ['Parking', 'Changing Room', 'AC', 'Drinking Water', 'Equipment Rental'],
          rating: 4.7,
          totalReviews: 32,
          isApproved: true,
          isFeatured: true,
          availableSlots: allDaysSlots,
          slotDuration: 60,
          advanceBookingDays: 20,
          originalRegistrationData: {
            name: 'John Sports Complex',
            address: 'Mumbai',
            businessName: 'John Sports Complex'
          }
        }
      ];
      
      for (const turfData of sampleTurfs) {
        const turf = await Turf.create(turfData);
        console.log(`Created turf: ${turf.name} (${turf.sport})`);
      }
    }
    
    // Display final summary
    const finalUserCount = await User.countDocuments({});
    const finalTurfCount = await Turf.countDocuments({});
    const finalBookingCount = await Booking.countDocuments({});
    
    console.log('\n=== Database Initialization Complete ===');
    console.log(`Users: ${finalUserCount}`);
    console.log(`Turfs: ${finalTurfCount}`);
    console.log(`Bookings: ${finalBookingCount}`);
    
    // Show sample login credentials
    console.log('\n=== Sample Login Credentials ===');
    console.log('Admin: admin@turfbooking.com / admin123');
    console.log('Owner: john.owner@example.com / owner123');
    console.log('Owner: jane.owner@example.com / owner123');
    console.log('Customer: mike.customer@example.com / customer123');
    
    return {
      success: true,
      users: finalUserCount,
      turfs: finalTurfCount,
      bookings: finalBookingCount
    };
    
  } catch (error) {
    console.error('Database initialization failed:', error);
    throw error;
  }
};

module.exports = { initDatabase };

// Run initialization if this file is executed directly
if (require.main === module) {
  initDatabase()
    .then(() => {
      console.log('Database initialization script completed successfully');
      process.exit(0);
    })
    .catch((error) => {
      console.error('Database initialization script failed:', error);
      process.exit(1);
    });
}