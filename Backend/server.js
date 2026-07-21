const dns = require('dns');
dns.setDefaultResultOrder('ipv4first');

require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const helmet = require('helmet');
const mongoSanitize = require('./middleware/mongoSanitize');
const connectDB = require('./config/db');
const sendEmail = require('./utils/sendEmail');

// ─────────────────────────────────────────────────────────────────
// ENVIRONMENT VARIABLE VALIDATION
// ─────────────────────────────────────────────────────────────────
const requiredEnvVars = [
  'MONGO_URI',
  'JWT_SECRET',
  'CLIENT_URL',
  'RAZORPAY_KEY_ID',
  'RAZORPAY_KEY_SECRET',
  'CLOUDINARY_CLOUD_NAME',
  'CLOUDINARY_API_KEY',
  'CLOUDINARY_API_SECRET'
];

const missingEnvVars = requiredEnvVars.filter(varName => !process.env[varName]);
if (missingEnvVars.length > 0) {
  console.warn(`\n⚠️  [WARN] Missing environment variables: ${missingEnvVars.join(', ')}`);
  console.warn(`👉 Please check your .env file or configuration provider before proceeding.\n`);
  if (process.env.NODE_ENV === 'production') {
    console.error('❌ [FATAL] Missing critical environment variables in production. Exiting application.');
    process.exit(1);
  }
}

// Connect Database
connectDB();

const app = express();

// ─────────────────────────────────────────────────────────────────
// SECURITY & REQUEST PARSING MIDDLEWARE
// ─────────────────────────────────────────────────────────────────

// 1. Body Parser (Must come first to parse JSON bodies)
app.use(express.json());

// 2. Strict CORS Configuration
const allowedOrigins = [
  'https://drivex-mern-stack-project-ui.onrender.com',
  'https://drivex-mern-stack-project-react.onrender.com',
  'http://localhost:5173',
  'http://localhost:3000'
];

if (process.env.CLIENT_URL) {
  const clientUrl = process.env.CLIENT_URL.replace(/\/$/, '');
  if (!allowedOrigins.includes(clientUrl)) {
    allowedOrigins.push(clientUrl);
  }
}

const corsOptions = {
  origin: function (origin, callback) {
    // Allow requests with no origin (like mobile apps, postman, curl)
    if (!origin) return callback(null, true);

    if (allowedOrigins.includes(origin)) {
      return callback(null, true);
    } else {
      const msg = `The CORS policy for this site does not allow access from origin: ${origin}`;
      return callback(new Error(msg), false);
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  optionsSuccessStatus: 200
};

app.use(cors(corsOptions));
app.options(/.*/, cors(corsOptions)); // Handle OPTIONS preflight requests

// 3. HTTP Headers Security (XSS protection, Clickjacking protection, etc.)
app.use(helmet({
  contentSecurityPolicy: false, // Disabled to ensure uploads and local interfaces load easily
  crossOriginResourcePolicy: { policy: "cross-origin" }
}));

// 4. Prevent NoSQL Injection
app.use(mongoSanitize());

// Request logger
app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
  next();
});

// Static assets
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// ─────────────────────────────────────────────────────────────────
// ROUTES
// ─────────────────────────────────────────────────────────────────
app.use('/api/users', require('./routes/userRoutes'));
app.use('/api/vehicles', require('./routes/vehicleRoutes'));
app.use('/api/bookings', require('./routes/bookingRoutes'));
app.use('/api/payments', require('./routes/paymentRoutes'));
app.use('/api/profile', require('./routes/profileRoutes'));
app.use('/api/complaints', require('./routes/complaintRoutes'));
app.use('/api/owner/complaints', require('./routes/ownerComplaintRoutes'));
app.use('/api/admin/complaints', require('./routes/adminComplaintRoutes'));
app.use('/api/refunds', require('./routes/refundRoutes'));
app.use('/api/reviews', require('./routes/reviewRoutes'));
app.use('/api/testimonials', require('./routes/testimonialRoutes'));
app.use('/api/admin/reviews', require('./routes/adminReviewRoutes'));
app.use('/api/audit', require('./routes/auditRoutes'));

// ─────────────────────────────────────────────────────────────────
// HEALTH & DIAGNOSTIC ENDPOINTS
// ─────────────────────────────────────────────────────────────────
app.get('/', (req, res) => {
  res.send('DriveX API is running...');
});

app.get('/health', (req, res) => {
  const mongoose = require('mongoose');
  const dbStatus = mongoose.connection.readyState === 1 ? 'UP' : 'DOWN';

  const healthStatus = {
    status: dbStatus === 'UP' ? 'UP' : 'DEGRADED',
    timestamp: new Date().toISOString(),
    services: {
      database: dbStatus,
      server: 'UP'
    },
    system: {
      uptime: process.uptime(),
      memoryUsage: process.memoryUsage(),
      nodeVersion: process.version,
      platform: process.platform
    }
  };

  const statusCode = healthStatus.status === 'UP' ? 200 : 503;
  res.status(statusCode).json(healthStatus);
});

// ─────────────────────────────────────────────────────────────────
// ERROR HANDLING
// ─────────────────────────────────────────────────────────────────
app.use((err, req, res, next) => {
  console.error('Unhandled Error:', err);
  res.status(500).json({
    success: false,
    message: err.message || 'Internal Server Error',
    stack: process.env.NODE_ENV === 'production' ? undefined : err.stack
  });
});

const PORT = process.env.PORT || 8080;

app.listen(PORT, () => {
  console.log(`Server running in ${process.env.NODE_ENV || 'development'} mode on port ${PORT}`);
  // Verify Nodemailer SMTP connection on startup
  sendEmail.verifyConnection();
});
