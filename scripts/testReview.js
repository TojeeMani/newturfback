const axios = require('axios');

const testReviewSubmission = async () => {
  try {
    console.log('🧪 Testing review submission...');
    
    // Test data from your logs
    const testData = {
      userId: '6899c7060306c7c19d69a8cc',
      turfId: '68a33d8d50bac698ec1c0a9f',
      rating: 5,
      comment: 'nice',
      bookingId: '68d22eda90956a2e43735c54'
    };
    
    console.log('📤 Sending test review:', testData);
    
    // Note: This is a test - in real usage, you'd need proper authentication
    const response = await axios.post(
      'http://localhost:5001/api/turfs/68a33d8d50bac698ec1c0a9f/reviews',
      testData,
      {
        headers: {
          'Content-Type': 'application/json',
          // Add your auth token here if needed
        }
      }
    );
    
    console.log('✅ Review submitted successfully!');
    console.log('Response:', response.data);
    
  } catch (error) {
    console.error('❌ Review submission failed:');
    if (error.response) {
      console.error('Status:', error.response.status);
      console.error('Data:', error.response.data);
    } else {
      console.error('Error:', error.message);
    }
  }
};

// Run the test
testReviewSubmission();