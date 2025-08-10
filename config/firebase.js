const admin = require('firebase-admin');

// Initialize Firebase Admin SDK
// For development, we'll use a simpler approach that doesn't require service account

let firebaseAdmin;

try {
  // For development, we'll create a mock Firebase Admin that works with our setup
  console.log('Firebase Admin initialized in development mode');
  
  // Create a mock admin object for development
  firebaseAdmin = {
    auth: () => ({
      verifyIdToken: async (token) => {
        // For development, we'll decode the token manually
        // This is not secure for production but works for testing
        try {
          console.log('🔧 Verifying Firebase token:', token.substring(0, 50) + '...');
          
          // Simple JWT decode (without verification)
          const parts = token.split('.');
          if (parts.length !== 3) {
            throw new Error('Invalid token format - expected 3 parts');
          }
          
          // Handle base64url encoding (replace - with + and _ with /)
          const base64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
          const payload = JSON.parse(Buffer.from(base64, 'base64').toString());
          console.log('🔧 Decoded token payload:', payload);
          
          // Return a mock Firebase user object
          const result = {
            uid: payload.user_id || payload.sub || payload.uid || 'mock-uid',
            email: payload.email || 'test@example.com',
            name: payload.name || payload.display_name || 'Test User',
            picture: payload.picture || payload.photoURL || '',
            email_verified: payload.email_verified || true
          };
          
          console.log('🔧 Returning Firebase user:', result);
          return result;
        } catch (error) {
          console.error('Token decode error:', error);
          throw new Error('Invalid token format');
        }
      }
    })
  };
} catch (error) {
  console.error('Firebase Admin initialization error:', error);
  throw error;
}

module.exports = firebaseAdmin; 