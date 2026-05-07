const express = require('express');
const db = require('../db/db');

const router = express.Router();

const DEFAULT_INSPECTION_PERSON = 'Ing. Hana Konvalinková';
const WEATHER_LAT = Number(process.env.RD_WEATHER_LAT || 49.9498);
const WEATHER_LON = Number(process.env.RD_WEATHER_LON || 14.0345);

const INSPECTION_STATUS = {
  none: { label: 'Bez kontroly', severity: 0 },
  ok: { label: 'Stavba probíhá dle očekávání, bez zjištěných závad.', severity: 1 },
  remarks: { label: 'Stavba může pokračovat, eviduji připomínky k dořešení.', severity: 2 },
  verify: { label: 'Nutné ověření projektantem, statikem, revizním technikem nebo stavebním dozorem.', severity: 2 },
  serious: { label: 'Zjištěna vážná závada. Doporučuji nepokračovat v navazujících pracích do vyřešení.', severity: 3 }
};

db.serialize(() => {
  db.run(`
    CREATE TABLE IF NOT EXISTS diary (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      entry_date TEXT NOT NULL DEFAULT (date('now')),
      content TEXT NOT NULL,
      product_id INTEGER,
      phase_id INTEGER,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  [
    ['time_from', 'TEXT'],
    ['time_to', 'TEXT'],
    ['weather_summary', 'TEXT'],
    ['temperature_avg', 'REAL'],
    ['weather_source', 'TEXT'],
    ['inspection_present', 'INTEGER DEFAULT 0'],
    ['inspection_person', 'TEXT'],
    ['inspection_status', "TEXT DEFAULT 'none'"],
    ['inspection_summary', 'TEXT'],
    ['inspection_notes', 'TEXT'],
    ['created_by_user_id', 'INTEGER']
  ].forEach(([column, definition]) => {
    db.run(`ALTER TABLE diary ADD COLUMN ${column} ${definition}`, (err) => {
      if (err && !String(err.message || '').includes('duplicate column name')) {
        console.error(`[diary] migration ${column}:`, err.message);
      }
    });
  });

  db.run(`
    CREATE TABLE IF NOT EXISTS diary_entry_links (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      diary_id INTEGER NOT NULL,
      entity_type TEXT NOT NULL,
      entity_id INTEGER NOT NULL,
      link_reason TEXT DEFAULT 'manual',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(diary_id, entity_type, entity_id)
    )
  `);
});

function safeDate(value) {
  const text = String(value || '').trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : new Date().toISOString().slice(0, 10);
}

function safeTime(value) {
  const text = String(value || '').trim();
  return /^\d{2}:\d{2}$/.test(text) ? text : null;
}

function normalizeInspectionStatus(value) {
  const status = String(value || 'none').trim();
  return INSPECTION_STATUS[status] ? status : 'none';
}

function normalizeNotes(value) {
  if (Array.isArray(value)) return value.map((item) => String(item || '').trim()).filter(Boolean);
  return String(value || '')
    .split(/\r?\n/)
    .map((line) => line.replace(/^[-*]\s*/, '').trim())
    .filter(Boolean);
}

function buildContent(baseContent, inspectionPresent, inspectionPerson, inspectionStatus, notes) {
  const parts = [];
  const cleanContent = String(baseContent || '').trim();
  if (cleanContent) parts.push(cleanContent);

  if (inspectionPresent) {
    const status = INSPECTION_STATUS[inspectionStatus] || INSPECTION_STATUS.none;
    const block = [
      `Stavební dozor: ${inspectionPerson || DEFAULT_INSPECTION_PERSON}`,
      `Výsledek kontroly: ${status.label}`
    ];

    if (notes.length) {
      block.push('', 'Připomínky:');
      notes.forEach((note) => block.push(`- ${note}`));
    }

    parts.push(block.join('\n'));
  }

  return parts.join('\n\n').trim();
}

function classifyWeather(codes, windSpeeds) {
  const maxWind = Math.max(0, ...windSpeeds.map(Number).filter(Number.isFinite));
  if (maxWind >= 35) return 'vetrno';
  if (codes.some((code) => [51, 53, 55, 61, 63, 65, 80, 81, 82, 95, 96, 99].includes(Number(code)))) return 'dest';
  if (codes.some((code) => [2, 3, 45, 48].includes(Number(code)))) return 'zatazeno';
  return 'slunecno';
}

async function fetchWeather(date, timeFrom, timeTo) {
  const fromHour = Number(String(timeFrom || '08:00').slice(0, 2));
  const toHour = Number(String(timeTo || '18:00').slice(0, 2));
  const startHour = Math.max(0, Math.min(fromHour, toHour));
  const endHour = Math.min(23, Math.max(fromHour, toHour));
  const params = new URLSearchParams({
    latitude: String(WEATHER_LAT),
    longitude: String(WEATHER_LON),
    hourly: 'temperature_2m,weather_code,wind_speed_10m',
    timezone: 'Europe/Prague',
    start_date: date,
    end_date: date
  });

  const response = await fetch(`https://api.open-meteo.com/v1/forecast?${params.toString()}`);
  if (!response.ok) throw new Error(`weather_http_${response.status}`);
  const data = await response.json();
  const hourly = data.hourly || {};
  const points = (hourly.time || [])
    .map((time, index) => ({
      time,
      hour: Number(String(time).slice(11, 13)),
      temp: Number(hourly.temperature_2m?.[index]),
      code: Number(hourly.weather_code?.[index]),
      wind: Number(hourly.wind_speed_10m?.[index])
    }))
    .filter((point) => point.time?.startsWith(date) && point.hour >= startHour && point.hour <= endHour);

  if (!points.length) throw new Error('weather_no_hourly_data');

  const temperatures = points.map((point) => point.temp).filter(Number.isFinite);
  const avgTemp = temperatures.length
    ? Math.round((temperatures.reduce((sum, value) => sum + value, 0) / temperatures.length) * 10) / 10
    : null;

  return {
    date,
    time_from: timeFrom,
    time_to: timeTo,
    weather_summary: classifyWeather(points.map((point) => point.code), points.map((point) => point.wind)),
    temperature_avg: avgTemp,
    weather_source: 'open-meteo',
    latitude: WEATHER_LAT,
    longitude: WEATHER_LON
  };
}

router.get('/diary/weather', async (req, res) => {
  try {
    const date = safeDate(req.query.date);
    const timeFrom = safeTime(req.query.time_from) || '08:00';
    const timeTo = safeTime(req.query.time_to) || '18:00';
    res.json(await fetchWeather(date, timeFrom, timeTo));
  } catch (err) {
    res.status(502).json({ error: err.message || 'weather_failed' });
  }
});

router.get('/diary/calendar', (req, res) => {
  const year = Number(req.query.year || new Date().getFullYear());
  if (!Number.isInteger(year) || year < 2020 || year > 2035) {
    return res.status(400).json({ error: 'invalid_year' });
  }

  db.all(
    `
      SELECT entry_date, COUNT(*) AS diary_count,
        SUM(CASE WHEN inspection_present = 1 THEN 1 ELSE 0 END) AS inspection_count,
        MAX(CASE inspection_status
          WHEN 'serious' THEN 3
          WHEN 'remarks' THEN 2
          WHEN 'verify' THEN 2
          WHEN 'ok' THEN 1
          ELSE 0
        END) AS inspection_severity
      FROM diary
      WHERE entry_date >= ? AND entry_date <= ?
      GROUP BY entry_date
      ORDER BY entry_date ASC
    `,
    [`${year}-01-01`, `${year}-12-31`],
    (err, rows) => {
      if (err) return res.status(500).json({ error: err.message });
      res.json((rows || []).map((row) => ({
        date: row.entry_date,
        diary_count: Number(row.diary_count || 0),
        inspection_count: Number(row.inspection_count || 0),
        inspection_status: Number(row.inspection_severity || 0) >= 3
          ? 'serious'
          : Number(row.inspection_severity || 0) === 2
            ? 'remarks'
            : Number(row.inspection_severity || 0) === 1
              ? 'ok'
              : 'none'
      })));
    }
  );
});

router.get('/diary', (req, res) => {
  db.all(
    `
      SELECT *
      FROM diary
      ORDER BY entry_date DESC, id DESC
    `,
    [],
    (err, rows) => {
      if (err) return res.status(500).json({ error: err.message });
      res.json(rows || []);
    }
  );
});

router.get('/diary/:id/links', (req, res) => {
  const diaryId = Number(req.params.id);
  if (!Number.isInteger(diaryId)) return res.status(400).json({ error: 'invalid_diary_id' });

  db.get(`SELECT * FROM diary WHERE id = ?`, [diaryId], (diaryErr, diary) => {
    if (diaryErr) return res.status(500).json({ error: diaryErr.message });
    if (!diary) return res.status(404).json({ error: 'diary_not_found' });

    const result = { links: [], suggested: { receipts: [], documents: [], photos: [] } };
    db.all(`SELECT * FROM diary_entry_links WHERE diary_id = ? ORDER BY created_at DESC`, [diaryId], (linksErr, links) => {
      if (linksErr) return res.status(500).json({ error: linksErr.message });
      result.links = links || [];

      db.all(`SELECT * FROM receipts WHERE purchase_date = ? ORDER BY id DESC`, [diary.entry_date], (receiptErr, receipts) => {
        if (receiptErr) return res.status(500).json({ error: receiptErr.message });
        result.suggested.receipts = receipts || [];

        db.all(`SELECT * FROM documents WHERE date(created_at) = ? ORDER BY id DESC`, [diary.entry_date], (docErr, documents) => {
          if (docErr) return res.status(500).json({ error: docErr.message });
          result.suggested.documents = documents || [];

          db.all(`SELECT * FROM photos WHERE date(created_at) = ? ORDER BY id DESC`, [diary.entry_date], (photoErr, photos) => {
            if (photoErr) return res.status(500).json({ error: photoErr.message });
            result.suggested.photos = photos || [];
            res.json(result);
          });
        });
      });
    });
  });
});

router.post('/diary/:id/links', (req, res) => {
  const diaryId = Number(req.params.id);
  const body = req.body || {};
  const entityType = String(body.entity_type || '').trim();
  const entityId = Number(body.entity_id);
  const linkReason = String(body.link_reason || 'manual').trim();
  const allowedTypes = new Set(['receipt', 'document', 'photo', 'product']);

  if (!Number.isInteger(diaryId) || !allowedTypes.has(entityType) || !Number.isInteger(entityId)) {
    return res.status(400).json({ error: 'invalid_link' });
  }

  db.run(
    `
      INSERT OR IGNORE INTO diary_entry_links (diary_id, entity_type, entity_id, link_reason)
      VALUES (?, ?, ?, ?)
    `,
    [diaryId, entityType, entityId, linkReason],
    function (err) {
      if (err) return res.status(500).json({ error: err.message });
      res.status(201).json({ success: true, id: this.lastID || null });
    }
  );
});

router.post('/diary', (req, res) => {
  const body = req.body || {};
  const entryDate = safeDate(body.entry_date);
  const timeFrom = safeTime(body.time_from);
  const timeTo = safeTime(body.time_to);
  const productId = body.product_id || null;
  const phaseId = body.phase_id || null;
  const inspectionPresent = body.inspection_present ? 1 : 0;
  const inspectionPerson = String(body.inspection_person || DEFAULT_INSPECTION_PERSON).trim();
  const inspectionStatus = inspectionPresent ? normalizeInspectionStatus(body.inspection_status) : 'none';
  const inspectionNotes = normalizeNotes(body.inspection_notes);
  const inspectionSummary = INSPECTION_STATUS[inspectionStatus]?.label || null;
  const content = buildContent(body.content, inspectionPresent, inspectionPerson, inspectionStatus, inspectionNotes);
  const temperatureAvg = body.temperature_avg === '' || body.temperature_avg === undefined || body.temperature_avg === null
    ? null
    : Number(body.temperature_avg);

  if (!content) {
    return res.status(400).json({ error: 'content_required' });
  }

  db.run(
    `
      INSERT INTO diary (
        entry_date, content, product_id, phase_id, time_from, time_to,
        weather_summary, temperature_avg, weather_source,
        inspection_present, inspection_person, inspection_status, inspection_summary, inspection_notes
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
    [
      entryDate,
      content,
      productId,
      phaseId,
      timeFrom,
      timeTo,
      body.weather_summary || null,
      Number.isFinite(temperatureAvg) ? temperatureAvg : null,
      body.weather_source || null,
      inspectionPresent,
      inspectionPerson,
      inspectionStatus,
      inspectionSummary,
      JSON.stringify(inspectionNotes)
    ],
    function (err) {
      if (err) return res.status(500).json({ error: err.message });

      db.get('SELECT * FROM diary WHERE id = ?', [this.lastID], (getErr, row) => {
        if (getErr) return res.status(500).json({ error: getErr.message });
        res.status(201).json(row);
      });
    }
  );
});

router.delete('/diary/:id', (req, res) => {
  const diaryId = Number(req.params.id);
  if (!Number.isInteger(diaryId)) return res.status(400).json({ error: 'invalid_diary_id' });

  db.serialize(() => {
    db.run(`DELETE FROM diary_entry_links WHERE diary_id = ?`, [diaryId]);
    db.run(`DELETE FROM diary WHERE id = ?`, [diaryId], function (err) {
      if (err) return res.status(500).json({ error: err.message });
      if (!this.changes) return res.status(404).json({ error: 'diary_not_found' });
      res.json({ success: true });
    });
  });
});

module.exports = router;
