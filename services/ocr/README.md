# OCR Service for Document Verification

This folder contains the OCR (Optical Character Recognition) service implementation for verifying turf owner documents.

## 📁 Folder Structure

```
ocr/
├── services/
│   └── ocrService.js          # Main OCR service implementation
├── controllers/
│   └── ocrController.js       # OCR API endpoints
├── routes/
│   └── ocr.js                 # OCR routes configuration
└── README.md                  # This file
```

## 🚀 Features

### Document Types Supported
- **Business License** - Verifies trade/commercial licenses
- **PAN Card** - Validates Permanent Account Number cards
- **Aadhaar Card** - Verifies Unique Identification Authority cards
- **GST Certificate** - Validates Goods and Services Tax certificates

### OCR Capabilities
- Text extraction from images and PDFs
- Document type detection and validation
- Keyword-based verification
- Pattern matching for document numbers
- Confidence scoring
- Image preprocessing for better accuracy

### File Formats Supported
- JPEG/JPG
- PNG
- PDF
- TIFF
- BMP

## 🔧 Installation

### Backend Dependencies
```bash
npm install tesseract.js sharp multer
```

### Frontend Dependencies
```bash
npm install @heroicons/react framer-motion
```

## 📡 API Endpoints

### Base URL: `/api/ocr`

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/extract-text` | POST | Extract text from any document |
| `/verify-business-license` | POST | Verify business license document |
| `/verify-pan-card` | POST | Verify PAN card document |
| `/verify-aadhaar-card` | POST | Verify Aadhaar card document |
| `/verify-gst-certificate` | POST | Verify GST certificate document |
| `/verify-document` | POST | Generic document verification |
| `/supported-formats` | GET | Get supported file formats |
| `/cleanup` | POST | Clean up temporary files |

## 🔒 Authentication

All OCR endpoints require:
- Valid JWT token
- Admin role authorization

## 📝 Usage Examples

### Backend Usage

```javascript
const ocrService = require('./services/ocrService');

// Verify a business license
const result = await ocrService.verifyBusinessLicense('/path/to/document.jpg');
console.log(result.verification.isBusinessLicense);
console.log(result.verification.licenseNumber);
```

### Frontend Usage

```javascript
import ocrService from '../services/ocrService';

// Verify uploaded document
const file = document.getElementById('fileInput').files[0];
const result = await ocrService.verifyBusinessLicense(file);

if (result.success) {
  console.log('Verification score:', result.data.verification.verificationScore);
}
```

## 🎯 Verification Process

1. **File Upload** - Document is uploaded via multipart form data
2. **Preprocessing** - Image is enhanced for better OCR accuracy
3. **Text Extraction** - Tesseract.js extracts text from the document
4. **Pattern Matching** - Document-specific patterns are searched
5. **Keyword Detection** - Relevant keywords are identified
6. **Scoring** - Verification score is calculated (0-1)
7. **Result** - Structured verification result is returned

## 📊 Verification Scoring

The verification score is calculated based on:
- **Keyword Count** (60% weight) - Number of relevant keywords found
- **OCR Confidence** (40% weight) - Tesseract confidence score

### Score Interpretation
- **0.8-1.0**: Verified ✅
- **0.6-0.8**: Likely Valid ⚠️
- **0.4-0.6**: Uncertain ❓
- **0.0-0.4**: Invalid ❌

## 🔍 Document-Specific Patterns

### Business License
- Keywords: "business license", "trade license", "permit", "registration"
- Patterns: License number formats
- Dates: Validity periods

### PAN Card
- Keywords: "INCOME TAX DEPARTMENT", "GOVT. OF INDIA", "PAN"
- Pattern: `[A-Z]{5}[0-9]{4}[A-Z]{1}`

### Aadhaar Card
- Keywords: "GOVERNMENT OF INDIA", "UIDAI", "AADHAAR"
- Pattern: `\d{4}\s?\d{4}\s?\d{4}`

### GST Certificate
- Keywords: "GOODS AND SERVICES TAX", "GST", "CERTIFICATE"
- Pattern: `\d{2}[A-Z]{5}\d{4}[A-Z]{1}[A-Z\d]{1}[Z]{1}[A-Z\d]{1}`

## ⚙️ Configuration

### Environment Variables
```env
# OCR Configuration
OCR_TEMP_DIR=temp/ocr
OCR_MAX_FILE_SIZE=10485760  # 10MB
OCR_SUPPORTED_FORMATS=jpg,jpeg,png,pdf,tiff,bmp
```

### Tesseract Configuration
- **Language**: English (eng)
- **PSM**: 6 (Uniform block of text)
- **OEM**: 3 (Default OCR Engine Mode)

## 🛠️ Error Handling

The service includes comprehensive error handling for:
- Unsupported file formats
- File size limits
- OCR processing failures
- Network timeouts
- Invalid document types

## 🧹 Cleanup

Temporary files are automatically cleaned up after processing. You can also manually trigger cleanup:

```javascript
await ocrService.cleanupTempFiles();
```

## 📈 Performance Considerations

- **File Size**: Larger files take longer to process
- **Image Quality**: Higher resolution images yield better results
- **Preprocessing**: Enabled by default for better accuracy
- **Caching**: Consider implementing caching for repeated verifications

## 🔐 Security Notes

- All uploaded files are processed in a temporary directory
- Files are automatically deleted after processing
- Admin authentication is required for all operations
- File type validation prevents malicious uploads

## 🐛 Troubleshooting

### Common Issues

1. **Low OCR Confidence**
   - Ensure image quality is good
   - Try different preprocessing options
   - Check if document is properly oriented

2. **Missing Keywords**
   - Verify document type is correct
   - Check if document is complete
   - Ensure text is clearly visible

3. **File Upload Errors**
   - Check file format is supported
   - Verify file size is under limit
   - Ensure proper authentication

## 📚 Dependencies

- **tesseract.js**: OCR engine
- **sharp**: Image processing
- **multer**: File upload handling
- **express**: Web framework
- **mongoose**: Database integration

## 🤝 Contributing

When adding new document types:
1. Add verification method to `ocrService.js`
2. Create corresponding controller endpoint
3. Add route configuration
4. Update frontend service
5. Add tests and documentation

## 📄 License

This OCR service is part of the TurfEase platform and follows the same licensing terms.
