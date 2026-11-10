'use strict';
const fs = require('fs');
const path = require('path');
const initSqlJs = require('sql.js');
const wasmPath = require.resolve('sql.js/dist/sql-wasm.wasm');

const DB_PATH = path.join(__dirname, 'data', 'travelq.sqlite');

let db;

function persist() {
  const data = db.export();
  fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
  fs.writeFileSync(DB_PATH, Buffer.from(data));
}

async function init() {
  const SQL = await initSqlJs({ locateFile: () => wasmPath });
  if (fs.existsSync(DB_PATH)) {
    db = new SQL.Database(fs.readFileSync(DB_PATH));
  } else {
    db = new SQL.Database();
  }
  db.run(`
    CREATE TABLE IF NOT EXISTS records (
      id TEXT PRIMARY KEY,
      iv TEXT NOT NULL,
      ciphertext TEXT NOT NULL,
      alg TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
  `);
  db.run(`
    CREATE TABLE IF NOT EXISTS reserved_ids (
      id TEXT PRIMARY KEY,
      reserved_at TEXT NOT NULL
    );
  `);
  persist();
  return db;
}

function exists(id) {
  const stmt = db.prepare('SELECT 1 AS x FROM records WHERE id = ?');
  stmt.bind([id]);
  const has = stmt.step();
  stmt.free();
  return has;
}

function isReserved(id) {
  const stmt = db.prepare('SELECT 1 AS x FROM reserved_ids WHERE id = ?');
  stmt.bind([id]);
  const has = stmt.step();
  stmt.free();
  return has;
}

function idTaken(id) {
  return exists(id) || isReserved(id);
}

function reserveId(id) {
  const now = new Date().toISOString();
  db.run('INSERT INTO reserved_ids (id, reserved_at) VALUES (?, ?)', [id, now]);
  persist();
}

function clearReservation(id) {
  db.run('DELETE FROM reserved_ids WHERE id = ?', [id]);
  persist();
}

function upsertRecord(id, packed) {
  const now = new Date().toISOString();
  if (exists(id)) {
    db.run(
      `UPDATE records SET iv=?, ciphertext=?, alg=?, updated_at=? WHERE id=?`,
      [packed.iv, packed.ciphertext, packed.alg || 'AES-256-GCM', now, id]
    );
  } else {
    db.run(
      `INSERT INTO records (id, iv, ciphertext, alg, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [id, packed.iv, packed.ciphertext, packed.alg || 'AES-256-GCM', now, now]
    );
  }
  clearReservation(id);
  persist();
}

function getRecord(id) {
  const stmt = db.prepare('SELECT id, iv, ciphertext, alg, created_at, updated_at FROM records WHERE id = ?');
  stmt.bind([id]);
  if (!stmt.step()) { stmt.free(); return null; }
  const row = stmt.getAsObject();
  stmt.free();
  return row;
}

function dumpRaw() {
  const res = db.exec('SELECT id, iv, ciphertext, alg FROM records');
  if (!res.length) return [];
  const cols = res[0].columns;
  return res[0].values.map(v => Object.fromEntries(cols.map((c, i) => [c, v[i]])));
}

module.exports = {
  init, exists, isReserved, idTaken, reserveId, clearReservation,
  upsertRecord, insertRecord: upsertRecord, getRecord, dumpRaw, DB_PATH
};
