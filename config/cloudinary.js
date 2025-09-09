const cloudinary = require('cloudinary').v2;

const {
  CLOUDINARY_CLOUD_NAME,
  CLOUDINARY_API_KEY,
  CLOUDINARY_API_SECRET,
  NODE_ENV
} = process.env;

if (!CLOUDINARY_CLOUD_NAME || !CLOUDINARY_API_KEY || !CLOUDINARY_API_SECRET) {
  throw new Error(
    'Cloudinary configuration missing. Please set CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, and CLOUDINARY_API_SECRET in your environment.'
  );
}

// Configure Cloudinary using environment variables only (no hard-coded fallbacks)
cloudinary.config({
  cloud_name: CLOUDINARY_CLOUD_NAME,
  api_key: CLOUDINARY_API_KEY,
  api_secret: CLOUDINARY_API_SECRET
});

// Basic diagnostics (avoid logging secrets)
console.log('🔧 Cloudinary configured with cloud_name:', cloudinary.config().cloud_name);
if (NODE_ENV === 'development') {
  console.log('🔧 Cloudinary API key present:', Boolean(CLOUDINARY_API_KEY));
}

module.exports = cloudinary;
