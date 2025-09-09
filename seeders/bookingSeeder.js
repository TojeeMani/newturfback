const mongoose = require('mongoose');
const Turf = require('../models/Turf');
const Booking = require('../models/Booking');
const User = require('../models/User');

// Seeder script to create sample bookings for testing
const seedBookings = async () => {
  try {
    console.log('Starting booking seeder...');
    
    // Connect to MongoDB if not already connected
    if (mongoose.connection.readyState === 0) {
      await mongoose.connect(process.env.MONGO_URI || 'mongodb://localhost:27017/turfbooking');
      console.log('Connected to MongoDB');
    }
    
    // Find existing turfs and users
    const turfs = await Turf.find({ isApproved: true }).limit(3);
    const users = await User.find({ userType: 'owner' }).limit(3);
    
    if (turfs.length === 0) {
      console.log('No approved turfs found. Please create some turfs first.');
      return;
    }
    
    if (users.length === 0) {
      console.log('No owner users found. Please create some users first.');
      return;
    }
    
    console.log(`Found ${turfs.length} turfs and ${users.length} users`);
    
    // Sample customer data
    const sampleCustomers = [
      {
        name: 'John Doe',
        phone: '+91-9876543210',
        email: 'john.doe@example.com'
      },
      {
        name: 'Jane Smith',
        phone: '+91-9876543211',
        email: 'jane.smith@example.com'
      },
      {
        name: 'Mike Johnson',
        phone: '+91-9876543212',
        email: 'mike.johnson@example.com'
      },
      {
        name: 'Sarah Wilson',
        phone: '+91-9876543213',
        email: 'sarah.wilson@example.com'
      },
      {
        name: 'David Brown',
        phone: '+91-9876543214',
        email: 'david.brown@example.com'
      }
    ];
    
    // Sample time slots
    const timeSlots = [
      { startTime: '06:00', endTime: '07:00' },
      { startTime: '07:00', endTime: '08:00' },
      { startTime: '08:00', endTime: '09:00' },
      { startTime: '09:00', endTime: '10:00' },
      { startTime: '10:00', endTime: '11:00' },
      { startTime: '16:00', endTime: '17:00' },
      { startTime: '17:00', endTime: '18:00' },
      { startTime: '18:00', endTime: '19:00' },
      { startTime: '19:00', endTime: '20:00' },
      { startTime: '20:00', endTime: '21:00' }
    ];
    
    // Booking statuses
    const statuses = ['confirmed', 'pending', 'completed'];
    const paymentStatuses = ['paid', 'pending', 'partial'];
    const paymentMethods = ['cash', 'card', 'upi'];
    
    let createdBookings = 0;
    
    // Create bookings for the next 7 days
    const today = new Date();
    
    for (let dayOffset = 0; dayOffset < 7; dayOffset++) {
      const bookingDate = new Date(today);
      bookingDate.setDate(today.getDate() + dayOffset);
      
      // Create 2-4 random bookings per day per turf
      for (const turf of turfs) {
        const bookingsPerDay = Math.floor(Math.random() * 3) + 2; // 2-4 bookings
        
        for (let i = 0; i < bookingsPerDay; i++) {
          const randomCustomer = sampleCustomers[Math.floor(Math.random() * sampleCustomers.length)];
          const randomSlot = timeSlots[Math.floor(Math.random() * timeSlots.length)];
          const randomStatus = statuses[Math.floor(Math.random() * statuses.length)];
          const randomPaymentStatus = paymentStatuses[Math.floor(Math.random() * paymentStatuses.length)];
          const randomPaymentMethod = paymentMethods[Math.floor(Math.random() * paymentMethods.length)];
          
          // Check if this slot is already booked for this turf and date
          const existingBooking = await Booking.findOne({
            turfId: turf._id,
            bookingDate,
            startTime: randomSlot.startTime,
            endTime: randomSlot.endTime
          });
          
          if (existingBooking) {
            continue; // Skip if slot already booked
          }
          
          try {
            // Calculate duration in minutes
            const startHour = parseInt(randomSlot.startTime.split(':')[0]);
            const startMinute = parseInt(randomSlot.startTime.split(':')[1]);
            const endHour = parseInt(randomSlot.endTime.split(':')[0]);
            const endMinute = parseInt(randomSlot.endTime.split(':')[1]);
            const duration = (endHour * 60 + endMinute) - (startHour * 60 + startMinute);
            
            // Calculate total amount based on duration and price per hour
            const totalAmount = Math.round((duration / 60) * (turf.pricePerHour || 500));
            
            const booking = await Booking.create({
              turfId: turf._id,
              ownerId: turf.ownerId,
              customerInfo: randomCustomer,
              bookingDate,
              startTime: randomSlot.startTime,
              endTime: randomSlot.endTime,
              duration: duration,
              pricePerHour: turf.pricePerHour || 500,
              totalAmount: totalAmount,
              status: randomStatus,
              paymentStatus: randomPaymentStatus,
              paymentMethod: randomPaymentMethod,
              paymentAmount: randomPaymentStatus === 'paid' ? totalAmount : 
                           randomPaymentStatus === 'partial' ? Math.floor(totalAmount * 0.5) : 0,
              bookingType: 'offline',
              notes: `Sample booking for ${randomCustomer.name}`
            });
            
            // Update turf slot status
            const dayOfWeek = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'][bookingDate.getDay()];
            
            if (turf.availableSlots && turf.availableSlots[dayOfWeek]) {
              const slot = turf.availableSlots[dayOfWeek].slots.find(s => 
                s.startTime === randomSlot.startTime && s.endTime === randomSlot.endTime
              );
              
              if (slot) {
                slot.isBooked = true;
                slot.bookedBy = booking._id;
                slot.bookingDate = bookingDate;
                await turf.save();
              }
            }
            
            createdBookings++;
            console.log(`Created booking ${createdBookings}: ${randomCustomer.name} at ${turf.name} on ${bookingDate.toDateString()} ${randomSlot.startTime}-${randomSlot.endTime}`);
            
          } catch (error) {
            console.error(`Error creating booking: ${error.message}`);
          }
        }
      }
    }
    
    console.log(`\nSeeding completed successfully!`);
    console.log(`Created ${createdBookings} sample bookings`);
    
    // Display summary
    const totalBookings = await Booking.countDocuments({});
    const confirmedBookings = await Booking.countDocuments({ status: 'confirmed' });
    const pendingBookings = await Booking.countDocuments({ status: 'pending' });
    const paidBookings = await Booking.countDocuments({ paymentStatus: 'paid' });
    
    console.log('\n=== Booking Summary ===');
    console.log(`Total bookings in database: ${totalBookings}`);
    console.log(`Confirmed bookings: ${confirmedBookings}`);
    console.log(`Pending bookings: ${pendingBookings}`);
    console.log(`Paid bookings: ${paidBookings}`);
    
    return {
      success: true,
      message: `Successfully created ${createdBookings} sample bookings`,
      createdBookings,
      totalBookings
    };
    
  } catch (error) {
    console.error('Seeding failed:', error);
    throw error;
  }
};

