const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');

const strict = process.argv.includes('--strict');

const backendDir = path.resolve(__dirname, '..');
const envPath = path.join(backendDir, '.env');
const envExamplePath = path.join(backendDir, '.env.example');

if (fs.existsSync(envPath)) {
  require('dotenv').config({ path: envPath, override: true });
}

const checks = [];

function addCheck(ok, label, detail, critical = false) {
  checks.push({ ok, label, detail, critical });
}

function printResults() {
  console.log('\n=== SafeCalc Backend Preflight ===');
  for (const c of checks) {
    const icon = c.ok ? 'PASS' : c.critical ? 'FAIL' : 'WARN';
    console.log(`[${icon}] ${c.label}`);
    if (c.detail) console.log(`       ${c.detail}`);
  }

  const failedCritical = checks.filter((c) => !c.ok && c.critical);
  if (failedCritical.length > 0) {
    console.log('\nPreflight failed due to critical issues.');
    process.exit(1);
  }

  console.log('\nPreflight completed.');
}

async function run() {
  addCheck(fs.existsSync(envExamplePath), '.env.example exists', envExamplePath, true);
  addCheck(fs.existsSync(envPath), '.env exists', envPath, true);

  const aesKey = process.env.BACKEND_AES_KEY || '';
  addCheck(
    aesKey.length >= 16,
    'BACKEND_AES_KEY length',
    aesKey.length >= 16 ? 'Configured' : 'Must be at least 16 chars in backend/.env',
    true
  );

  const supabaseUrl = process.env.SUPABASE_URL || '';
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
  const publishableKey = process.env.SUPABASE_PUBLISHABLE_KEY || '';

  const supabaseConfigured = Boolean(supabaseUrl && serviceRoleKey);
  const otpConfigured = Boolean(supabaseUrl && publishableKey);

  addCheck(
    supabaseConfigured || !strict,
    'Supabase core config',
    supabaseConfigured
      ? 'SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY present'
      : 'Missing Supabase core vars. Backend will use local fallback mode.',
    strict
  );

  addCheck(
    otpConfigured || !strict,
    'Supabase OTP config',
    otpConfigured
      ? 'SUPABASE_PUBLISHABLE_KEY present'
      : 'Missing SUPABASE_PUBLISHABLE_KEY. OTP SMS will fallback to local demo token.',
    strict
  );

  if (supabaseConfigured) {
    try {
      const client = createClient(supabaseUrl, serviceRoleKey, {
        auth: { autoRefreshToken: false, persistSession: false },
      });

      const usersRes = await client.from('bank_users').select('phone').limit(1);
      addCheck(
        !usersRes.error,
        'Supabase table public.bank_users',
        usersRes.error
          ? usersRes.error.message
          : 'Table reachable',
        strict
      );

      const txRes = await client.from('bank_transactions').select('id').limit(1);
      addCheck(
        !txRes.error,
        'Supabase table public.bank_transactions',
        txRes.error
          ? txRes.error.message
          : 'Table reachable',
        strict
      );

      addCheck(
        true,
        'Supabase connectivity',
        'Project API reachable with service role key',
        false
      );
    } catch (error) {
      addCheck(false, 'Supabase connectivity', error.message, strict);
    }
  }

  addCheck(
    true,
    'OTP provider note',
    'Phone provider enablement is checked in Supabase Dashboard (Auth -> Providers -> Phone).',
    false
  );

  printResults();
}

run().catch((error) => {
  console.error('Preflight crashed:', error.message);
  process.exit(1);
});
