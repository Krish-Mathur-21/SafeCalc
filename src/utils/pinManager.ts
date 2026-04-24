import * as SecureStore from 'expo-secure-store';
import * as Crypto from 'expo-crypto';

const REAL_PIN_KEY = 'safecalc_real_pin_hash';
const DURESS_PIN_KEY = 'safecalc_duress_pin_hash';
const PIN_SETUP_KEY = 'safecalc_pin_initialized';

async function hashPin(pin: string): Promise<string> {
  return Crypto.digestStringAsync(
    Crypto.CryptoDigestAlgorithm.SHA256,
    pin + 'safecalc_salt_v1'
  );
}

export async function isPinInitialized(): Promise<boolean> {
  const val = await SecureStore.getItemAsync(PIN_SETUP_KEY);
  return val === 'true';
}

export async function setupPins(realPin: string, duressPin: string): Promise<void> {
  const realHash = await hashPin(realPin);
  const duressHash = await hashPin(duressPin);
  await SecureStore.setItemAsync(REAL_PIN_KEY, realHash, {
    keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
  });
  await SecureStore.setItemAsync(DURESS_PIN_KEY, duressHash, {
    keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
  });
  await SecureStore.setItemAsync(PIN_SETUP_KEY, 'true');
}

export type UnlockResult = 'real' | 'duress' | 'wrong';

export async function verifyPin(inputPin: string): Promise<UnlockResult> {
  const inputHash = await hashPin(inputPin);
  const realHash = await SecureStore.getItemAsync(REAL_PIN_KEY);
  const duressHash = await SecureStore.getItemAsync(DURESS_PIN_KEY);
  if (inputHash === realHash) return 'real';
  if (inputHash === duressHash) return 'duress';
  return 'wrong';
}

// ─── NEW: Change PINs from inside the app ────────────────────────────────────

export async function changePins(
  currentPin: string,
  newRealPin: string,
  newDuressPin: string
): Promise<'success' | 'wrong_current' | 'same_pins'> {
  const verification = await verifyPin(currentPin);
  if (verification === 'wrong') return 'wrong_current';
  if (newRealPin === newDuressPin) return 'same_pins';

  const newRealHash = await hashPin(newRealPin);
  const newDuressHash = await hashPin(newDuressPin);

  await SecureStore.setItemAsync(REAL_PIN_KEY, newRealHash, {
    keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
  });
  await SecureStore.setItemAsync(DURESS_PIN_KEY, newDuressHash, {
    keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
  });

  return 'success';
}