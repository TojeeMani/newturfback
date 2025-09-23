const ocrService = require('../services/ocrService');
const asyncHandler = require('../middleware/async');
const ErrorResponse = require('../utils/errorResponse');
const path = require('path');
const fs = require('fs').promises;
const axios = require('axios');
const OwnerDocument = require('../models/OwnerDocument');

// @desc    Extract text from document using OCR
// @route   POST /api/ocr/extract-text
// @access  Private/Admin
exports.extractText = asyncHandler(async (req, res, next) => {
  try {
    const { fileUrl, expectedName, ownerId, documentType = 'other', language = 'eng', preprocess = true } = req.body;

    let tempPath = null;
    let result;

    if (fileUrl) {
      // Download remote file to temp and run OCR
      const response = await axios.get(fileUrl, { responseType: 'arraybuffer' });
      const ext = path.extname(new URL(fileUrl).pathname) || '.jpg';
      tempPath = path.join(__dirname, '../temp/ocr', `from_url_${Date.now()}${ext}`);
      await fs.writeFile(tempPath, Buffer.from(response.data));
      result = await ocrService.extractText(tempPath, { language, preprocess: preprocess === 'true' });
      await ocrService.cleanupFile(tempPath);
    } else if (req.file) {
      if (!ocrService.isSupportedFormat(req.file.filename)) {
        return next(new ErrorResponse('Unsupported file format', 400));
      }
      result = await ocrService.extractText(req.file.path, { language, preprocess: preprocess === 'true' });
      await ocrService.cleanupFile(req.file.path);
    } else {
      return next(new ErrorResponse('No file or fileUrl provided', 400));
    }

    const extractedText = result.text || '';
    const normalizedText = extractedText.toLowerCase();
    const nameMatch = expectedName ? normalizedText.includes(String(expectedName).toLowerCase()) : false;

    // Extract IDs via regex
    const panMatch = (extractedText.toUpperCase().match(/[A-Z]{5}[0-9]{4}[A-Z]{1}/) || [null])[0];
    const aadhaarMatch = (extractedText.replace(/\s/g, '').match(/\b\d{12}\b/) || [null])[0];
    const gstMatch = (extractedText.toUpperCase().match(/\b\d{2}[A-Z]{5}\d{4}[A-Z]{1}[A-Z\d]{1}Z[A-Z\d]{1}\b/) || [null])[0];

    const verified = !!(nameMatch && (panMatch || aadhaarMatch || gstMatch));
    let flaggedReason = '';
    if (!verified) {
      if (!nameMatch) flaggedReason = 'Name not found in document';
      else if (!panMatch && !aadhaarMatch && !gstMatch) flaggedReason = 'No valid ID detected';
    }

    // Save record if ownerId provided
    let documentRecord = null;
    if (ownerId && fileUrl) {
      documentRecord = await OwnerDocument.create({
        ownerId,
        documentType,
        fileUrl,
        extractedText,
        verified,
        flaggedReason,
        nameMatch,
        detected: {
          pan: panMatch,
          aadhaar: aadhaarMatch,
          gst: gstMatch
        }
      });
    }

    res.status(200).json({
      success: true,
      data: {
        extractedText,
        nameMatch,
        verified,
        flaggedReason,
        detected: { pan: panMatch, aadhaar: aadhaarMatch, gst: gstMatch },
        document: documentRecord
      }
    });

  } catch (error) {
    // Clean up uploaded file on error
    if (req.file) {
      await ocrService.cleanupFile(req.file.path);
    }
    next(error);
  }
});

// @desc    Verify business license document
// @route   POST /api/ocr/verify-business-license
// @access  Private/Admin
exports.verifyBusinessLicense = asyncHandler(async (req, res, next) => {
  try {
    if (!req.file) {
      return next(new ErrorResponse('No file uploaded', 400));
    }

    if (!ocrService.isSupportedFormat(req.file.filename)) {
      return next(new ErrorResponse('Unsupported file format', 400));
    }

    const result = await ocrService.verifyBusinessLicense(req.file.path);

    // Clean up uploaded file
    await ocrService.cleanupFile(req.file.path);

    res.status(200).json({
      success: true,
      data: result
    });

  } catch (error) {
    if (req.file) {
      await ocrService.cleanupFile(req.file.path);
    }
    next(error);
  }
});

