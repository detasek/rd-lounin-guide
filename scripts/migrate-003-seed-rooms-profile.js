const sqlite3 = require('sqlite3').verbose();

const DB_PATH = '/volume1/docker/rd-lounin-guide/data/db.sqlite';
const db = new sqlite3.Database(DB_PATH);

const rooms = [
  ['Zádveří', '1NP'],
  ['Technická místnost', '1NP'],
  ['WC', '1NP'],
  ['Koupelna', '1NP'],
  ['Kuchyň', '1NP'],
  ['Obývací pokoj', '1NP'],
  ['Ložnice', '2NP'],
  ['Dětský pokoj 1', '2NP'],
  ['Dětský pokoj 2', '2NP'],
  ['Koupelna', '2NP'],
  ['Chodba', '2NP'],
  ['Půda / technický prostor', '2NP'],
  ['Exteriér', 'EXT']
];

db.serialize(() => {
  const stmt = db.prepare(`
    INSERT INTO rooms (name, floor)
    SELECT ?, ?
    WHERE NOT EXISTS (
      SELECT 1 FROM rooms WHERE name = ? AND floor = ?
    )
  `);

  rooms.forEach(([name, floor]) => {
    stmt.run(name, floor, name, floor);
  });

  stmt.finalize();

  db.run(`
    INSERT INTO house_profile (
      id,
      name,
      notes
    )
    SELECT
      1,
      'RD Lounín',
      'Založeno automaticky ve Stage 1 jako základní profil domu.'
    WHERE NOT EXISTS (
      SELECT 1 FROM house_profile WHERE id = 1
    )
  `);
});

db.close();
console.log('OK: migration-003 rooms + house_profile done');
