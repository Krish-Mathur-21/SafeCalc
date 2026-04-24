import { Camera } from 'expo-camera';
import * as SecureStore from 'expo-secure-store';
import CryptoJS from 'crypto-js';

const FACE_CHECK_ENABLED_KEY = 'safecalc_face_check_enabled';
const FACE_CHECK_SETUP_KEY = 'safecalc_face_check_setup_done';
const UNLOCK_PASSWORD_KEY = 'safecalc_unlock_password';
const UNLOCK_PASSWORD_HINT_KEY = 'safecalc_unlock_password_hint';
const CONTINUE_BYPASS_USED_KEY = 'safecalc_continue_bypass_used';

export type FaceCheckSetupResult = 'enabled' | 'face_not_supported' | 'permission_denied' | 'error';

export type FaceCheckStatus = {
  hasHardware: boolean;
  enrolled: boolean;
  supportsFace: boolean;
};

export type FaceAuthResult = 'success' | 'unavailable' | 'failed';

export async function getFaceCheckEnabled(): Promise<boolean> {
  const value = await SecureStore.getItemAsync(FACE_CHECK_ENABLED_KEY);
  return value === 'true';
}

export async function setFaceCheckEnabled(enabled: boolean): Promise<void> {
  await SecureStore.setItemAsync(FACE_CHECK_ENABLED_KEY, enabled ? 'true' : 'false');
}

export async function getFaceCheckStatus(): Promise<FaceCheckStatus> {
  const permission = await Camera.getCameraPermissionsAsync();

  return {
    hasHardware: true,
    enrolled: permission.granted,
    supportsFace: permission.granted,
  };
}

export async function authenticateFaceOnly(): Promise<FaceAuthResult> {
  const permission = await Camera.requestCameraPermissionsAsync();
  return permission.granted ? 'success' : 'unavailable';
}

export async function setupAndEnableFaceCheck(): Promise<FaceCheckSetupResult> {
  try {
    const setupDone = (await SecureStore.getItemAsync(FACE_CHECK_SETUP_KEY)) === 'true';
    const permission = await Camera.requestCameraPermissionsAsync();

    if (!permission.granted) {
      return 'permission_denied';
    }

    if (!setupDone) {
      await SecureStore.setItemAsync(FACE_CHECK_SETUP_KEY, 'true');
    }

    await setFaceCheckEnabled(true);
    return 'enabled';
  } catch {
    return 'error';
  }
}

// Password management functions
export async function setUnlockPassword(password: string, hint?: string): Promise<void> {
  const hashed = CryptoJS.SHA256(password).toString();
  await SecureStore.setItemAsync(UNLOCK_PASSWORD_KEY, hashed);
  if (hint) {
    await SecureStore.setItemAsync(UNLOCK_PASSWORD_HINT_KEY, hint);
  }
}

export async function verifyUnlockPassword(password: string): Promise<boolean> {
  try {
    const stored = await SecureStore.getItemAsync(UNLOCK_PASSWORD_KEY);
    if (!stored) return false;
    
    const hashed = CryptoJS.SHA256(password).toString();
    return hashed === stored;
  } catch {
    return false;
  }
}

export async function getUnlockPasswordHint(): Promise<string | null> {
  try {
    return await SecureStore.getItemAsync(UNLOCK_PASSWORD_HINT_KEY);
  } catch {
    return null;
  }
}

export async function hasUnlockPassword(): Promise<boolean> {
  try {
    const stored = await SecureStore.getItemAsync(UNLOCK_PASSWORD_KEY);
    return !!stored;
  } catch {
    return false;
  }
}

export async function canUseContinueBypass(): Promise<boolean> {
  try {
    const used = await SecureStore.getItemAsync(CONTINUE_BYPASS_USED_KEY);
    return used !== 'true';
  } catch {
    // Keep app usable if storage read fails.
    return true;
  }
}

export async function markContinueBypassUsed(): Promise<void> {
  await SecureStore.setItemAsync(CONTINUE_BYPASS_USED_KEY, 'true');
}

