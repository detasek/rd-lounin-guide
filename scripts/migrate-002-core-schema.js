const sqlite3 = require('sqlite3').verbose();

const DB_PATH = '/volume1/docker/rd-lounin-guide/data/db.sqlite';
const db = new sqlite3.Database(DB_PATH);

db.serialize(() => {
  db.run(`PRAGMA foreign_keys = ON`);

  db.run(`CREATE TABLE IF NOT EXISTS rooms (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    floor TEXT,
    description TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS products (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    description TEXT,
    phase_id INTEGER,
    room_id INTEGER,
    vendor TEXT,
    manufacturer TEXT,
    model TEXT,
    serial_number TEXT,
    purchase_date DATE,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (phase_id) REFERENCES phases(id) ON DELETE SET NULL,
    FOREIGN KEY (room_id) REFERENCES rooms(id) ON DELETE SET NULL
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS documents (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    file_path TEXT NOT NULL,
    file_type TEXT,
    category TEXT,
    phase_id INTEGER,
    room_id INTEGER,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (phase_id) REFERENCES phases(id) ON DELETE SET NULL,
    FOREIGN KEY (room_id) REFERENCES rooms(id) ON DELETE SET NULL
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS photos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    file_path TEXT NOT NULL,
    thumbnail_path TEXT,
    title TEXT,
    description TEXT,
    taken_at DATETIME,
    phase_id INTEGER,
    room_id INTEGER,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (phase_id) REFERENCES phases(id) ON DELETE SET NULL,
    FOREIGN KEY (room_id) REFERENCES rooms(id) ON DELETE SET NULL
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS notes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT,
    body TEXT NOT NULL,
    phase_id INTEGER,
    room_id INTEGER,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (phase_id) REFERENCES phases(id) ON DELETE SET NULL,
    FOREIGN KEY (room_id) REFERENCES rooms(id) ON DELETE SET NULL
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS diary (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    entry_date TEXT NOT NULL DEFAULT (date('now')),
    content TEXT NOT NULL,
    product_id INTEGER,
    phase_id INTEGER,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE SET NULL,
    FOREIGN KEY (phase_id) REFERENCES phases(id) ON DELETE SET NULL
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS work_sessions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    start_time DATETIME NOT NULL,
    end_time DATETIME,
    duration_minutes INTEGER,
    weather TEXT,
    temperature_c REAL,
    needs_weather_update INTEGER DEFAULT 0,
    notes TEXT,
    linked_phase_id INTEGER,
    linked_room_id INTEGER,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (linked_phase_id) REFERENCES phases(id) ON DELETE SET NULL,
    FOREIGN KEY (linked_room_id) REFERENCES rooms(id) ON DELETE SET NULL
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS work_session_products (
    session_id INTEGER NOT NULL,
    product_id INTEGER NOT NULL,
    PRIMARY KEY (session_id, product_id),
    FOREIGN KEY (session_id) REFERENCES work_sessions(id) ON DELETE CASCADE,
    FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS receipts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    file_path TEXT NOT NULL,
    vendor TEXT,
    date DATE,
    total REAL,
    tax REAL,
    status TEXT DEFAULT 'pending_review',
    ocr_status TEXT DEFAULT 'not_processed',
    ocr_raw_json TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS receipt_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    receipt_id INTEGER NOT NULL,
    name TEXT NOT NULL,
    quantity REAL,
    unit TEXT,
    unit_price REAL,
    total REAL,
    vat_rate REAL,
    product_id INTEGER,
    budget_item_id INTEGER,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (receipt_id) REFERENCES receipts(id) ON DELETE CASCADE,
    FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE SET NULL
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS warranties (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    product_id INTEGER,
    receipt_id INTEGER,
    purchase_date DATE,
    warranty_months INTEGER,
    warranty_end DATE,
    notified_30_days INTEGER DEFAULT 0,
    notified_7_days INTEGER DEFAULT 0,
    notes TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE SET NULL,
    FOREIGN KEY (receipt_id) REFERENCES receipts(id) ON DELETE SET NULL
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS budget_categories (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    parent_id INTEGER,
    sort_order INTEGER DEFAULT 0,
    source_sheet TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (parent_id) REFERENCES budget_categories(id) ON DELETE SET NULL
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS budget_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    category_id INTEGER,
    name TEXT NOT NULL,
    description TEXT,
    planned_quantity REAL,
    unit TEXT,
    planned_unit_price REAL,
    planned_total REAL,
    phase_id INTEGER,
    room_id INTEGER,
    source_sheet TEXT,
    source_row INTEGER,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (category_id) REFERENCES budget_categories(id) ON DELETE SET NULL,
    FOREIGN KEY (phase_id) REFERENCES phases(id) ON DELETE SET NULL,
    FOREIGN KEY (room_id) REFERENCES rooms(id) ON DELETE SET NULL
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS budget_expenses (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    budget_item_id INTEGER,
    receipt_id INTEGER,
    receipt_item_id INTEGER,
    product_id INTEGER,
    real_quantity REAL,
    unit TEXT,
    real_total REAL,
    paid_at DATE,
    notes TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (budget_item_id) REFERENCES budget_items(id) ON DELETE SET NULL,
    FOREIGN KEY (receipt_id) REFERENCES receipts(id) ON DELETE SET NULL,
    FOREIGN KEY (receipt_item_id) REFERENCES receipt_items(id) ON DELETE SET NULL,
    FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE SET NULL
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS product_documents (
    product_id INTEGER NOT NULL,
    document_id INTEGER NOT NULL,
    PRIMARY KEY (product_id, document_id),
    FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE,
    FOREIGN KEY (document_id) REFERENCES documents(id) ON DELETE CASCADE
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS product_receipts (
    product_id INTEGER NOT NULL,
    receipt_id INTEGER NOT NULL,
    PRIMARY KEY (product_id, receipt_id),
    FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE,
    FOREIGN KEY (receipt_id) REFERENCES receipts(id) ON DELETE CASCADE
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS product_notes (
    product_id INTEGER NOT NULL,
    note_id INTEGER NOT NULL,
    PRIMARY KEY (product_id, note_id),
    FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE,
    FOREIGN KEY (note_id) REFERENCES notes(id) ON DELETE CASCADE
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS product_photos (
    product_id INTEGER NOT NULL,
    photo_id INTEGER NOT NULL,
    PRIMARY KEY (product_id, photo_id),
    FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE,
    FOREIGN KEY (photo_id) REFERENCES photos(id) ON DELETE CASCADE
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS product_budget_items (
    product_id INTEGER NOT NULL,
    budget_item_id INTEGER NOT NULL,
    PRIMARY KEY (product_id, budget_item_id),
    FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE,
    FOREIGN KEY (budget_item_id) REFERENCES budget_items(id) ON DELETE CASCADE
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS product_budget_expenses (
    product_id INTEGER NOT NULL,
    budget_expense_id INTEGER NOT NULL,
    PRIMARY KEY (product_id, budget_expense_id),
    FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE,
    FOREIGN KEY (budget_expense_id) REFERENCES budget_expenses(id) ON DELETE CASCADE
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS house_profile (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    name TEXT,
    address TEXT,
    gps TEXT,
    parcel_number TEXT,
    cadastre TEXT,
    area_m2 REAL,
    construction_system TEXT,
    heating_type TEXT,
    heat_source TEXT,
    notes TEXT,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  db.run(`CREATE INDEX IF NOT EXISTS idx_products_phase ON products(phase_id)`);
  db.run(`CREATE INDEX IF NOT EXISTS idx_products_room ON products(room_id)`);
  db.run(`CREATE INDEX IF NOT EXISTS idx_receipts_status ON receipts(status)`);
  db.run(`CREATE INDEX IF NOT EXISTS idx_warranties_end ON warranties(warranty_end)`);
  db.run(`CREATE INDEX IF NOT EXISTS idx_budget_items_category ON budget_items(category_id)`);
});

db.close();
console.log('OK: migration-002 core schema done');
