const sqlite3 = require('sqlite3').verbose();

const db = new sqlite3.Database('/volume1/docker/rd-lounin-guide/data/db.sqlite');

const phases = [
  "Příprava pozemku",
  "Základy",
  "Základová deska",
  "Svislé konstrukce",
  "Stropy",
  "Střecha",
  "Okna a dveře",
  "Fasáda",
  "Elektroinstalace",
  "Voda a odpady",
  "Vytápění",
  "Podlahy",
  "Omítky",
  "Interiér",
  "Exteriér",
  "Dokončovací práce"
];

db.serialize(() => {

  const stmt = db.prepare(`
    INSERT INTO phases (name, sort_order)
    VALUES (?, ?)
  `);

  phases.forEach((name, index) => {
    stmt.run(name, index);
  });

  stmt.finalize();

});

db.close();

console.log("OK: phases seeded");
