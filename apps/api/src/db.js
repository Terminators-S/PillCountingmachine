const path = require('path');
const fs = require('fs');
const sqlite3 = require('sqlite3');
const { open } = require('sqlite');

const DATA_DIR = path.join(__dirname, '..', '..', '..', 'data');
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

const DB_PATH = path.join(DATA_DIR, 'pillcount.db');

async function hasColumn(db, tableName, columnName) {
  const columns = await db.all(`PRAGMA table_info(${tableName})`);
  return columns.some((column) => String(column.name).toLowerCase() === String(columnName).toLowerCase());
}

async function ensureColumn(db, tableName, columnDefinition) {
  const normalized = String(columnDefinition || '').trim();
  if (!normalized) return;

  const firstToken = normalized.split(/\s+/)[0];
  const columnName = String(firstToken || '').replace(/["'`]/g, '');
  if (!columnName) return;

  if (!(await hasColumn(db, tableName, columnName))) {
    await db.exec(`ALTER TABLE ${tableName} ADD COLUMN ${normalized}`);
  }
}

async function initDb() {
  const db = await open({
    filename: DB_PATH,
    driver: sqlite3.Database
  });

  await db.exec(`
    PRAGMA journal_mode = WAL;

    CREATE TABLE IF NOT EXISTS pill_types (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      code TEXT UNIQUE NOT NULL,
      name TEXT NOT NULL,
      dosage_mg INTEGER,
      manufacturer TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS machines (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      machine_id TEXT UNIQUE NOT NULL,
      location TEXT,
      status TEXT DEFAULT 'offline',
      firmware_version TEXT,
      last_seen INTEGER,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS pill_records (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      machine_id TEXT NOT NULL,
      pill_type_code TEXT NOT NULL,
      quantity INTEGER NOT NULL CHECK(quantity >= 0),
      count_mode TEXT DEFAULT 'auto',
      confidence REAL,
      status TEXT DEFAULT 'normal',
      timestamp INTEGER NOT NULL,
      lot_no TEXT,
      expiry_date TEXT,
      location TEXT,
      operator_id TEXT,
      session_id TEXT,
      source_event_id TEXT,
      idempotency_key TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(machine_id) REFERENCES machines(machine_id),
      FOREIGN KEY(pill_type_code) REFERENCES pill_types(code)
    );

    CREATE TABLE IF NOT EXISTS machine_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      machine_id TEXT NOT NULL,
      event_type TEXT NOT NULL,
      payload TEXT,
      timestamp INTEGER NOT NULL,
      event_id TEXT,
      sequence_no INTEGER,
      idempotency_key TEXT,
      received_at INTEGER,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(machine_id) REFERENCES machines(machine_id)
    );

    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT UNIQUE NOT NULL,
      display_name TEXT,
      email_verified INTEGER DEFAULT 0,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      last_login_at INTEGER
    );

    CREATE TABLE IF NOT EXISTS email_verification_codes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      code_hash TEXT NOT NULL,
      expires_at INTEGER NOT NULL,
      consumed_at INTEGER,
      created_at INTEGER NOT NULL,
      FOREIGN KEY(user_id) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS jobs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      job_id TEXT UNIQUE NOT NULL,
      machine_id TEXT NOT NULL,
      pill_type_code TEXT NOT NULL,
      lot_no TEXT,
      target_quantity INTEGER NOT NULL CHECK(target_quantity >= 0),
      actual_quantity INTEGER,
      operator_id TEXT,
      status TEXT NOT NULL DEFAULT 'planned',
      notes TEXT,
      created_at INTEGER NOT NULL,
      started_at INTEGER,
      completed_at INTEGER,
      FOREIGN KEY(machine_id) REFERENCES machines(machine_id),
      FOREIGN KEY(pill_type_code) REFERENCES pill_types(code)
    );

    CREATE TABLE IF NOT EXISTS inventory_transactions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      record_id INTEGER,
      machine_id TEXT NOT NULL,
      pill_type_code TEXT NOT NULL,
      lot_no TEXT,
      expiry_date TEXT,
      location TEXT,
      operator_id TEXT,
      quantity_delta INTEGER NOT NULL,
      transaction_type TEXT NOT NULL,
      source_event_id TEXT,
      timestamp INTEGER NOT NULL,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(record_id) REFERENCES pill_records(id)
    );

    CREATE TABLE IF NOT EXISTS event_idempotency (
      key TEXT PRIMARY KEY,
      resource_type TEXT NOT NULL,
      resource_id TEXT,
      status TEXT NOT NULL DEFAULT 'processed',
      error_message TEXT,
      created_at INTEGER NOT NULL
    );
  `);

  await ensureColumn(db, 'pill_records', 'lot_no TEXT');
  await ensureColumn(db, 'pill_records', 'expiry_date TEXT');
  await ensureColumn(db, 'pill_records', 'location TEXT');
  await ensureColumn(db, 'pill_records', 'operator_id TEXT');
  await ensureColumn(db, 'pill_records', 'session_id TEXT');
  await ensureColumn(db, 'pill_records', 'source_event_id TEXT');
  await ensureColumn(db, 'pill_records', 'idempotency_key TEXT');

  await ensureColumn(db, 'machine_events', 'event_id TEXT');
  await ensureColumn(db, 'machine_events', 'sequence_no INTEGER');
  await ensureColumn(db, 'machine_events', 'idempotency_key TEXT');
  await ensureColumn(db, 'machine_events', 'received_at INTEGER');

  await db.exec(`
    CREATE INDEX IF NOT EXISTS idx_machine_last_seen ON machines(last_seen DESC);
    CREATE INDEX IF NOT EXISTS idx_records_timestamp ON pill_records(timestamp DESC);
    CREATE INDEX IF NOT EXISTS idx_records_machine ON pill_records(machine_id, timestamp DESC);
    CREATE INDEX IF NOT EXISTS idx_records_pill_type ON pill_records(pill_type_code, timestamp DESC);
    CREATE INDEX IF NOT EXISTS idx_events_timestamp ON machine_events(timestamp DESC);
    CREATE INDEX IF NOT EXISTS idx_events_machine ON machine_events(machine_id, timestamp DESC);
    CREATE INDEX IF NOT EXISTS idx_jobs_created ON jobs(created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_inventory_transactions_time ON inventory_transactions(timestamp DESC);
    CREATE UNIQUE INDEX IF NOT EXISTS idx_records_idempotency ON pill_records(idempotency_key) WHERE idempotency_key IS NOT NULL;
    CREATE UNIQUE INDEX IF NOT EXISTS idx_machine_event_unique_event ON machine_events(machine_id, event_id) WHERE event_id IS NOT NULL;
  `);

  return db;
}

module.exports = {
  initDb
};
