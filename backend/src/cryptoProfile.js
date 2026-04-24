const crypto = require('crypto');

function getAesKey() {
  const raw = process.env.BACKEND_AES_KEY;
  if (!raw || raw.length < 16) {
    throw new Error('BACKEND_AES_KEY is missing or too short. Set it in backend/.env');
  }
  return crypto.createHash('sha256').update(raw).digest();
}

function encryptProfile(profile) {
  const key = getAesKey();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);

  const plaintext = JSON.stringify(profile);
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();

  return JSON.stringify({
    v: 1,
    iv: iv.toString('base64'),
    tag: tag.toString('base64'),
    data: encrypted.toString('base64'),
  });
}

function decryptProfile(payloadText) {
  if (!payloadText) return null;

  const payload = JSON.parse(payloadText);
  if (!payload || payload.v !== 1) {
    throw new Error('Unsupported profile payload version');
  }

  const key = getAesKey();
  const iv = Buffer.from(payload.iv, 'base64');
  const tag = Buffer.from(payload.tag, 'base64');
  const encrypted = Buffer.from(payload.data, 'base64');

  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(tag);

  const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]);
  return JSON.parse(decrypted.toString('utf8'));
}

function encryptText(text) {
  if (typeof text !== 'string') return '';
  const key = getAesKey();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);

  const encrypted = Buffer.concat([cipher.update(text, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();

  return JSON.stringify({
    v: 1,
    iv: iv.toString('base64'),
    tag: tag.toString('base64'),
    data: encrypted.toString('base64'),
  });
}

function decryptText(payloadText) {
  if (!payloadText) return '';

  const payload = JSON.parse(payloadText);
  if (!payload || payload.v !== 1) {
    throw new Error('Unsupported text payload version');
  }

  const key = getAesKey();
  const iv = Buffer.from(payload.iv, 'base64');
  const tag = Buffer.from(payload.tag, 'base64');
  const encrypted = Buffer.from(payload.data, 'base64');

  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(tag);

  const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]);
  return decrypted.toString('utf8');
}

module.exports = {
  encryptProfile,
  decryptProfile,
  encryptText,
  decryptText,
};
