const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');
require('dotenv').config();

// Import routes
const authRoutes = require('./routes/auth');
const userRoutes = require('./routes/users');
const turfRoutes = require('./routes/turfs');
const bookingRoutes = require('./routes/bookings');
const matchRoutes = require('./routes/matches');
const adminRoutes = require('./routes/admin');
const uploadRoutes = require('./routes/upload');
const chatRoutes = require('./routes/chat');

// Import middleware
const errorHandler = require('./middleware/errorHandler');
const Booking = require('./models/Booking');
const Match = require('./models/Match');


app.set("trust proxy", 1);
const express = require('express');
const cors = require('cors');

const app = express();

// Enable CORS for your Vercel frontend
app.use(cors({
  origin: 'https://newturffront.vercel.app',
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  credentials: true // if using cookies
}));

app.use(express.json());

// Routes
app.get('/api/matches', (req, res) => {
  // your matches logic
});

app.get('/api/turfs', (req, res) => {
  // your turfs logic
});

app.listen(process.env.PORT || 3000, () => console.log('Server running'));



// Security middleware with Firebase-compatible settings
app.use(helmet({
  crossOriginOpenerPolicy: false, // Disable COOP to allow Firebase popup auth
  crossOriginEmbedderPolicy: false, // Disable COEP to allow Firebase popup auth
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'", "https:"],
      scriptSrc: ["'self'"],
      imgSrc: ["'self'", "data:", "https:"],
      connectSrc: ["'self'", "https://securetoken.googleapis.com", "https://identitytoolkit.googleapis.com"],
      frameSrc: ["'self'", "https://*.firebaseapp.com", "https://*.google.com"],
    },
  },
}));
app.use(compression());

// Rate limiting - more lenient in development
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: process.env.NODE_ENV === 'development' ? 1000 : 100, // Higher limit for development
  message: 'Too many requests from this IP, please try again later.'
});

// Rate limiting for OTP requests (more restrictive)
const otpLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: process.env.NODE_ENV === 'development' ? 50 : 5, // Higher limit for development
  message: 'Too many OTP requests from this IP, please try again later.',
  skipSuccessfulRequests: true
});

// Only apply rate limiting in production
if (process.env.NODE_ENV === 'production') {
  app.use('/api/', limiter);
}

// Body parsing middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// CORS configuration
app.use(cors({
  origin: ['http://localhost:3000', 'https://newturffront.vercel.app/'],
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

// Logging middleware
if (process.env.NODE_ENV === 'development') {
  app.use(morgan('dev'));
}

// Health check endpoint
app.get('/health', (req, res) => {
  res.status(200).json({
    status: 'success',
    message: 'TurfEase API is running',
    timestamp: new Date().toISOString()
  });
});

// API routes
app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/turfs', turfRoutes);
app.use('/api/bookings', bookingRoutes);
app.use('/api/matches', matchRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/upload', uploadRoutes);
app.use('/api/chat', chatRoutes);

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({
    status: 'error',
    message: `Route ${req.originalUrl} not found`
  });
});

// Error handling middleware
app.use(errorHandler);

// Database connection
const connectDB = async () => {
  try {
    // Use default MongoDB URI if environment variable is not set
    const mongoURI = process.env.NODE_ENV === 'production' 
      ? (process.env.MONGODB_URI_PROD || 'mongodb://localhost:27017/turfease')
      : (process.env.MONGODB_URI || 'mongodb://localhost:27017/turfease');
    
    console.log('Connecting to MongoDB...');
    const conn = await mongoose.connect(mongoURI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });
    console.log(`MongoDB Connected: ${conn.connection.host}`);
  } catch (error) {
    console.error('Database connection error:', error.message);
    console.log('Please make sure MongoDB is running or set up your environment variables.');
    console.log('You can create a .env file in the backend directory with your configuration.');
    process.exit(1);
  }
};

// Start server
const PORT = process.env.PORT || 5001;

const startServer = async () => {
  await connectDB();
  app.listen(PORT, () => {
    console.log(`Server running in ${process.env.NODE_ENV} mode on port ${PORT}`);
    console.log(`Health check: http://localhost:${PORT}/health`);
  });
};

startServer();

// Handle unhandled promise rejections
process.on('unhandledRejection', (err, promise) => {
  console.log(`Error: ${err.message}`);
  // Close server & exit process
  process.exit(1);
}); 

// Auto-complete bookings: runs every 5 minutes
setInterval(async () => {
  try {
    const now = new Date();
    const candidates = await Booking.find({ status: { $in: ['confirmed', 'in_progress'] } });
    let updated = 0;
    for (const b of candidates) {
      const end = new Date(b.bookingDate);
      const [eh, em] = (b.endTime || '00:00').split(':');
      end.setHours(parseInt(eh || '0'), parseInt(em || '0'), 0, 0);
      const start = new Date(b.bookingDate);
      const [sh, sm] = (b.startTime || '00:00').split(':');
      start.setHours(parseInt(sh || '0'), parseInt(sm || '0'), 0, 0);
      if (start <= now && end > now && b.status !== 'in_progress') {
        b.status = 'in_progress';
        await b.save();
        updated++;
      } else if (end < now && b.status !== 'completed') {
        b.status = 'completed';
        await b.save();
        updated++;
        // Send thank-you email with review link (best-effort)
        if (!b.reviewEmailSent) {
          try {
            const { sendEmail } = require('./utils/emailService');
            const baseUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
            const reviewUrl = `${baseUrl}/turfs/${b.turfId?.toString()}?review=1`;
            await sendEmail({
              email: b.customerInfo?.email || '',
              subject: 'Thanks for playing! Rate your turf',
              html: `<div style="font-family:system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;background:#f9fafb;padding:20px">
                <div style="max-width:640px;margin:0 auto;background:#fff;border:1px solid #e5e7eb;border-radius:12px;overflow:hidden">
                  <div style="background:#10b981;color:#fff;padding:16px 20px;font-weight:700">TurfEase</div>
                  <div style="padding:20px;color:#111827;">
                    <h2 style="margin:0 0 10px 0;font-size:18px">Thank you for your booking</h2>
                    <p style="margin:0 0 12px 0;color:#4b5563">We hope you enjoyed your session. Please take a moment to rate the turf and share your feedback.</p>
                    <a href="${reviewUrl}" style="display:inline-block;background:#10b981;color:#fff;text-decoration:none;padding:10px 16px;border-radius:10px;font-weight:600">Rate & Review</a>
                  </div>
                </div>
              </div>`,
              text: `Thanks for your booking. Please rate your turf: ${reviewUrl}`
            });
            b.reviewEmailSent = true;
            await b.save();
          } catch (e) {
            // Non-fatal
          }
        }
      }
    }
    if (updated) console.log(`Auto-status updates applied to ${updated} bookings`);
  } catch (e) {
    console.warn('Auto-complete error:', e.message);
  }
}, 5 * 60 * 1000);

// Auto-transition matches: runs every 1 minute
setInterval(async () => {
  try {
    const now = new Date();
    const candidates = await Match.find({ status: { $in: ['scheduled', 'live'] } });
    let updated = 0;
    for (const m of candidates) {
      if (m.startTime <= now && m.endTime > now && m.status !== 'live') {
        m.status = 'live';
        await m.save();
        updated++;
      } else if (m.endTime <= now && m.status !== 'completed') {
        m.status = 'completed';
        await m.save();
        updated++;
      }
    }
    if (updated) console.log(`Auto-status updates applied to ${updated} matches`);
  } catch (e) {
    console.warn('Match auto-status error:', e.message);
  }
}, 60 * 1000);