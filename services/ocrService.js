const Tesseract = require('tesseract.js');
const sharp = require('sharp');
const fs = require('fs').promises;
const path = require('path');

class OCRService {
  constructor() {
    this.supportedFormats = ['.jpg', '.jpeg', '.png', '.pdf', '.tiff', '.bmp'];
    this.tempDir = path.join(__dirname, '../temp/ocr');
    this.ensureTempDir();
  }

  async ensureTempDir() {
    try {
      await fs.mkdir(this.tempDir, { recursive: true });
    } catch (error) {
      console.error('Error creating temp directory:', error);
    }
  }

  /**
   * Extract text from document using OCR
   * @param {string} imagePath - Path to the document image
   * @param {Object} options - OCR options
   * @returns {Promise<Object>} OCR result with extracted text and confidence
   */
  async extractText(imagePath, options = {}) {
    try {
      const {
        language = 'eng',
        psm = 6, // Page segmentation mode
        oem = 3, // OCR Engine mode
        preprocess = true
      } = options;

      let processedImagePath = imagePath;

      // Preprocess image if requested
      if (preprocess) {
        processedImagePath = await this.preprocessImage(imagePath);
      }

      console.log('🔍 Starting OCR processing...');
      
      const { data } = await Tesseract.recognize(
        processedImagePath,
        language,
        {
          logger: (m) => {
            if (m.status === 'recognizing text') {
              console.log(`OCR Progress: ${Math.round(m.progress * 100)}%`);
            }
          },
          tessedit_pageseg_mode: psm,
          tessedit_ocr_engine_mode: oem,
        }
      );

      // Clean up processed image if it was created
      if (processedImagePath !== imagePath) {
        await this.cleanupFile(processedImagePath);
      }

      return {
        success: true,
        text: data.text.trim(),
        confidence: data.confidence,
        words: data.words,
        lines: data.lines,
        blocks: data.blocks
      };

    } catch (error) {
      console.error('OCR Error:', error);
      return {
        success: false,
        error: error.message,
        text: '',
        confidence: 0
      };
    }
  }

  /**
   * Preprocess image for better OCR results
   * @param {string} imagePath - Path to the original image
   * @returns {Promise<string>} Path to processed image
   */
  async preprocessImage(imagePath) {
    try {
      const processedPath = path.join(this.tempDir, `processed_${Date.now()}.png`);
      
      await sharp(imagePath)
        .resize(2000, 2000, { 
          fit: 'inside',
          withoutEnlargement: true 
        })
        .grayscale()
        .normalize()
        .sharpen()
        .png({ quality: 100 })
        .toFile(processedPath);

      return processedPath;
    } catch (error) {
      console.error('Image preprocessing error:', error);
      return imagePath; // Return original if preprocessing fails
    }
  }

