const cloudinary = require('cloudinary').v2;

// Configure Cloudinary
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME || 'dlegjx9sw',
  api_key: process.env.CLOUDINARY_API_KEY || '195137459746475',
  api_secret: process.env.CLOUDINARY_API_SECRET || 'gxB4MqKxf_Xh9qVt4jXlqjhNuqQ'
});

// Test Cloudinary connection
console.log('🔧 Cloudinary configured with cloud_name:', cloudinary.config().cloud_name);

module.exports = cloudinary;
