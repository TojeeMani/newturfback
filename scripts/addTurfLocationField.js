const mongoose = require('mongoose');
const User = require('../models/User');
require('dotenv').config();

const addTurfLocationField = async () => {
  try {
    // Connect to MongoDB
    await mongoose.connect(process.env.MONGODB_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });

    console.log('Connected to MongoDB');

    // Find all turf owners who don't have turfLocation field
    const ownersWithoutTurfLocation = await User.find({
      userType: 'owner',
      turfLocation: { $exists: false }
    });

    console.log(`Found ${ownersWithoutTurfLocation.length} owners without turfLocation field`);

    if (ownersWithoutTurfLocation.length === 0) {
      console.log('All owners already have turfLocation field');
      process.exit(0);
    }

    // Update each owner
    let updatedCount = 0;
    for (const owner of ownersWithoutTurfLocation) {
      try {
        // Try to extract city from businessAddress or use location as fallback
        let turfLocation = '';
        
        if (owner.businessAddress) {
          // Try to extract city from business address
          const addressParts = owner.businessAddress.split(',');
          if (addressParts.length > 1) {
            // Take the second-to-last part as it's likely the city
            turfLocation = addressParts[addressParts.length - 2].trim();
          } else {
            turfLocation = addressParts[0].trim();
          }
        } else if (owner.location) {
          // Use personal location as fallback
          turfLocation = owner.location;
        } else {
          // Default to empty string - will need manual update
          turfLocation = '';
        }

        // Update the owner
        await User.findByIdAndUpdate(owner._id, {
          turfLocation: turfLocation
        });

        updatedCount++;
        console.log(`Updated owner ${owner.firstName} ${owner.lastName} - turfLocation: "${turfLocation}"`);
      } catch (error) {
        console.error(`Error updating owner ${owner._id}:`, error.message);
      }
    }

    console.log(`\nMigration completed successfully!`);
    console.log(`Updated ${updatedCount} out of ${ownersWithoutTurfLocation.length} owners`);
    
    // Show summary of owners that might need manual review
    const ownersWithEmptyTurfLocation = await User.find({
      userType: 'owner',
      turfLocation: ''
    });

    if (ownersWithEmptyTurfLocation.length > 0) {
      console.log(`\nWarning: ${ownersWithEmptyTurfLocation.length} owners have empty turfLocation and may need manual review:`);
      ownersWithEmptyTurfLocation.forEach(owner => {
        console.log(`- ${owner.firstName} ${owner.lastName} (${owner.email})`);
      });
    }

  } catch (error) {
    console.error('Migration failed:', error);
    process.exit(1);
  } finally {
    // Close the database connection
    await mongoose.connection.close();
    console.log('\nDatabase connection closed');
    process.exit(0);
  }
};

// Run the migration
console.log('Starting turfLocation field migration...');
addTurfLocationField();