  /**
   * Verify business license document
   * @param {string} imagePath - Path to the document image
   * @returns {Promise<Object>} Verification result
   */
  async verifyBusinessLicense(imagePath) {
    try {
      const ocrResult = await this.extractText(imagePath, {
        language: 'eng',
        psm: 6
      });

      if (!ocrResult.success) {
        return {
          success: false,
          error: ocrResult.error,
          verification: null
        };
      }

      const text = ocrResult.text.toLowerCase();
      
      // Keywords to look for in business license
      const licenseKeywords = [
        'business license',
        'trade license',
        'commercial license',
        'permit',
        'registration',
        'license number',
        'license no',
        'valid from',
        'valid to',
        'expiry',
        'expires',
        'issued by',
        'municipal corporation',
        'panchayat',
        'government'
      ];

      const foundKeywords = licenseKeywords.filter(keyword => 
        text.includes(keyword)
      );

      // Extract license number (common patterns)
      const licenseNumberPatterns = [
        /license\s*(?:no|number)?\s*:?\s*([a-z0-9\-\/]+)/i,
        /permit\s*(?:no|number)?\s*:?\s*([a-z0-9\-\/]+)/i,
        /registration\s*(?:no|number)?\s*:?\s*([a-z0-9\-\/]+)/i
      ];

      let licenseNumber = null;
      for (const pattern of licenseNumberPatterns) {
        const match = text.match(pattern);
        if (match) {
          licenseNumber = match[1];
          break;
        }
      }

      // Extract dates
      const datePatterns = [
        /(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4})/g,
        /(\d{1,2}\s+(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)\w*\s+\d{2,4})/gi
      ];

      const dates = [];
      for (const pattern of datePatterns) {
        const matches = text.match(pattern);
        if (matches) {
          dates.push(...matches);
        }
      }

      const verification = {
        isBusinessLicense: foundKeywords.length >= 3,
        confidence: ocrResult.confidence,
        foundKeywords,
        licenseNumber,
        dates,
        extractedText: ocrResult.text,
        verificationScore: this.calculateVerificationScore(foundKeywords.length, ocrResult.confidence)
      };

      return {
        success: true,
        verification
      };

    } catch (error) {
      console.error('Business license verification error:', error);
      return {
        success: false,
        error: error.message,
        verification: null
      };
    }
  }

  /**
   * Verify PAN card document
   * @param {string} imagePath - Path to the document image
   * @returns {Promise<Object>} Verification result
   */
  async verifyPANCard(imagePath) {
    try {
      const ocrResult = await this.extractText(imagePath, {
        language: 'eng',
        psm: 6
      });

      if (!ocrResult.success) {
        return {
          success: false,
          error: ocrResult.error,
          verification: null
        };
      }

      const text = ocrResult.text.toUpperCase();
      
      // PAN number pattern: 5 letters + 4 digits + 1 letter
      const panPattern = /[A-Z]{5}[0-9]{4}[A-Z]{1}/;
      const panMatch = text.match(panPattern);

      // PAN card keywords
      const panKeywords = [
        'INCOME TAX DEPARTMENT',
        'GOVT. OF INDIA',
        'PERMANENT ACCOUNT NUMBER',
        'PAN',
        'SIGNATURE',
        'PHOTO'
      ];

      const foundKeywords = panKeywords.filter(keyword => 
        text.includes(keyword)
      );

      const verification = {
        isPANCard: panMatch !== null && foundKeywords.length >= 2,
        confidence: ocrResult.confidence,
        panNumber: panMatch ? panMatch[0] : null,
        foundKeywords,
        extractedText: ocrResult.text,
        verificationScore: this.calculateVerificationScore(
          foundKeywords.length + (panMatch ? 1 : 0), 
          ocrResult.confidence
        )
      };

      return {
        success: true,
        verification
      };

    } catch (error) {
      console.error('PAN card verification error:', error);
      return {
        success: false,
        error: error.message,
        verification: null
      };
    }
  }

  /**
   * Verify Aadhaar card document
   * @param {string} imagePath - Path to the document image
   * @returns {Promise<Object>} Verification result
   */
  async verifyAadhaarCard(imagePath) {
    try {
      const ocrResult = await this.extractText(imagePath, {
        language: 'eng',
        psm: 6
      });

      if (!ocrResult.success) {
        return {
          success: false,
          error: ocrResult.error,
          verification: null
        };
      }

      const text = ocrResult.text.toUpperCase();
      
      // Aadhaar number pattern: 4 digits + 4 digits + 4 digits
      const aadhaarPattern = /\b\d{4}\s?\d{4}\s?\d{4}\b/;
      const aadhaarMatch = text.match(aadhaarPattern);

      // Aadhaar card keywords
      const aadhaarKeywords = [
        'GOVERNMENT OF INDIA',
        'UNIQUE IDENTIFICATION AUTHORITY OF INDIA',
        'AADHAAR',
        'UIDAI',
        'DOB',
        'DATE OF BIRTH',
        'GENDER',
        'MALE',
        'FEMALE'
      ];

      const foundKeywords = aadhaarKeywords.filter(keyword => 
        text.includes(keyword)
      );

      const verification = {
        isAadhaarCard: aadhaarMatch !== null && foundKeywords.length >= 3,
        confidence: ocrResult.confidence,
        aadhaarNumber: aadhaarMatch ? aadhaarMatch[0].replace(/\s/g, '') : null,
        foundKeywords,
        extractedText: ocrResult.text,
        verificationScore: this.calculateVerificationScore(
          foundKeywords.length + (aadhaarMatch ? 1 : 0), 
          ocrResult.confidence
        )
      };

      return {
        success: true,
        verification
      };

    } catch (error) {
      console.error('Aadhaar card verification error:', error);
      return {
        success: false,
        error: error.message,
        verification: null
      };
    }
  }

  /**
   * Verify GST certificate document
   * @param {string} imagePath - Path to the document image
   * @returns {Promise<Object>} Verification result
   */
  async verifyGSTCertificate(imagePath) {
    try {
      const ocrResult = await this.extractText(imagePath, {
        language: 'eng',
        psm: 6
      });

      if (!ocrResult.success) {
        return {
          success: false,
          error: ocrResult.error,
          verification: null
        };
      }

      const text = ocrResult.text.toUpperCase();
      
      // GST number pattern: 2 letters + 10 digits + 1 letter + 1 digit
      const gstPattern = /\b\d{2}[A-Z]{5}\d{4}[A-Z]{1}[A-Z\d]{1}[Z]{1}[A-Z\d]{1}\b/;
      const gstMatch = text.match(gstPattern);

      // GST certificate keywords
      const gstKeywords = [
        'GOODS AND SERVICES TAX',
        'GST',
        'CERTIFICATE OF REGISTRATION',
        'GSTIN',
        'TAXPAYER',
        'BUSINESS',
        'REGISTRATION',
        'VALID FROM',
        'VALID TO'
      ];

      const foundKeywords = gstKeywords.filter(keyword => 
        text.includes(keyword)
      );

      const verification = {
        isGSTCertificate: gstMatch !== null && foundKeywords.length >= 3,
        confidence: ocrResult.confidence,
        gstNumber: gstMatch ? gstMatch[0] : null,
        foundKeywords,
        extractedText: ocrResult.text,
        verificationScore: this.calculateVerificationScore(
          foundKeywords.length + (gstMatch ? 1 : 0), 
          ocrResult.confidence
        )
      };

      return {
        success: true,
        verification
      };

    } catch (error) {
      console.error('GST certificate verification error:', error);
      return {
        success: false,
        error: error.message,
        verification: null
      };
    }
  }

  /**
   * Generic document verification
   * @param {string} imagePath - Path to the document image
   * @param {string} documentType - Type of document to verify
   * @returns {Promise<Object>} Verification result
   */
  async verifyDocument(imagePath, documentType) {
    try {
      switch (documentType.toLowerCase()) {
        case 'business_license':
        case 'trade_license':
          return await this.verifyBusinessLicense(imagePath);
        
        case 'pan_card':
        case 'pan':
          return await this.verifyPANCard(imagePath);
        
        case 'aadhaar_card':
        case 'aadhaar':
          return await this.verifyAadhaarCard(imagePath);
        
        case 'gst_certificate':
        case 'gst':
          return await this.verifyGSTCertificate(imagePath);
        
        default:
          // Generic verification
          const ocrResult = await this.extractText(imagePath);
          return {
            success: ocrResult.success,
            verification: {
              documentType: 'unknown',
              confidence: ocrResult.confidence,
              extractedText: ocrResult.text,
              verificationScore: ocrResult.confidence / 100
            }
          };
      }
    } catch (error) {
      console.error('Document verification error:', error);
      return {
        success: false,
        error: error.message,
        verification: null
      };
    }
  }

  /**
   * Calculate verification score based on keywords and confidence
   * @param {number} keywordCount - Number of keywords found
   * @param {number} confidence - OCR confidence score
   * @returns {number} Verification score (0-1)
   */
  calculateVerificationScore(keywordCount, confidence) {
    const keywordScore = Math.min(keywordCount / 5, 1); // Max 5 keywords
    const confidenceScore = confidence / 100;
    return (keywordScore * 0.6) + (confidenceScore * 0.4);
  }

  /**
   * Clean up temporary files
   * @param {string} filePath - Path to file to delete
   */
  async cleanupFile(filePath) {
    try {
      await fs.unlink(filePath);
    } catch (error) {
      console.error('Error cleaning up file:', error);
    }
  }

  /**
   * Clean up all temporary files in OCR directory
   */
  async cleanupTempFiles() {
    try {
      const files = await fs.readdir(this.tempDir);
      const deletePromises = files.map(file => 
        fs.unlink(path.join(this.tempDir, file))
      );
      await Promise.all(deletePromises);
    } catch (error) {
      console.error('Error cleaning up temp files:', error);
    }
  }

  /**
   * Check if file format is supported
   * @param {string} filename - Name of the file
   * @returns {boolean} Whether format is supported
   */
  isSupportedFormat(filename) {
    const ext = path.extname(filename).toLowerCase();
    return this.supportedFormats.includes(ext);
  }
}

module.exports = new OCRService();
