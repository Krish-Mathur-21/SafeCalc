import * as SecureStore from 'expo-secure-store';

const USER_PHONE_KEY = 'safecalc_user_phone';
const USER_NAME_KEY = 'safecalc_user_name';
const USER_PHONE_VERIFIED_KEY = 'safecalc_user_phone_verified';

export async function getCurrentUserPhone(): Promise<string | null> {
  return SecureStore.getItemAsync(USER_PHONE_KEY);
}

export async function getCurrentUserName(): Promise<string | null> {
  return SecureStore.getItemAsync(USER_NAME_KEY);
}

export async function setCurrentUser(phone: string, name?: string): Promise<void> {
  await SecureStore.setItemAsync(USER_PHONE_KEY, phone, {
    keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
  });

  if (name && name.trim()) {
    await SecureStore.setItemAsync(USER_NAME_KEY, name.trim(), {
      keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
    });
  }
}

export async function isCurrentUserPhoneVerified(): Promise<boolean> {
  const value = await SecureStore.getItemAsync(USER_PHONE_VERIFIED_KEY);
  return value === '1';
}

export async function setCurrentUserPhoneVerified(verified: boolean): Promise<void> {
  await SecureStore.setItemAsync(USER_PHONE_VERIFIED_KEY, verified ? '1' : '0', {
    keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
  });
}

export async function clearCurrentUser(): Promise<void> {
  await SecureStore.deleteItemAsync(USER_PHONE_KEY);
  await SecureStore.deleteItemAsync(USER_NAME_KEY);
  await SecureStore.deleteItemAsync(USER_PHONE_VERIFIED_KEY);
}
