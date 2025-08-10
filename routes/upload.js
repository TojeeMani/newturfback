const express = require('express');
const multer = require('multer');
const router = express.Router();
const imageUploadService = require('../services/imageUploadService');
const { protect, authorize } = require('../middleware/auth');
const asyncHandler = require('../middleware/async');
const ErrorResponse = require('../utils/errorResponse');

// Configure multer for memory storage
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB limit
  },
  fileFilter: (req, file, cb) => {
    // Check file type
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Only image files are allowed'), false);
    }
  }
});

// @desc    Upload single image
// @route   POST /api/upload/image
// @access  Private
router.post('/image', protect, upload.single('image'), asyncHandler(async (req, res, next) => {
  if (!req.file) {
    return next(new ErrorResponse('Please upload an image', 400));
  }

  try {
    const result = await imageUploadService.uploadImage(
      req.file.buffer,
      'turfs',
      `turf_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
    );

    if (!result.success) {
      return next(new ErrorResponse(result.error, 500));
    }

    res.status(200).json({
      success: true,
      data: {
        url: result.url,
        publicId: result.publicId,
        width: result.width,
        height: result.height,
        format: result.format,
        size: result.size
      }
    });
  } catch (error) {
    console.error('❌ Image upload error:', error);
    return next(new ErrorResponse('Failed to upload image', 500));
  }
}));

// @desc    Upload multiple images
// @route   POST /api/upload/images
// @access  Private
router.post('/images', protect, upload.array('images', 5), asyncHandler(async (req, res, next) => {
  if (!req.files || req.files.length === 0) {
    return next(new ErrorResponse('Please upload at least one image', 400));
  }

  if (req.files.length > 5) {
    return next(new ErrorResponse('Maximum 5 images allowed', 400));
  }

  try {
    const imageBuffers = req.files.map(file => file.buffer);
    const result = await imageUploadService.uploadMultipleImages(imageBuffers, 'turfs');

    if (!result.success) {
      return next(new ErrorResponse(result.error, 500));
    }

    res.status(200).json({
      success: true,
      data: {
        images: result.images,
        totalUploaded: result.totalUploaded,
        totalFailed: result.totalFailed,
        failed: result.failed
      }
    });
  } catch (error) {
    console.error('❌ Multiple image upload error:', error);
    return next(new ErrorResponse('Failed to upload images', 500));
  }
}));

// @desc    Delete image
// @route   DELETE /api/upload/image/:publicId
// @access  Private
router.delete('/image/:publicId', protect, asyncHandler(async (req, res, next) => {
  const { publicId } = req.params;

  try {
    const result = await imageUploadService.deleteImage(publicId);

    if (!result.success) {
      return next(new ErrorResponse(result.error, 500));
    }

    res.status(200).json({
      success: true,
      message: result.message
    });
  } catch (error) {
    console.error('❌ Image deletion error:', error);
    return next(new ErrorResponse('Failed to delete image', 500));
  }
}));

// @desc    Generate optimized URL
// @route   GET /api/upload/optimize/:publicId
// @access  Public
router.get('/optimize/:publicId', asyncHandler(async (req, res, next) => {
  const { publicId } = req.params;
  const { width, height, quality, format } = req.query;

  try {
    const options = {};
    if (width) options.width = parseInt(width);
    if (height) options.height = parseInt(height);
    if (quality) options.quality = quality;
    if (format) options.fetch_format = format;

    const optimizedUrl = imageUploadService.generateOptimizedUrl(publicId, options);

    res.status(200).json({
      success: true,
      data: {
        url: optimizedUrl,
        publicId: publicId
      }
    });
  } catch (error) {
    console.error('❌ URL generation error:', error);
    return next(new ErrorResponse('Failed to generate optimized URL', 500));
  }
}));

module.exports = router;
