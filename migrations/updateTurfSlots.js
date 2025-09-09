const mongoose = require('mongoose');
const Turf = require('../models/Turf');

// Migration script to update existing turfs with proper slot structure
const updateTurfSlots = async () => {
  try {
    console.log('Starting turf slots migration...');
    
    // Connect to MongoDB if not already connected
    if (mongoose.connection.readyState === 0) {
      await mongoose.connect(process.env.MONGO_URI || 'mongodb://localhost:27017/turfbooking');
      console.log('Connected to MongoDB');
    }
    
    // Find all turfs that don't have proper slot structure
    const turfs = await Turf.find({
      $or: [
        { availableSlots: { $exists: false } },
        { slotDuration: { $exists: false } },
        { advanceBookingDays: { $exists: false } }
      ]
    });
    
    console.log(`Found ${turfs.length} turfs to update`);
    
    // Default slot structure
    const defaultSlots = {
      monday: {
        isOpen: true,
        slots: [
          { startTime: '06:00', endTime: '07:00', price: 0, isBooked: false, bookedBy: null, bookingDate: null },
          { startTime: '07:00', endTime: '08:00', price: 0, isBooked: false, bookedBy: null, bookingDate: null },
          { startTime: '08:00', endTime: '09:00', price: 0, isBooked: false, bookedBy: null, bookingDate: null },
          { startTime: '09:00', endTime: '10:00', price: 0, isBooked: false, bookedBy: null, bookingDate: null },
          { startTime: '10:00', endTime: '11:00', price: 0, isBooked: false, bookedBy: null, bookingDate: null },
          { startTime: '11:00', endTime: '12:00', price: 0, isBooked: false, bookedBy: null, bookingDate: null },
          { startTime: '12:00', endTime: '13:00', price: 0, isBooked: false, bookedBy: null, bookingDate: null },
          { startTime: '13:00', endTime: '14:00', price: 0, isBooked: false, bookedBy: null, bookingDate: null },
          { startTime: '14:00', endTime: '15:00', price: 0, isBooked: false, bookedBy: null, bookingDate: null },
          { startTime: '15:00', endTime: '16:00', price: 0, isBooked: false, bookedBy: null, bookingDate: null },
          { startTime: '16:00', endTime: '17:00', price: 0, isBooked: false, bookedBy: null, bookingDate: null },
          { startTime: '17:00', endTime: '18:00', price: 0, isBooked: false, bookedBy: null, bookingDate: null },
          { startTime: '18:00', endTime: '19:00', price: 0, isBooked: false, bookedBy: null, bookingDate: null },
          { startTime: '19:00', endTime: '20:00', price: 0, isBooked: false, bookedBy: null, bookingDate: null },
          { startTime: '20:00', endTime: '21:00', price: 0, isBooked: false, bookedBy: null, bookingDate: null },
          { startTime: '21:00', endTime: '22:00', price: 0, isBooked: false, bookedBy: null, bookingDate: null }
        ]
      }
    };
    
    // Copy the same structure for all days
    const daysOfWeek = ['tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
    daysOfWeek.forEach(day => {
      defaultSlots[day] = JSON.parse(JSON.stringify(defaultSlots.monday));
    });
    
    let updatedCount = 0;
    
    // Update each turf
    for (const turf of turfs) {
      const updateData = {};
      
      // Add slot structure if missing
      if (!turf.availableSlots) {
        // Set default price based on turf's pricePerHour
        const hourlyPrice = turf.pricePerHour || 500;
        
        // Update all slot prices
        Object.keys(defaultSlots).forEach(day => {
          defaultSlots[day].slots.forEach(slot => {
            slot.price = hourlyPrice;
          });
        });
        
        updateData.availableSlots = defaultSlots;
      }
      
      // Add slot duration if missing
      if (!turf.slotDuration) {
        updateData.slotDuration = 60; // 1 hour default
      }
      
      // Add advance booking days if missing
      if (!turf.advanceBookingDays) {
        updateData.advanceBookingDays = 30; // 30 days default
      }
      
      // Update the turf
      if (Object.keys(updateData).length > 0) {
        await Turf.findByIdAndUpdate(turf._id, updateData);
        updatedCount++;
        console.log(`Updated turf: ${turf.name} (${turf._id})`);
      }
    }
    
    console.log(`Migration completed. Updated ${updatedCount} turfs.`);
    
    // Create indexes for better performance
    console.log('Creating database indexes...');
    
    // Turf indexes
    await Turf.collection.createIndex({ ownerId: 1 });
    await Turf.collection.createIndex({ 'location.coordinates': '2dsphere' });
    await Turf.collection.createIndex({ sport: 1 });
    await Turf.collection.createIndex({ isApproved: 1 });
    await Turf.collection.createIndex({ isFeatured: 1 });
    await Turf.collection.createIndex({ rating: -1 });
    await Turf.collection.createIndex({ pricePerHour: 1 });
    
    console.log('Database indexes created successfully.');
    
    return {
      success: true,
      message: `Migration completed successfully. Updated ${updatedCount} turfs.`,
      updatedCount
    };
    
  } catch (error) {
    console.error('Migration failed:', error);
    throw error;
  }
};

// Function to rollback migration (if needed)
const rollbackTurfSlots = async () => {
  try {
    console.log('Rolling back turf slots migration...');
    
    // Remove slot-related fields from all turfs
    const result = await Turf.updateMany(
      {},
      {
        $unset: {
          availableSlots: 1,
          slotDuration: 1,
          advanceBookingDays: 1
        }
      }
    );
    
    console.log(`Rollback completed. Modified ${result.modifiedCount} turfs.`);
    
    return {
      success: true,
      message: `Rollback completed successfully. Modified ${result.modifiedCount} turfs.`,
      modifiedCount: result.modifiedCount
    };
    
  } catch (error) {
    console.error('Rollback failed:', error);
    throw error;
  }
};

// Function to validate migration
const validateMigration = async () => {
  try {
    console.log('Validating migration...');
    
    // Check if all turfs have required fields
    const turfsWithoutSlots = await Turf.countDocuments({
      $or: [
        { availableSlots: { $exists: false } },
        { slotDuration: { $exists: false } },
        { advanceBookingDays: { $exists: false } }
      ]
    });
    
    const totalTurfs = await Turf.countDocuments({});
    const validTurfs = totalTurfs - turfsWithoutSlots;
    
    console.log(`Validation results:`);
    console.log(`Total turfs: ${totalTurfs}`);
    console.log(`Valid turfs: ${validTurfs}`);
    console.log(`Invalid turfs: ${turfsWithoutSlots}`);
    
    return {
      success: turfsWithoutSlots === 0,
      totalTurfs,
      validTurfs,
      invalidTurfs: turfsWithoutSlots
    };
    
  } catch (error) {
    console.error('Validation failed:', error);
    throw error;
  }
};

module.exports = {
  updateTurfSlots,
  rollbackTurfSlots,
  validateMigration
};

// Run migration if this file is executed directly
if (require.main === module) {
  updateTurfSlots()
    .then(() => {
      console.log('Migration script completed successfully');
      process.exit(0);
    })
    .catch((error) => {
      console.error('Migration script failed:', error);
      process.exit(1);
    });
}