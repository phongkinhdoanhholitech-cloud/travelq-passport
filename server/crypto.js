'use strict';
const crypto = require('crypto');

function loadKey(hexOrB64) {
  if (!hexOrB64) throw new Error('TRAVELQ_DATA_KEY missing');
  let buf;
  if (/^[0-9a-fA-F]+$/.test(hexOrB64) && hexOrB64.length === 64) {
    buf = Buffer.from(hexOrB64, 'hex');
  } else {
    buf = Buffer.from(hexOrB64, 'base64');
  }
  if (buf.length !== 32) throw new Error('TRAVELQ_DATA_KEY must be 32 bytes');
  return buf;
}

function encryptJson(key, obj) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const plaintext = Buffer.from(JSON.stringify(obj), 'utf8');
  const enc = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const tag = cipher.getAuthTag();
  return {
    iv: iv.toString('base64'),
    ciphertext: Buffer.concat([enc, tag]).toString('base64'),
    alg: 'AES-256-GCM'
  };
}

function decryptJson(key, packed) {
  const iv = Buffer.from(packed.iv, 'base64');
  const raw = Buffer.from(packed.ciphertext, 'base64');
  if (raw.length < 17) throw new Error('CIPHERTEXT_SHORT');
  const tag = raw.subarray(raw.length - 16);
  const data = raw.subarray(0, raw.length - 16);
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(tag);
  const plain = Buffer.concat([decipher.update(data), decipher.final()]);
  return JSON.parse(plain.toString('utf8'));
}

/** Account ID from host app: 4–20 chars [A-Za-z0-9], keep leading zeros. */
function normalizeId(raw) {
  const id = String(raw || '').replace(/\s+/g, '');
  if (!/^[A-Za-z0-9]{4,20}$/.test(id)) return null;
  return id;
}

function shortHmac(secret, id) {
  const h = crypto.createHmac('sha256', secret).update(String(id)).digest('base64url');
  return h.slice(0, 10);
}

function makeQrPayload(secret, id) {
  return `${id}.${shortHmac(secret, id)}`;
}

function parseQrPayload(secret, payload) {
  const raw = String(payload || '').trim();
  let id = raw;
  let sig = null;
  if (raw.includes('.')) {
    const i = raw.indexOf('.');
    id = raw.slice(0, i);
    sig = raw.slice(i + 1);
  }
  id = id.replace(/\s+/g, '');
  // Accept TQ017715 / ID:017715 / display forms — storage key is raw account id
  id = id.replace(/^(TQ|ID)[:\-]*/i, '');
  const normalized = normalizeId(id);
  if (!normalized) {
    return { ok: false, error: 'INVALID_ID_FORMAT', id };
  }
  if (sig) {
    const expect = shortHmac(secret, normalized);
    const a = Buffer.from(sig);
    const b = Buffer.from(expect);
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
      return { ok: false, error: 'BAD_SIGNATURE', id: normalized };
    }
  }
  return { ok: true, id: normalized, signed: !!sig };
}

/** Card label: "TQ 017 715" — TQ + groups of 3 from the left. */
function displayId(id) {
  const s = String(id || '');
  // Prefer digit body for grouping; strip accidental TQ prefix for display rebuild
  let body = s.replace(/^TQ/i, '');
  if (/^\d+$/.test(body)) {
    const parts = body.match(/.{1,3}/g) || [body];
    return 'TQ ' + parts.join(' ');
  }
  return 'TQ ' + body;
}

module.exports = {
  loadKey, encryptJson, decryptJson, shortHmac, makeQrPayload,
  parseQrPayload, normalizeId, displayId
};