// Function to clear all bookings (for testing)
const clearBookings = async () => {
  try {
    console.log('Clearing all bookings...');
    
    // Remove all bookings
    const result = await Booking.deleteMany({});
    console.log(`Deleted ${result.deletedCount} bookings`);
    
    // Reset turf slot statuses
    const turfs = await Turf.find({});
    for (const turf of turfs) {
      if (turf.availableSlots) {
        Object.keys(turf.availableSlots).forEach(day => {
          if (turf.availableSlots[day].slots) {
            turf.availableSlots[day].slots.forEach(slot => {
              slot.isBooked = false;
              slot.bookedBy = null;
              slot.bookingDate = null;
            });
          }
        });
        await turf.save();
      }
    }
    
    console.log('All bookings cleared and turf slots reset');
    
    return {
      success: true,
      message: `Cleared ${result.deletedCount} bookings`,
      deletedCount: result.deletedCount
    };
    
  } catch (error) {
    console.error('Clear bookings failed:', error);
    throw error;
  }
};

module.exports = {
  seedBookings,
  clearBookings
};

// Run seeder if this file is executed directly
if (require.main === module) {
  const action = process.argv[2];
  
  if (action === 'clear') {
    clearBookings()
      .then(() => {
        console.log('Clear bookings script completed successfully');
        process.exit(0);
      })
      .catch((error) => {
        console.error('Clear bookings script failed:', error);
        process.exit(1);
      });
  } else {
    seedBookings()
      .then(() => {
        console.log('Booking seeder script completed successfully');
        process.exit(0);
      })
      .catch((error) => {
        console.error('Booking seeder script failed:', error);
        process.exit(1);
      });
  }
}