# Cloudinary Integration Setup

This guide explains how to set up Cloudinary for image uploads in your TurfEase application.

## 🔧 Configuration

### 1. Environment Variables

Add these variables to your `.env` file:

```env
# Cloudinary Configuration
CLOUDINARY_CLOUD_NAME=dlegjx9sw
CLOUDINARY_API_KEY=195137459746475
CLOUDINARY_API_SECRET=xB4MqKxf_Xh9qVt4jXlqjhNuqQ
```

### 2. Get Your Cloudinary API Secret

1. Go to [Cloudinary Console](https://console.cloudinary.com/)
2. Sign in to your account
3. Go to **Settings** → **Access Keys**
4. Copy your **API Secret**
5. Replace `your_cloudinary_api_secret_here` in your `.env` file

## 📁 Files Created/Modified

### Backend Files:
- `config/cloudinary.js` - Cloudinary configuration
- `services/imageUploadService.js` - Image upload service
- `routes/upload.js` - Upload API routes
- `controllers/turfController.js` - Updated to handle image uploads
- `server.js` - Added upload routes

### Frontend Files:
- `services/turfService.js` - Already had upload method
- `components/ImageUpload.jsx` - Image upload component
- `pages/OwnerDashboard.jsx` - Updated to handle image uploads

## 🚀 API Endpoints

### Upload Endpoints:
- `POST /api/upload/image` - Upload single image
- `POST /api/upload/images` - Upload multiple images (max 5)
- `DELETE /api/upload/image/:publicId` - Delete image
- `GET /api/upload/optimize/:publicId` - Generate optimized URL

### Turf Endpoints (Updated):
- `POST /api/turfs` - Create turf with image uploads
- `PUT /api/turfs/:id` - Update turf with new images

## 🧪 Testing

Run the test script to verify Cloudinary integration:

```bash
cd backend
node test-cloudinary.js
```

## 📸 Features

### Image Optimization:
- Automatic resizing to 800x600 (limit)
- Quality optimization
- Format optimization (auto WebP/AVIF)
- Thumbnail generation

### Upload Features:
- Drag & drop support
- Multiple file selection
- File type validation
- Size validation (5MB max)
- Progress feedback

### Storage:
- Images stored in Cloudinary 'turfs' folder
- Unique public IDs for each image
- Secure HTTPS URLs
- Automatic backup and CDN

## 🔒 Security

- File type validation (images only)
- File size limits
- Authentication required for uploads
- Owner-only access to turf images

## 💾 Database Storage

Images are stored as URLs in the MongoDB Turf collection:

```javascript
{
  name: "Turf Name",
  location: { address: "...", coordinates: { lat: 0, lng: 0 } },
  pricePerHour: 1000,
  images: [
    "https://res.cloudinary.com/dlegjx9sw/image/upload/v123/turfs/turf_123.jpg",
    "https://res.cloudinary.com/dlegjx9sw/image/upload/v123/turfs/turf_124.jpg"
  ],
  // ... other fields
}
```

## 🎯 Usage Example

```javascript
// Frontend - Upload images
const files = [file1, file2, file3];
const uploadResult = await turfService.uploadImages(files);

// Backend - Create turf with images
const turfData = {
  name: "My Turf",
  location: { address: "...", coordinates: { lat: 0, lng: 0 } },
  pricePerHour: 1000,
  images: ["https://res.cloudinary.com/...", "https://res.cloudinary.com/..."]
};

const turf = await Turf.create(turfData);
```

## 🐛 Troubleshooting

### Common Issues:

1. **"Invalid API Secret"**
   - Check your Cloudinary API secret in `.env`
   - Ensure no extra spaces or characters

2. **"Upload failed"**
   - Check file size (max 5MB)
   - Ensure file is an image
   - Check network connection

3. **"CORS error"**
   - Ensure Cloudinary domain is allowed
   - Check frontend URL configuration

### Debug Mode:
Enable detailed logging by setting `NODE_ENV=development` in your `.env` file.
