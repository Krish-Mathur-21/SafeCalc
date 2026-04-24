import * as SecureStore from 'expo-secure-store';
import * as Crypto from 'expo-crypto';
import * as CryptoJS from 'crypto-js';

const KEY_ALIAS = 'safecalc_master_key_v1';
const PAYLOAD_VERSION = 1;

type EncryptedPayload = {
  v: number;
  iv: string;
  ciphertext: string;
  mac: string;
};

function deriveKey(material: string, label: string): CryptoJS.lib.WordArray {
  return CryptoJS.SHA256(`${material}:${label}`);
}

function bytesToWordArray(bytes: Uint8Array): CryptoJS.lib.WordArray {
  return CryptoJS.lib.WordArray.create(bytes as any, bytes.length);
}

function wordArrayToHex(wordArray: CryptoJS.lib.WordArray): string {
  return CryptoJS.enc.Hex.stringify(wordArray);
}

export async function getMasterKey(): Promise<string> {
  let key = await SecureStore.getItemAsync(KEY_ALIAS);
  if (!key) {
    const bytes = await Crypto.getRandomBytesAsync(32);
    key = Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
    await SecureStore.setItemAsync(KEY_ALIAS, key, {
      keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
    });
  }
  return key;
}

export async function encryptText(plaintext: string): Promise<string> {
  const masterKey = await getMasterKey();
  const encKey = deriveKey(masterKey, 'enc');
  const macKey = deriveKey(masterKey, 'mac');
  const ivBytes = await Crypto.getRandomBytesAsync(16);
  const iv = bytesToWordArray(ivBytes);

  const encrypted = CryptoJS.AES.encrypt(plaintext, encKey, {
    iv,
    mode: CryptoJS.mode.CBC,
    padding: CryptoJS.pad.Pkcs7,
  });

  const ciphertext = encrypted.ciphertext.toString(CryptoJS.enc.Base64);
  const mac = CryptoJS.HmacSHA256(`${wordArrayToHex(iv)}.${ciphertext}`, macKey).toString(CryptoJS.enc.Hex);

  const payload: EncryptedPayload = {
    v: PAYLOAD_VERSION,
    iv: wordArrayToHex(iv),
    ciphertext,
    mac,
  };

  return JSON.stringify(payload);
}

export async function decryptText(payloadText: string): Promise<string> {
  let payload: EncryptedPayload;
  try {
    payload = JSON.parse(payloadText) as EncryptedPayload;
  } catch {
    return payloadText;
  }
  if (!payload || payload.v !== PAYLOAD_VERSION) {
    return payloadText;
  }

  const masterKey = await getMasterKey();
  const encKey = deriveKey(masterKey, 'enc');
  const macKey = deriveKey(masterKey, 'mac');
  const expectedMac = CryptoJS.HmacSHA256(`${payload.iv}.${payload.ciphertext}`, macKey).toString(CryptoJS.enc.Hex);

  if (expectedMac !== payload.mac) {
    throw new Error('Encrypted payload integrity check failed');
  }

  const iv = CryptoJS.enc.Hex.parse(payload.iv);
  const cipherParams = CryptoJS.lib.CipherParams.create({
    ciphertext: CryptoJS.enc.Base64.parse(payload.ciphertext),
  });

  const decrypted = CryptoJS.AES.decrypt(cipherParams, encKey, {
    iv,
    mode: CryptoJS.mode.CBC,
    padding: CryptoJS.pad.Pkcs7,
  });

  return decrypted.toString(CryptoJS.enc.Utf8);
}