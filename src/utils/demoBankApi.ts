import Constants from 'expo-constants';
import { NativeModules, Platform } from 'react-native';

function isUsableHost(hostname: string): boolean {
  const normalized = hostname.trim().toLowerCase();
  return Boolean(normalized) && !['localhost', '127.0.0.1', '::1', '10.0.2.2'].includes(normalized);
}

function extractHost(candidate: string): string | null {
  const raw = candidate.trim();
  if (!raw) return null;

  try {
    const parsed = raw.includes('://') ? new URL(raw) : new URL(`http://${raw}`);
    return parsed.hostname || null;
  } catch {
    const withoutScheme = raw.replace(/^[a-z]+:\/\//i, '');
    return withoutScheme.split(':')[0] || null;
  }
}

function resolveApiBaseUrl(): string {
  const envUrl = process.env.EXPO_PUBLIC_API_BASE_URL;
  if (envUrl && envUrl.trim()) {
    return envUrl.trim().replace(/\/$/, '');
  }

  const hostCandidates: Array<string | undefined> = [
    Constants.expoConfig?.hostUri,
    (Constants as any)?.manifest?.debuggerHost,
    (Constants as any)?.manifest2?.extra?.expoGo?.developer?.hostUri,
    (Constants as any)?.manifest2?.extra?.expoClient?.hostUri,
  ];

  for (const candidate of hostCandidates) {
    if (!candidate) continue;
    const host = extractHost(String(candidate));
    if (!host) continue;
    if (isUsableHost(host)) {
      return `http://${host}:4000`;
    }
  }

  // Prefer the Metro host when the app is running on a real device/simulator.
  const scriptURL: string | undefined = NativeModules?.SourceCode?.scriptURL;
  if (scriptURL && scriptURL.startsWith('http')) {
    try {
      const url = new URL(scriptURL);
      if (isUsableHost(url.hostname)) {
        return `http://${url.hostname}:4000`;
      }
    } catch {
      // Ignore parse failure and use localhost fallback.
    }
  }

  // Android emulator can still use the host loopback alias.
  if (Platform.OS === 'android' && !Constants.isDevice) {
    return 'http://10.0.2.2:4000';
  }

  return 'http://localhost:4000';
}

const API_BASE_URL = resolveApiBaseUrl();

export type DemoSummary = {
  accountId: string;
  currency: string;
  openingBalance: number;
  balance: number;
  totalCredited: number;
  totalDebited: number;
  transactionCount: number;
};

export type DemoTransaction = {
  id: string;
  type: 'credit' | 'debit';
  amount: number;
  category: string;
  note: string;
  createdAt: string;
};

export type FinancialInstitution = {
  id: string;
  name: string;
  accountType?: string;
  accountMask?: string;
  createdAt?: string;
};

export type UserProfile = {
  name?: string;
  phone: string;
  createdAt?: string;
  updatedAt?: string;
  institutions?: FinancialInstitution[];
  activeInstitutionId?: string;
};

async function apiFetch(path: string, options?: RequestInit) {
  const timeoutMs = 8000;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(`${API_BASE_URL}${path}`, {
      headers: {
        'Content-Type': 'application/json',
        ...(options?.headers || {}),
      },
      signal: controller.signal,
      ...options,
    });

    const data = await res.json();
    if (!res.ok) {
      throw new Error(data?.message || 'API request failed');
    }

    return data;
  } catch (error: any) {
    const message = String(error?.message || '').toLowerCase();
    if (message.includes('aborted')) {
      throw new Error(`Backend request timed out after ${timeoutMs / 1000}s at ${API_BASE_URL}.`);
    }
    if (message.includes('network request failed')) {
      throw new Error(
        `Cannot reach backend at ${API_BASE_URL}. If this is a physical phone, set EXPO_PUBLIC_API_BASE_URL to your laptop LAN IP, for example http://192.168.1.23:4000.`
      );
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

export function getApiBaseUrl(): string {
  return API_BASE_URL;
}

export async function getDemoSummary(): Promise<DemoSummary> {
  return apiFetch('/api/account/summary');
}

export async function signUpWithPhone(phone: string, name: string) {
  return apiFetch('/api/auth/signup', {
    method: 'POST',
    body: JSON.stringify({ phone, name }),
  });
}

export async function sendOtpToPhone(phone: string) {
  return apiFetch('/api/auth/otp/send', {
    method: 'POST',
    body: JSON.stringify({ phone }),
  });
}

export async function verifyOtpForPhone(phone: string, token: string, name?: string) {
  return apiFetch('/api/auth/otp/verify', {
    method: 'POST',
    body: JSON.stringify({ phone, token, name }),
  });
}

export async function getProfileByPhone(phone: string): Promise<{ phone: string; profile: UserProfile }> {
  return apiFetch(`/api/profile/${encodeURIComponent(phone)}`);
}

export async function upsertProfileByPhone(phone: string, profile: UserProfile) {
  return apiFetch(`/api/profile/${encodeURIComponent(phone)}`, {
    method: 'PUT',
    body: JSON.stringify({ profile }),
  });
}

export async function getDemoSummaryByPhone(phone: string): Promise<DemoSummary> {
  return apiFetch(`/api/account/summary?phone=${encodeURIComponent(phone)}`);
}

export async function getDemoTransactions(phone: string): Promise<DemoTransaction[]> {
  const data = await apiFetch(`/api/transactions?phone=${encodeURIComponent(phone)}`);
  return data.transactions;
}

export async function addDemoCash(phone: string, amount: number, category = 'cash_deposit', note = '') {
  return apiFetch('/api/transactions/credit', {
    method: 'POST',
    body: JSON.stringify({ phone, amount, category, note }),
  });
}

export async function spendDemoCash(phone: string, amount: number, category = 'general', note = '') {
  return apiFetch('/api/transactions/debit', {
    method: 'POST',
    body: JSON.stringify({ phone, amount, category, note }),
  });
}
