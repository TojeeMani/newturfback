const mongoose = require('mongoose');
require('dotenv').config();

const dropReviewIndex = async () => {
  try {
    console.log('🔄 Connecting to MongoDB...');
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/turfease');
    
    console.log('📋 Getting Review collection...');
    const reviewCollection = mongoose.connection.db.collection('reviews');
    
    console.log('🔍 Current indexes on reviews collection:');
    const indexes = await reviewCollection.indexes();
    console.log(indexes);
    
    // Find the problematic index
    const turfUserIndex = indexes.find(idx => 
      idx.key && idx.key.turfId === 1 && idx.key.userId === 1
    );
    
    if (turfUserIndex) {
      console.log('🗑️  Found problematic index:', turfUserIndex.name);
      console.log('🗑️  Dropping turfId_1_userId_1 index...');
      await reviewCollection.dropIndex('turfId_1_userId_1');
      console.log('✅ Successfully dropped the problematic index!');
    } else {
      console.log('ℹ️  No turfId_1_userId_1 index found');
    }
    
    console.log('🔍 Remaining indexes after cleanup:');
    const remainingIndexes = await reviewCollection.indexes();
    console.log(remainingIndexes);
    
  } catch (error) {
    console.error('❌ Error dropping index:', error.message);
  } finally {
    await mongoose.disconnect();
    console.log('🔌 Disconnected from MongoDB');
  }
};

dropReviewIndex();