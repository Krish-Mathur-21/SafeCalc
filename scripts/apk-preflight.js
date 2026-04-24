const fs = require('fs');
const path = require('path');

const root = process.cwd();
const appJsonPath = path.join(root, 'app.json');
const easPath = path.join(root, 'eas.json');
const rootEnvPath = path.join(root, '.env');
const backendEnvPath = path.join(root, 'backend', '.env');

const checks = [];

function add(ok, label, detail, critical = false) {
  checks.push({ ok, label, detail, critical });
}

function parseDotEnv(filePath) {
  if (!fs.existsSync(filePath)) return {};
  const lines = fs.readFileSync(filePath, 'utf8').split(/\r?\n/);
  const out = {};
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const idx = trimmed.indexOf('=');
    if (idx < 0) continue;
    const k = trimmed.slice(0, idx).trim();
    const v = trimmed.slice(idx + 1).trim();
    out[k] = v;
  }
  return out;
}

function printAndExit() {
  console.log('\n=== SafeCalc APK Preflight ===');
  for (const c of checks) {
    const icon = c.ok ? 'PASS' : c.critical ? 'FAIL' : 'WARN';
    console.log(`[${icon}] ${c.label}`);
    if (c.detail) console.log(`       ${c.detail}`);
  }

  const failedCritical = checks.filter((c) => !c.ok && c.critical);
  if (failedCritical.length) {
    console.log('\nAPK preflight failed due to critical issues.');
    process.exit(1);
  }

  console.log('\nAPK preflight completed.');
}

function main() {
  add(fs.existsSync(appJsonPath), 'app.json exists', appJsonPath, true);
  add(fs.existsSync(easPath), 'eas.json exists', easPath, true);

  let appConfig = null;
  if (fs.existsSync(appJsonPath)) {
    try {
      appConfig = JSON.parse(fs.readFileSync(appJsonPath, 'utf8'));
      add(true, 'app.json parse', 'Valid JSON');
    } catch (error) {
      add(false, 'app.json parse', error.message, true);
    }
  }

  if (appConfig?.expo) {
    const androidPackage = appConfig.expo?.android?.package;
    const iosBundle = appConfig.expo?.ios?.bundleIdentifier;

    add(Boolean(androidPackage), 'Android package id', androidPackage || 'Missing expo.android.package', true);
    add(Boolean(iosBundle), 'iOS bundle id', iosBundle || 'Missing expo.ios.bundleIdentifier', false);

    if (androidPackage === 'com.utils.calculator') {
      add(false, 'Android package uniqueness', 'com.utils.calculator is generic; use your own unique id before store release.', false);
    } else {
      add(true, 'Android package uniqueness', 'Custom package id set.', false);
    }
  }

  const backendEnv = parseDotEnv(backendEnvPath);
  const rootEnv = parseDotEnv(rootEnvPath);
  const host = backendEnv.HOST || '0.0.0.0';
  const port = backendEnv.PORT || '4000';

  add(host === '0.0.0.0', 'Backend HOST for device testing', `HOST=${host} (recommended 0.0.0.0)`, false);
  add(Boolean(backendEnv.BACKEND_AES_KEY), 'Backend AES key', backendEnv.BACKEND_AES_KEY ? 'Present in backend/.env' : 'Missing BACKEND_AES_KEY in backend/.env', true);

  const publicApi = process.env.EXPO_PUBLIC_API_BASE_URL || rootEnv.EXPO_PUBLIC_API_BASE_URL || '';
  add(
    Boolean(publicApi),
    'EXPO_PUBLIC_API_BASE_URL',
    publicApi
      ? `Current value: ${publicApi}${process.env.EXPO_PUBLIC_API_BASE_URL ? ' (from shell)' : ' (from .env)'}`
      : `Not set in current shell. Set it before build, e.g. http://YOUR_LAN_IP:${port} (local) or https://your-backend.example.com (public).`,
    false
  );

  add(true, 'EAS build profile', 'Use: eas build --platform android --profile preview (APK)', false);

  printAndExit();
}

main();
