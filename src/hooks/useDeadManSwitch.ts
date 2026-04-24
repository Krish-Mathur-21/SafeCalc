import { useEffect } from 'react';
import * as BackgroundFetch from 'expo-background-fetch';
import * as TaskManager from 'expo-task-manager';
import * as SecureStore from 'expo-secure-store';
import * as SMS from 'expo-sms';

const TASK_NAME = 'DEAD_MAN_SWITCH_CHECK';
const LAST_OPEN_KEY = 'safecalc_last_open';
const TRUSTED_CONTACT_KEY = 'safecalc_trusted_contact';
const THRESHOLD_DAYS_KEY = 'safecalc_dms_days';

TaskManager.defineTask(TASK_NAME, async () => {
  try {
    const lastOpenStr = await SecureStore.getItemAsync(LAST_OPEN_KEY);
    const contact = await SecureStore.getItemAsync(TRUSTED_CONTACT_KEY);
    const daysStr = await SecureStore.getItemAsync(THRESHOLD_DAYS_KEY);
    if (!lastOpenStr || !contact) return BackgroundFetch.BackgroundFetchResult.NoData;
    const daysSince = (Date.now() - new Date(lastOpenStr).getTime()) / (1000 * 60 * 60 * 24);
    const threshold = parseInt(daysStr || '3', 10);
    if (daysSince >= threshold) {
      const available = await SMS.isAvailableAsync();
      if (available) {
        await SMS.sendSMSAsync(
          [contact],
          `I may need help. I have not checked in for ${Math.floor(daysSince)} days. Please try to contact me.`
        );
        await SecureStore.setItemAsync(LAST_OPEN_KEY, new Date().toISOString());
      }
    }
    return BackgroundFetch.BackgroundFetchResult.NewData;
  } catch {
    return BackgroundFetch.BackgroundFetchResult.Failed;
  }
});

export async function recordAppOpen() {
  await SecureStore.setItemAsync(LAST_OPEN_KEY, new Date().toISOString());
}

export async function setTrustedContact(phoneNumber: string) {
  await SecureStore.setItemAsync(TRUSTED_CONTACT_KEY, phoneNumber, {
    keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
  });
}

export async function setThresholdDays(days: number) {
  await SecureStore.setItemAsync(THRESHOLD_DAYS_KEY, String(days));
}

export async function getTrustedContact(): Promise<string | null> {
  return SecureStore.getItemAsync(TRUSTED_CONTACT_KEY);
}

export async function registerDeadManSwitch() {
  try {
    await BackgroundFetch.registerTaskAsync(TASK_NAME, {
      minimumInterval: 60 * 60 * 12,
      stopOnTerminate: false,
      startOnBoot: true,
    });
  } catch {}
}

export function useDeadManSwitch(isInsideHiddenModule: boolean) {
  useEffect(() => {
    if (isInsideHiddenModule) {
      recordAppOpen();
      registerDeadManSwitch();
    }
  }, [isInsideHiddenModule]);
}