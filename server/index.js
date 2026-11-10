'use strict';
const path = require('path');
const fs = require('fs');
const express = require('express');
const cors = require('cors');
const morgan = require('morgan');
require('dotenv').config({ path: path.join(__dirname, '.env') });

const db = require('./db');
const {
  loadKey, encryptJson, decryptJson, makeQrPayload,
  parseQrPayload, normalizeId, displayId
} = require('./crypto');

const PORT = Number(process.env.PORT || 8787);
const PUBLIC_DIR = (() => {
  const a = path.join(__dirname, '..', 'public');
  const b = path.join(__dirname, 'public');
  return fs.existsSync(a) ? a : b;
})();
const DATA_KEY = loadKey(process.env.TRAVELQ_DATA_KEY);
const HMAC_SECRET = process.env.TRAVELQ_HMAC_SECRET || process.env.TRAVELQ_DATA_KEY;
const API_KEY = (process.env.TRAVELQ_API_KEY || '').trim();

function requireApiKey(req, res, next) {
  if (!API_KEY) return next();
  if ((req.get('X-API-Key') || '') !== API_KEY) {
    return res.status(401).json({ error: 'UNAUTHORIZED' });
  }
  next();
}

function maskCccd(cccd) {
  const s = String(cccd || '');
  if (s.length <= 4) return '****';
  return s.slice(0, 3) + '******' + s.slice(-3);
}

function maskPhone(phone) {
  const s = String(phone || '').replace(/\s+/g, '');
  if (s.length <= 4) return '****';
  return s.slice(0, 3) + '****' + s.slice(-3);
}

function clipDataUrl(v, max = 4_000_000) {
  if (!v) return null;
  const s = String(v);
  if (!s.startsWith('data:image/')) return null;
  return s.slice(0, max);
}