// @desc    Verify PAN card document
// @route   POST /api/ocr/verify-pan-card
// @access  Private/Admin
exports.verifyPANCard = asyncHandler(async (req, res, next) => {
  try {
    if (!req.file) {
      return next(new ErrorResponse('No file uploaded', 400));
    }

    if (!ocrService.isSupportedFormat(req.file.filename)) {
      return next(new ErrorResponse('Unsupported file format', 400));
    }

    const result = await ocrService.verifyPANCard(req.file.path);

    // Clean up uploaded file
    await ocrService.cleanupFile(req.file.path);

    res.status(200).json({
      success: true,
      data: result
    });

  } catch (error) {
    if (req.file) {
      await ocrService.cleanupFile(req.file.path);
    }
    next(error);
  }
});

// @desc    Verify Aadhaar card document
// @route   POST /api/ocr/verify-aadhaar-card
// @access  Private/Admin
exports.verifyAadhaarCard = asyncHandler(async (req, res, next) => {
  try {
    if (!req.file) {
      return next(new ErrorResponse('No file uploaded', 400));
    }

    if (!ocrService.isSupportedFormat(req.file.filename)) {
      return next(new ErrorResponse('Unsupported file format', 400));
    }

    const result = await ocrService.verifyAadhaarCard(req.file.path);

    // Clean up uploaded file
    await ocrService.cleanupFile(req.file.path);

    res.status(200).json({
      success: true,
      data: result
    });

  } catch (error) {
    if (req.file) {
      await ocrService.cleanupFile(req.file.path);
    }
    next(error);
  }
});

// @desc    Verify GST certificate document
// @route   POST /api/ocr/verify-gst-certificate
// @access  Private/Admin
exports.verifyGSTCertificate = asyncHandler(async (req, res, next) => {
  try {
    if (!req.file) {
      return next(new ErrorResponse('No file uploaded', 400));
    }

    if (!ocrService.isSupportedFormat(req.file.filename)) {
      return next(new ErrorResponse('Unsupported file format', 400));
    }

    const result = await ocrService.verifyGSTCertificate(req.file.path);

    // Clean up uploaded file
    await ocrService.cleanupFile(req.file.path);

    res.status(200).json({
      success: true,
      data: result
    });

  } catch (error) {
    if (req.file) {
      await ocrService.cleanupFile(req.file.path);
    }
    next(error);
  }
});

// @desc    Generic document verification
// @route   POST /api/ocr/verify-document
// @access  Private/Admin
exports.verifyDocument = asyncHandler(async (req, res, next) => {
  try {
    if (!req.file) {
      return next(new ErrorResponse('No file uploaded', 400));
    }

    const { documentType } = req.body;
    
    if (!documentType) {
      return next(new ErrorResponse('Document type is required', 400));
    }

    if (!ocrService.isSupportedFormat(req.file.filename)) {
      return next(new ErrorResponse('Unsupported file format', 400));
    }

    const result = await ocrService.verifyDocument(req.file.path, documentType);

    // Clean up uploaded file
    await ocrService.cleanupFile(req.file.path);

    res.status(200).json({
      success: true,
      data: result
    });

  } catch (error) {
    if (req.file) {
      await ocrService.cleanupFile(req.file.path);
    }
    next(error);
  }
});

// @desc    Get supported file formats
// @route   GET /api/ocr/supported-formats
// @access  Private/Admin
exports.getSupportedFormats = asyncHandler(async (req, res, next) => {
  res.status(200).json({
    success: true,
    data: {
      supportedFormats: ocrService.supportedFormats,
      maxFileSize: '10MB',
      recommendedFormats: ['.jpg', '.png', '.pdf']
    }
  });
});

// @desc    Clean up temporary OCR files
// @route   POST /api/ocr/cleanup
// @access  Private/Admin
exports.cleanupTempFiles = asyncHandler(async (req, res, next) => {
  try {
    await ocrService.cleanupTempFiles();
    
    res.status(200).json({
      success: true,
      message: 'Temporary files cleaned up successfully'
    });
  } catch (error) {
    next(error);
  }
});
