const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { supabaseAuth, isOtpEnabled } = require('./supabaseClient');

const OTP_FILE_PATH = path.join(__dirname, '..', 'data', 'local-otps.json');
const LOCAL_OTP_TTL_MS = 10 * 60 * 1000;
const OTP_TIMEOUT_MS = 5000;

// In-memory cache for performance
let localOtpsCache = new Map();
let lastFileLoad = 0;
const CACHE_TTL_MS = 30000; // 30 seconds cache TTL

function makeLocalOtp() {
  return String(crypto.randomInt(100000, 999999));
}

function normalizePhone(phone) {
  if (!phone) return '';
  return String(phone).trim().replace(/\s+/g, '');
}

function log(mode, message, fallbackReason = null) {
  const timestamp = new Date().toISOString();
  const logMessage = `[${timestamp}] [OTP] [${mode.toUpperCase()}] ${message}`;
  if (fallbackReason) {
    console.log(`${logMessage} (fallback: ${fallbackReason})`);
  } else {
    console.log(logMessage);
  }
}

function loadLocalOtps() {
  try {
    if (!fs.existsSync(OTP_FILE_PATH)) {
      return {};
    }
    const data = fs.readFileSync(OTP_FILE_PATH, 'utf8');
    return JSON.parse(data || '{}');
  } catch (error) {
    log('error', `Failed to load local OTPs: ${error.message}`);
    return {};
  }
}

function saveLocalOtps(otps) {
  try {
    // Create directory if it doesn't exist
    const dir = path.dirname(OTP_FILE_PATH);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(OTP_FILE_PATH, JSON.stringify(otps, null, 2), 'utf8');
  } catch (error) {
    log('error', `Failed to save local OTPs: ${error.message}`);
  }
}

function cleanupExpiredOtps(otps) {
  const now = Date.now();
  let cleaned = false;
  
  for (const [phone, entry] of Object.entries(otps)) {
    if (now > entry.expiresAt) {
      delete otps[phone];
      cleaned = true;
    }
  }
  
  if (cleaned) {
    log('cleanup', `Removed expired OTP entries`);
  }
  
  return otps;
}

function getLocalOtps() {
  const now = Date.now();
  
  // Refresh cache if expired
  if (now - lastFileLoad > CACHE_TTL_MS) {
    localOtpsCache = new Map();
    const otps = loadLocalOtps();
    const cleanedOtps = cleanupExpiredOtps(otps);
    
    for (const [phone, entry] of Object.entries(cleanedOtps)) {
      localOtpsCache.set(phone, entry);
    }
    
    lastFileLoad = now;
    
    // Save cleaned data back to file
    if (Object.keys(cleanedOtps).length !== Object.keys(otps).length) {
      saveLocalOtps(cleanedOtps);
    }
  }
  
  return localOtpsCache;
}

function storeLocalOtp(phone, token) {
  const normalizedPhone = normalizePhone(phone);
  const otps = loadLocalOtps();
  
  otps[normalizedPhone] = {
    token,
    expiresAt: Date.now() + LOCAL_OTP_TTL_MS,
    createdAt: Date.now(),
  };
  
  saveLocalOtps(otps);
  
  // Update cache
  localOtpsCache.set(normalizedPhone, otps[normalizedPhone]);
  
  log('local', `Stored OTP for ${normalizedPhone}`);
}

function consumeLocalOtp(phone, token) {
  const normalizedPhone = normalizePhone(phone);
  const otps = getLocalOtps();
  const entry = otps.get(normalizedPhone);
  
  log('debug', `Attempting to consume OTP for ${normalizedPhone} with token ${token}`);
  log('debug', `Available OTP entry: ${entry ? JSON.stringify(entry) : 'none'}`);
  
  if (!entry) {
    log('debug', `No OTP found for ${normalizedPhone}`);
    return false;
  }
  
  if (Date.now() > entry.expiresAt) {
    log('debug', `OTP expired for ${normalizedPhone}`);
    // Remove expired entry
    const allOtps = loadLocalOtps();
    delete allOtps[normalizedPhone];
    saveLocalOtps(allOtps);
    localOtpsCache.delete(normalizedPhone);
    return false;
  }
  
  if (entry.token !== token) {
    log('debug', `Token mismatch for ${normalizedPhone}: expected ${entry.token}, got ${token}`);
    return false;
  }
  
  // Remove consumed OTP
  const allOtps = loadLocalOtps();
  delete allOtps[normalizedPhone];
  saveLocalOtps(allOtps);
  localOtpsCache.delete(normalizedPhone);
  
  log('local', `Consumed OTP for ${normalizedPhone}`);
  return true;
}

