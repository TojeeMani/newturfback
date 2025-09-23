const express = require('express');
const multer = require('multer');
const path = require('path');
const { protect, authorize } = require('../middleware/auth');
const {
  extractText,
  verifyBusinessLicense,
  verifyPANCard,
  verifyAadhaarCard,
  verifyGSTCertificate,
  verifyDocument,
  getSupportedFormats,
  cleanupTempFiles
} = require('../controllers/ocrController');

const router = express.Router();

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, 'temp/ocr/');
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname));
  }
});

const fileFilter = (req, file, cb) => {
  const allowedTypes = /jpeg|jpg|png|pdf|tiff|bmp/;
  const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
  const mimetype = allowedTypes.test(file.mimetype);

  if (mimetype && extname) {
    return cb(null, true);
  } else {
    cb(new Error('Only image files (JPEG, PNG, PDF, TIFF, BMP) are allowed!'));
  }
};

const upload = multer({
  storage: storage,
  limits: {
    fileSize: 10 * 1024 * 1024 // 10MB limit
  },
  fileFilter: fileFilter
});

// All OCR routes require admin authentication
router.use(protect);
router.use(authorize('admin'));

// OCR Routes
router.get('/supported-formats', getSupportedFormats);
router.post('/extract-text', upload.single('document'), extractText);
router.post('/verify-business-license', upload.single('document'), verifyBusinessLicense);
router.post('/verify-pan-card', upload.single('document'), verifyPANCard);
router.post('/verify-aadhaar-card', upload.single('document'), verifyAadhaarCard);
router.post('/verify-gst-certificate', upload.single('document'), verifyGSTCertificate);
router.post('/verify-document', upload.single('document'), verifyDocument);
router.post('/cleanup', cleanupTempFiles);

module.exports = router;
