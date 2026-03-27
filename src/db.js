import Database from 'better-sqlite3';
import { logger } from './logger.js';

const DB_PATH = process.env.DB_PATH || 'sessions.db';
let db;

export function getDb() {
  if (!db) {
    db = new Database(DB_PATH);
    db.pragma('journal_mode = WAL');
    migrate(db);
    logger.info('Database initialised', { path: DB_PATH });
  }
  return db;
}

function migrate(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      channel TEXT NOT NULL,
      contact TEXT NOT NULL DEFAULT '{}',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id TEXT NOT NULL REFERENCES sessions(id),
      role TEXT NOT NULL,
      text TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS audit_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id TEXT,
      event TEXT NOT NULL,
      detail TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_messages_session ON messages(session_id);
    CREATE INDEX IF NOT EXISTS idx_audit_session ON audit_log(session_id);
  `);
}

export function createSession(id, channel, contact) {
  const now = new Date().toISOString();
  getDb().prepare(
    'INSERT INTO sessions (id, channel, contact, created_at, updated_at) VALUES (?, ?, ?, ?, ?)'
  ).run(id, channel, JSON.stringify(contact), now, now);
  return { id, channel, contact, createdAt: now, updatedAt: now, transcript: [] };
}

export function getSession(id) {
  const row = getDb().prepare('SELECT * FROM sessions WHERE id = ?').get(id);
  if (!row) return null;
  const msgs = getDb().prepare(
    'SELECT role, text, created_at as at FROM messages WHERE session_id = ? ORDER BY id'
  ).all(id);
  return {
    id: row.id,
    channel: row.channel,
    contact: JSON.parse(row.contact),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    transcript: msgs,
  };
}

export function appendMessage(sessionId, role, text) {
  const now = new Date().toISOString();
  getDb().prepare(
    'INSERT INTO messages (session_id, role, text, created_at) VALUES (?, ?, ?, ?)'
  ).run(sessionId, role, text, now);
  getDb().prepare('UPDATE sessions SET updated_at = ? WHERE id = ?').run(now, sessionId);
}

export function logAudit(sessionId, event, detail) {
  getDb().prepare(
    'INSERT INTO audit_log (session_id, event, detail) VALUES (?, ?, ?)'
  ).run(sessionId, event, typeof detail === 'string' ? detail : JSON.stringify(detail));
}

export function closeDb() {
  if (db) { db.close(); db = null; }
}