async function main() {
  await db.init();
  const app = express();
  app.use(morgan('dev'));
  app.use(cors());
  app.use(express.json({ limit: '15mb' }));

  app.get('/api/health', (_req, res) => {
    res.json({ ok: true, service: 'travelq-passport', time: new Date().toISOString() });
  });

  // Signed QR payload for an existing account ID (secret stays server-side)
  app.get('/api/qr/:id', (req, res) => {
    const id = normalizeId(req.params.id);
    if (!id) return res.status(400).json({ error: 'INVALID_ID_FORMAT' });
    const qrPayload = makeQrPayload(HMAC_SECRET, id);
    res.json({ id, displayId: displayId(id), qrPayload });
  });

  // Upsert encrypted profile keyed by host-app account ID
  app.post('/api/records', (req, res) => {
    try {
      const body = req.body || {};
      const id = normalizeId(body.id);
      if (!id) {
        return res.status(400).json({ error: 'INVALID_ID_FORMAT', hint: '4–20 chars A-Z/0-9' });
      }
      const name = String(body.name || '').trim();
      const cccd = String(body.cccd || '').replace(/\D/g, '').slice(0, 12);
      const dob = String(body.dob || '').trim();
      const address = String(body.address || '').trim();
      const phone = String(body.phone || '').trim();
      const gender = String(body.gender || '').trim();
      const country = String(body.country || body.nationality || '').trim();
      const province = String(body.province || '').trim();
      const oldCmnd = String(body.oldCmnd || '').replace(/\D/g, '').slice(0, 12);
      const cccdIssueDate = String(body.cccdIssueDate || body.issueDate || '').trim();
      const cccdFront = clipDataUrl(body.cccdFrontDataUrl);
      const cccdBack = clipDataUrl(body.cccdBackDataUrl);
      const selfie = clipDataUrl(body.selfieDataUrl, 2_000_000);
      const passportNo = String(body.passportNo || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 9);
      const source = ['cccd_qr', 'manual'].includes(body.source) ? body.source : 'manual';

      // Drop ID confirm — ID comes from host app; still accept idConfirm if sent for back-compat
      if (body.idConfirm != null && String(body.idConfirm).length) {
        const idConfirm = normalizeId(body.idConfirm);
        if (idConfirm && idConfirm !== id) {
          return res.status(400).json({ error: 'ID_CONFIRM_MISMATCH' });
        }
      }

      if (cccd) {
        if (!/^\d{12}$/.test(cccd)) return res.status(400).json({ error: 'CCCD_INVALID' });
      }
      if (passportNo && !/^[A-Z0-9]{6,9}$/.test(passportNo)) {
        return res.status(400).json({ error: 'PASSPORT_INVALID' });
      }
      if (!cccd && !passportNo) {
        return res.status(400).json({ error: 'CCCD_OR_PASSPORT_REQUIRED', hint: 'Nhập ít nhất CCCD hoặc số hộ chiếu' });
      }
      if (!name) return res.status(400).json({ error: 'NAME_REQUIRED' });
      if (!dob) return res.status(400).json({ error: 'DOB_REQUIRED' });
      if (!address) return res.status(400).json({ error: 'ADDRESS_REQUIRED' });
      if (!country) return res.status(400).json({ error: 'COUNTRY_REQUIRED' });
      const isVN = /^vi[eệ]t\s*nam$/i.test(country);
      if (isVN && !province) return res.status(400).json({ error: 'PROVINCE_REQUIRED' });
      if (!isVN && !province) return res.status(400).json({ error: 'PROVINCE_REQUIRED' });
      // phone optional now

      let kyc = String(body.kyc || 'skipped');
      if (!['skipped', 'partial', 'complete'].includes(kyc)) {
        const hasDoc = !!(cccdFront || cccdBack);
        const hasSelfie = !!selfie;
        if (hasDoc && hasSelfie && cccdFront && cccdBack) kyc = 'complete';
        else if (hasDoc || hasSelfie) kyc = 'partial';
        else kyc = 'skipped';
      }

      const record = {
        id,
        name,
        cccd,
        dob,
        address,
        phone,
        gender,
        country,
        province,
        oldCmnd,
        cccdIssueDate,
        passportNo,
        nationality: country,
        issueDate: cccdIssueDate,
        cccdFrontDataUrl: cccdFront,
        cccdBackDataUrl: cccdBack,
        selfieDataUrl: selfie,
        photoDataUrl: clipDataUrl(body.photoDataUrl, 1_500_000),
        kyc,
        source,
        savedAt: new Date().toISOString()
      };

      const packed = encryptJson(DATA_KEY, record);
      const blob = JSON.stringify(packed);
      if (record.cccd && blob.includes(record.cccd)) {
        return res.status(500).json({ error: 'PLAINTEXT_LEAK' });
      }
      if (record.name && blob.includes(record.name)) {
        return res.status(500).json({ error: 'PLAINTEXT_LEAK_NAME' });
      }

      const isUpdate = db.exists(id);
      db.upsertRecord(id, packed);
      const qrPayload = makeQrPayload(HMAC_SECRET, id);
      res.status(isUpdate ? 200 : 201).json({
        id,
        displayId: displayId(id),
        qrPayload,
        updated: isUpdate,
        savedAt: record.savedAt
      });
    } catch (e) {
      console.error(e);
      res.status(500).json({ error: 'SAVE_FAILED', message: e.message });
    }
  });

  app.get('/api/records/:idOrPayload', requireApiKey, (req, res) => {
    try {
      const parsed = parseQrPayload(HMAC_SECRET, req.params.idOrPayload);
      if (!parsed.ok) {
        return res.status(400).json({ error: parsed.error, id: parsed.id });
      }
      const row = db.getRecord(parsed.id);
      if (!row) return res.status(404).json({ error: 'NOT_FOUND', id: parsed.id });

      const record = decryptJson(DATA_KEY, row);
      res.json({
        id: record.id,
        displayId: displayId(record.id),
        name: record.name,
        passportNo: record.passportNo || '',
        nationality: record.nationality || '',
        issueDate: record.issueDate || '',
        dob: record.dob || '',
        address: record.address || '',
        phone: record.phone || '',
        phoneMasked: maskPhone(record.phone),
        gender: record.gender || '',
        country: record.country || record.nationality || '',
        province: record.province || '',
        oldCmnd: record.oldCmnd || '',
        cccdIssueDate: record.cccdIssueDate || record.issueDate || '',
        cccd: record.cccd || '',
        cccdMasked: maskCccd(record.cccd),
        cccdFrontDataUrl: record.cccdFrontDataUrl || null,
        cccdBackDataUrl: record.cccdBackDataUrl || null,
        selfieDataUrl: record.selfieDataUrl || null,
        photoDataUrl: record.photoDataUrl || null,
        kyc: record.kyc || 'skipped',
        source: record.source || 'manual',
        createdAt: row.created_at,
        updatedAt: row.updated_at,
        signatureVerified: parsed.signed
      });
    } catch (e) {
      console.error(e);
      res.status(500).json({ error: 'READ_FAILED', message: e.message });
    }
  });

  app.get('/api/debug/raw', (req, res) => {
    if (process.env.NODE_ENV === 'production') return res.status(404).end();
    res.json({ rows: db.dumpRaw() });
  });

  app.use(express.static(PUBLIC_DIR, { extensions: ['html'] }));
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api/')) return next();
    res.sendFile(path.join(PUBLIC_DIR, 'index.html'));
  });

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`TravelQ Passport server on http://0.0.0.0:${PORT}`);
  });
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
