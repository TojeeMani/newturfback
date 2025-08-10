const cloudinary = require('cloudinary').v2;

// Configure Cloudinary
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME || 'dlegjx9sw',
  api_key: process.env.CLOUDINARY_API_KEY || '195137459746475',
  api_secret: process.env.CLOUDINARY_API_SECRET || 'xB4MqKxf_Xh9qVt4jXlqjhNuqQ'
});

module.exports = cloudinary;
