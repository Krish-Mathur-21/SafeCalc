const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const SUPABASE_PUBLISHABLE_KEY = process.env.SUPABASE_PUBLISHABLE_KEY;

function normalizePhone(phone) {
  if (!phone) return '';
  return String(phone).trim().replace(/\s+/g, '');
}

function log(mode, message) {
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] [SUPABASE] [${mode.toUpperCase()}] ${message}`);
}

const isSupabaseEnabled = Boolean(SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY);
const isOtpEnabled = Boolean(SUPABASE_URL && SUPABASE_PUBLISHABLE_KEY);

let supabase = null;
let supabaseAuth = null;

if (isSupabaseEnabled) {
  try {
    supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });
    log('info', 'Supabase client initialized successfully');
  } catch (error) {
    log('error', `Failed to initialize Supabase client: ${error.message}`);
  }
}

if (isOtpEnabled) {
  try {
    supabaseAuth = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });
    log('info', 'Supabase auth client initialized successfully');
  } catch (error) {
    log('error', `Failed to initialize Supabase auth client: ${error.message}`);
  }
}

module.exports = {
  supabase,
  isSupabaseEnabled,
  supabaseAuth,
  isOtpEnabled,
  normalizePhone,
};