async function withTimeout(promise, timeoutMs, operation) {
  let timeoutId;
  const timeoutPromise = new Promise((_, reject) => {
    timeoutId = setTimeout(() => {
      log('timeout', `${operation} timed out after ${timeoutMs}ms`);
      reject(new Error('OTP service timed out'));
    }, timeoutMs);
  });

  try {
    return await Promise.race([promise, timeoutPromise]);
  } finally {
    clearTimeout(timeoutId);
  }
}

async function sendPhoneOtp(phone) {
  const normalizedPhone = normalizePhone(phone);
  
  if (!isOtpEnabled || !supabaseAuth) {
    const token = makeLocalOtp();
    storeLocalOtp(normalizedPhone, token);
    log('local', `Generated demo OTP for ${normalizedPhone}`, 'Supabase OTP not configured');
    return {
      success: true,
      mode: 'local',
      message: 'Demo OTP generated locally because Supabase OTP is not configured.',
      token,
    };
  }

  try {
    log('supabase', `Attempting to send OTP to ${normalizedPhone}`);
    const result = await withTimeout(
      supabaseAuth.auth.signInWithOtp({
        phone: normalizedPhone,
        options: {
          shouldCreateUser: true,
        },
      }),
      OTP_TIMEOUT_MS,
      'send OTP'
    );

    const { error } = result || {};
    if (error) {
      log('supabase', `OTP send failed: ${error.message}`);
      const token = makeLocalOtp();
      storeLocalOtp(normalizedPhone, token);
      return {
        success: true,
        mode: 'local',
        message: `Supabase OTP failed (${error.message}), using demo OTP locally for ${normalizedPhone}.`,
        token,
      };
    }

    log('supabase', `OTP sent successfully to ${normalizedPhone}`);
    return {
      success: true,
      mode: 'supabase',
      message: 'OTP sent successfully',
    };
  } catch (error) {
    log('supabase', `OTP send error: ${error.message}`);
    const token = makeLocalOtp();
    storeLocalOtp(normalizedPhone, token);
    return {
      success: true,
      mode: 'local',
      message: `Supabase OTP timed out or failed, using demo OTP locally for ${normalizedPhone}.`,
      token,
    };
  }
}

async function verifyPhoneOtp(phone, token) {
  const normalizedPhone = normalizePhone(phone);
  
  // DEBUG: Accept any 6-digit token for testing
  if (process.env.DEBUG_OTP === 'true' && token && token.length === 6 && /^\d+$/.test(token)) {
    log('debug', `DEBUG MODE: Accepting any 6-digit OTP ${token} for ${normalizedPhone}`);
    return {
      success: true,
      mode: 'debug',
      session: {
        accessToken: 'debug-token',
        refreshToken: 'debug-refresh',
        expiresAt: Date.now() + 3600000,
      },
      user: {
        id: 'debug-user',
        phone: normalizedPhone,
      },
    };
  }
  
  // First try local OTP
  if (consumeLocalOtp(normalizedPhone, token)) {
    log('local', `Local OTP verified for ${normalizedPhone}`);
    return {
      success: true,
      mode: 'local',
      session: {
        accessToken: null,
        refreshToken: null,
        expiresAt: null,
      },
      user: {
        id: null,
        phone: normalizedPhone,
      },
    };
  }
  
  // If local OTP not found, try Supabase
  if (isOtpEnabled) {
    try {
      log('supabase', `Verifying OTP with Supabase for ${normalizedPhone}`);
      const { data, error } = await withTimeout(
        supabaseAuth.auth.verifyOtp({
          phone: normalizedPhone,
          token: token,
          type: 'sms',
        }),
        OTP_TIMEOUT_MS
      );
      
      if (error) {
        log('supabase', `Supabase OTP verification failed: ${error.message}`);
        return {
          success: false,
          error: 'OTP_VERIFICATION_FAILED',
          message: error.message,
        };
      }
      
      log('supabase', `Supabase OTP verified for ${normalizedPhone}`);
      return {
        success: true,
        mode: 'supabase',
        session: {
          accessToken: data.session.access_token,
          refreshToken: data.session.refresh_token,
          expiresAt: data.session.expires_at,
        },
        user: {
          id: data.user.id,
          phone: data.user.phone,
        },
      };
    } catch (error) {
      log('supabase', `Supabase OTP verification error: ${error.message}`);
      return {
        success: false,
        error: 'OTP_VERIFICATION_FAILED',
        message: error.message,
      };
    }
  }
  
  return {
    success: false,
    error: 'OTP_VERIFICATION_FAILED',
    message: 'Invalid or expired OTP',
  };
}

module.exports = {
  sendPhoneOtp,
  verifyPhoneOtp,
};
