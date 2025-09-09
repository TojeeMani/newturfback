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
const adminRoutes = require('./routes/admin');
const uploadRoutes = require('./routes/upload');
const chatRoutes = require('./routes/chat');

// Import middleware
const errorHandler = require('./middleware/errorHandler');
const Booking = require('./models/Booking');

const app = express();

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
  origin: ['http://localhost:3000', 'http://localhost:3001'],
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
      }
    }
    if (updated) console.log(`Auto-status updates applied to ${updated} bookings`);
  } catch (e) {
    console.warn('Auto-complete error:', e.message);
  }
}, 5 * 60 * 1000);