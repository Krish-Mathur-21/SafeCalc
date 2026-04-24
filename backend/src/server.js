require('dotenv').config({ override: true });

const http = require('http');
const express = require('express');
const cors = require('cors');
const morgan = require('morgan');
const {
  signUpWithPhone,
  getUserProfile,
  upsertUserProfile,
  isValidPhone,
  listTransactions,
  addCredit,
  addDebit,
  getSummary,
} = require('./store');
const { sendPhoneOtp, verifyPhoneOtp } = require('./otpAuth');

const app = express();
const PORT = process.env.PORT || 4000;
const HOST = process.env.HOST || '0.0.0.0';

function log(mode, message) {
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] [SERVER] [${mode.toUpperCase()}] ${message}`);
}

function validateEnvironment() {
  const required = ['BACKEND_AES_KEY'];
  const missing = required.filter(key => !process.env[key]);
  
  if (missing.length > 0) {
    log('error', `Missing required environment variables: ${missing.join(', ')}`);
    log('error', 'Please set these in backend/.env file');
    process.exit(1);
  }
  
  const aesKey = process.env.BACKEND_AES_KEY;
  if (aesKey.length < 16) {
    log('error', 'BACKEND_AES_KEY must be at least 16 characters long');
    process.exit(1);
  }
  
  log('info', `Environment validation passed`);
  log('info', `Supabase enabled: ${Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY)}`);
  log('info', `OTP enabled: ${Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_PUBLISHABLE_KEY)}`);
}

function gracefulShutdown(server) {
  log('info', 'Received shutdown signal, closing server gracefully...');
  
  server.close((err) => {
    if (err) {
      log('error', `Error during server shutdown: ${err.message}`);
      process.exit(1);
    }
    
    log('info', 'Server closed successfully');
    process.exit(0);
  });
  
  // Force shutdown after 10 seconds
  setTimeout(() => {
    log('error', 'Forced shutdown after timeout');
    process.exit(1);
  }, 10000);
}

// Validate environment on startup
validateEnvironment();

app.use(cors());
app.use(express.json());
app.use(morgan('dev'));

app.get('/', (_req, res) => {
  res.json({
    ok: true,
    service: 'safecalc-backend',
    message: 'Backend is running. Use /health or /api/* endpoints.',
  });
});

app.get('/health', (_req, res) => {
  res.json({ ok: true, service: 'safecalc-backend', time: new Date().toISOString() });
});

app.post('/api/auth/otp/send', async (req, res) => {
  const { phone } = req.body || {};
  if (!isValidPhone(phone)) {
    return res.status(400).json({
      success: false,
      error: 'INVALID_PHONE',
      message: 'Provide a valid phone number.'
    });
  }

  const result = await sendPhoneOtp(phone);
  if (result.error === 'OTP_NOT_CONFIGURED') {
    return res.status(500).json({
      success: false,
      error: result.error,
      message: result.message
    });
  }
  if (result.error) {
    return res.status(400).json({
      success: false,
      error: result.error,
      message: result.message
    });
  }
  
  return res.status(200).json({
    success: true,
    mode: result.mode,
    message: result.message,
    ...(result.token && { token: result.token })
  });
});

app.post('/api/auth/otp/verify', async (req, res) => {
  const { phone, token, name } = req.body || {};

  if (!isValidPhone(phone)) {
    return res.status(400).json({
      success: false,
      error: 'INVALID_PHONE',
      message: 'Provide a valid phone number.'
    });
  }
  if (!token || String(token).trim().length < 4) {
    return res.status(400).json({
      success: false,
      error: 'INVALID_TOKEN',
      message: 'OTP token is required.'
    });
  }

  const verify = await verifyPhoneOtp(phone, String(token).trim());
  if (verify.error === 'OTP_NOT_CONFIGURED') {
    return res.status(500).json({
      success: false,
      error: verify.error,
      message: verify.message
    });
  }
  if (verify.error) {
    return res.status(400).json({
      success: false,
      error: verify.error,
      message: verify.message
    });
  }

  const signup = await signUpWithPhone({ phone, name: name || 'New User' });
  if (!signup.success) {
    return res.status(400).json({
      success: false,
      error: signup.error,
      message: signup.message
    });
  }

  return res.status(200).json({
    success: true,
    mode: verify.mode,
    session: verify.session,
    user: verify.user,
    account: {
      phone: signup.phone,
      profile: signup.profile
    }
  });
});

app.post('/api/auth/signup', async (req, res) => {
  const { phone, name } = req.body || {};
  if (!isValidPhone(phone)) {
    return res.status(400).json({
      success: false,
      error: 'INVALID_PHONE',
      message: 'Provide a valid phone number.'
    });
  }

  const result = await signUpWithPhone({ phone, name });
  if (!result.success) {
    return res.status(400).json({
      success: false,
      error: result.error,
      message: result.message
    });
  }
  
  return res.status(201).json({
    success: true,
    mode: result.mode,
    phone: result.phone,
    profile: result.profile
  });
});

app.get('/api/profile/:phone', async (req, res) => {
  const { phone } = req.params;
  if (!isValidPhone(phone)) {
    return res.status(400).json({
      success: false,
      error: 'INVALID_PHONE',
      message: 'Provide a valid phone number.'
    });
  }

  const result = await getUserProfile({ phone });
  if (!result.success) {
    if (result.error === 'NOT_FOUND') {
      return res.status(404).json({
        success: false,
        error: result.error,
        message: result.message
      });
    }
    return res.status(400).json({
      success: false,
      error: result.error,
      message: result.message
    });
  }
  
  return res.json({
    success: true,
    mode: result.mode,
    phone: result.phone,
    profile: result.profile
  });
});

app.put('/api/profile/:phone', async (req, res) => {
  const { phone } = req.params;
  const { profile } = req.body || {};

  if (!isValidPhone(phone)) {
    return res.status(400).json({
      success: false,
      error: 'INVALID_PHONE',
      message: 'Provide a valid phone number.'
    });
  }
  if (!profile || typeof profile !== 'object') {
    return res.status(400).json({
      success: false,
      error: 'INVALID_PROFILE',
      message: 'profile must be an object'
    });
  }

  const result = await upsertUserProfile({ phone, profile });
  if (!result.success) {
    return res.status(400).json({
      success: false,
      error: result.error,
      message: result.message
    });
  }
  
  return res.json({
    success: true,
    mode: result.mode,
    phone: result.phone,
    profile: result.profile
  });
});

app.get('/api/account/summary', async (req, res) => {
  const phone = req.query.phone;
  if (phone && !isValidPhone(phone)) {
    return res.status(400).json({
      success: false,
      error: 'INVALID_PHONE',
      message: 'Provide a valid phone number.'
    });
  }
  
  const summary = await getSummary({ phone });
  if (!summary.success) {
    if (summary.error === 'NOT_FOUND') {
      return res.status(404).json({
        success: false,
        error: summary.error,
        message: summary.message
      });
    }
    return res.status(400).json({
      success: false,
      error: summary.error,
      message: summary.message
    });
  }
  
  res.json({
    success: true,
    mode: summary.mode,
    accountId: summary.accountId,
    phone: summary.phone,
    currency: summary.currency,
    openingBalance: summary.openingBalance,
    balance: summary.balance,
    totalCredited: summary.totalCredited,
    totalDebited: summary.totalDebited,
    transactionCount: summary.transactionCount
  });
});

app.get('/api/transactions', async (req, res) => {
  const limit = req.query.limit ? Number(req.query.limit) : undefined;
  const type = req.query.type;
  const category = req.query.category;
  const phone = req.query.phone;

  if (phone && !isValidPhone(phone)) {
    return res.status(400).json({
      success: false,
      error: 'INVALID_PHONE',
      message: 'Provide a valid phone number.'
    });
  }

  if (type && type !== 'credit' && type !== 'debit') {
    return res.status(400).json({
      success: false,
      error: 'INVALID_TYPE',
      message: 'type must be credit or debit'
    });
  }

  const result = await listTransactions({ phone, limit, type, category });
  if (!result.success) {
    return res.status(400).json({
      success: false,
      error: result.error,
      message: result.message
    });
  }
  
  return res.json({
    success: true,
    mode: result.mode,
    transactions: result.transactions
  });
});

app.post('/api/transactions/credit', async (req, res) => {
  const { phone, amount, category, note } = req.body || {};

  if (typeof amount !== 'number' || !Number.isFinite(amount) || amount <= 0) {
    return res.status(400).json({
      success: false,
      error: 'INVALID_AMOUNT',
      message: 'amount must be a positive number'
    });
  }
  if (!isValidPhone(phone)) {
    return res.status(400).json({
      success: false,
      error: 'INVALID_PHONE',
      message: 'Provide a valid phone number.'
    });
  }

  const result = await addCredit({ phone, amount, category, note });
  if (!result.success) {
    return res.status(400).json({
      success: false,
      error: result.error,
      message: result.message
    });
  }
  
  return res.status(201).json({
    success: true,
    mode: result.mode,
    transaction: result.transaction,
    summary: result.summary
  });
});

app.post('/api/transactions/debit', async (req, res) => {
  const { phone, amount, category, note } = req.body || {};

  if (typeof amount !== 'number' || !Number.isFinite(amount) || amount <= 0) {
    return res.status(400).json({
      success: false,
      error: 'INVALID_AMOUNT',
      message: 'amount must be a positive number'
    });
  }
  if (!isValidPhone(phone)) {
    return res.status(400).json({
      success: false,
      error: 'INVALID_PHONE',
      message: 'Provide a valid phone number.'
    });
  }

  const result = await addDebit({ phone, amount, category, note });

  if (!result.success) {
    if (result.error === 'INSUFFICIENT_FUNDS') {
      return res.status(409).json({
        success: false,
        error: result.error,
        message: result.message,
        summary: result.summary
      });
    }
    return res.status(400).json({
      success: false,
      error: result.error,
      message: result.message
    });
  }

  return res.status(201).json({
    success: true,
    mode: result.mode,
    transaction: result.transaction,
    summary: result.summary
  });
});

function checkExistingSafeCalcServer(port) {
  return new Promise((resolve) => {
    const req = http.get(
      {
        host: '127.0.0.1',
        port,
        path: '/health',
        timeout: 1500,
      },
      (res) => {
        let body = '';
        res.setEncoding('utf8');
        res.on('data', (chunk) => {
          body += chunk;
        });
        res.on('end', () => {
          try {
            const parsed = JSON.parse(body);
            resolve(Boolean(parsed && parsed.ok && parsed.service === 'safecalc-backend'));
          } catch {
            resolve(false);
          }
        });
      }
    );

    req.on('timeout', () => {
      req.destroy();
      resolve(false);
    });

    req.on('error', () => resolve(false));
  });
}

const server = app.listen(PORT, HOST, () => {
  const hostLabel = HOST === '0.0.0.0' ? 'all interfaces (0.0.0.0)' : HOST;
  log('info', `SafeCalc backend started successfully on http://${hostLabel}:${PORT}`);
  if (HOST === '0.0.0.0') {
    log('info', `For local machine use: http://localhost:${PORT}`);
    log('info', 'For physical device use your computer LAN IP, e.g. http://192.168.1.23:4000');
  }
  log('info', 'Health endpoint available at /health');
  log('info', 'API endpoints available at /api/*');
});

server.on('error', async (error) => {
  if (error && error.code === 'EADDRINUSE') {
    const alreadyRunning = await checkExistingSafeCalcServer(PORT);
    if (alreadyRunning) {
      log('info', `SafeCalc backend is already running on http://localhost:${PORT}`);
      process.exit(0);
      return;
    }

    log('error', `Port ${PORT} is already in use by another process`);
    log('error', 'Solutions:');
    log('error', `1. Set a different port in backend/.env: PORT=4001`);
    log('error', `2. Stop the process using port ${PORT}`);
    log('error', `3. Run: netstat -ano | findstr :${PORT} (Windows) to find the process`);
    process.exit(1);
    return;
  }

  log('error', `Failed to start backend server: ${error.message}`);
  process.exit(1);
});

// Handle graceful shutdown signals
process.on('SIGTERM', () => gracefulShutdown(server));
process.on('SIGINT', () => gracefulShutdown(server));

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  log('error', `Uncaught exception: ${error.message}`);
  log('error', error.stack);
  process.exit(1);
});

// Handle unhandled promise rejections
process.on('unhandledRejection', (reason, promise) => {
  log('error', `Unhandled promise rejection at: ${promise}`);
  log('error', `Reason: ${reason}`);
  process.exit(1);
});
