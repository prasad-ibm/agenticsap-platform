require('dotenv').config();
const express = require('express');
const { Pool } = require('pg');
const path = require('path');
const { randomUUID } = require('crypto');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static(path.join(__dirname), {
  setHeaders(res, filePath) {
    if (filePath.endsWith('.css') || filePath.endsWith('.js')) {
      res.setHeader('Cache-Control', 'public, max-age=60, must-revalidate');
    }
  }
}));

// ── DATABASE ───────────────────────────────────────────────────────────────
let pool = null;

if (process.env.DATABASE_URL) {
  pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.DATABASE_URL.includes('.railway.internal') ? false
       : process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
  });
}

async function initDB() {
  if (!pool) return;
  await pool.query(`
    CREATE TABLE IF NOT EXISTS compass_assessments (
      id          TEXT PRIMARY KEY,
      name        TEXT NOT NULL,
      company     TEXT DEFAULT '',
      sap_version TEXT DEFAULT '',
      created_at  TIMESTAMPTZ DEFAULT NOW(),
      updated_at  TIMESTAMPTZ DEFAULT NOW()
    )
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS compass_modules (
      id                SERIAL PRIMARY KEY,
      assessment_id     TEXT NOT NULL REFERENCES compass_assessments(id) ON DELETE CASCADE,
      module_code       TEXT NOT NULL,
      module_name       TEXT NOT NULL,
      axis_platform     NUMERIC(3,1) DEFAULT 0,
      axis_custom_code  NUMERIC(3,1) DEFAULT 0,
      axis_data         NUMERIC(3,1) DEFAULT 0,
      axis_integration  NUMERIC(3,1) DEFAULT 0,
      axis_ux           NUMERIC(3,1) DEFAULT 0,
      axis_process      NUMERIC(3,1) DEFAULT 0,
      axis_ai_readiness NUMERIC(3,1) DEFAULT 0,
      axis_compliance   NUMERIC(3,1) DEFAULT 0,
      notes             TEXT DEFAULT '',
      updated_at        TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE(assessment_id, module_code)
    )
  `);
  console.log('✅ AgenticSAP database ready');
}

function dbRequired(req, res, next) {
  if (!pool) return res.status(503).json({ error: 'DATABASE_URL not configured' });
  next();
}

// ── COMPASS API ────────────────────────────────────────────────────────────

// List all assessments
app.get('/api/compass/assessments', dbRequired, async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT a.*, COUNT(m.id)::int AS module_count
       FROM compass_assessments a
       LEFT JOIN compass_modules m ON m.assessment_id = a.id
       GROUP BY a.id ORDER BY a.updated_at DESC`
    );
    res.json(rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Create assessment
app.post('/api/compass/assessments', dbRequired, async (req, res) => {
  const { name, company, sap_version } = req.body;
  if (!name) return res.status(400).json({ error: 'name required' });
  try {
    const id = randomUUID();
    const { rows } = await pool.query(
      `INSERT INTO compass_assessments(id, name, company, sap_version)
       VALUES($1,$2,$3,$4) RETURNING *`,
      [id, name, company || '', sap_version || '']
    );
    res.json(rows[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Get single assessment with all module scores
app.get('/api/compass/assessments/:id', dbRequired, async (req, res) => {
  try {
    const { rows: [assessment] } = await pool.query(
      'SELECT * FROM compass_assessments WHERE id=$1', [req.params.id]
    );
    if (!assessment) return res.status(404).json({ error: 'Not found' });
    const { rows: modules } = await pool.query(
      'SELECT * FROM compass_modules WHERE assessment_id=$1 ORDER BY module_code',
      [req.params.id]
    );
    res.json({ ...assessment, modules });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Upsert module scores
app.put('/api/compass/assessments/:id/modules/:code', dbRequired, async (req, res) => {
  const { id, code } = req.params;
  const {
    module_name,
    axis_platform, axis_custom_code, axis_data, axis_integration,
    axis_ux, axis_process, axis_ai_readiness, axis_compliance,
    notes
  } = req.body;
  try {
    const { rows } = await pool.query(
      `INSERT INTO compass_modules
         (assessment_id, module_code, module_name,
          axis_platform, axis_custom_code, axis_data, axis_integration,
          axis_ux, axis_process, axis_ai_readiness, axis_compliance, notes)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
       ON CONFLICT (assessment_id, module_code) DO UPDATE SET
         module_name       = EXCLUDED.module_name,
         axis_platform     = EXCLUDED.axis_platform,
         axis_custom_code  = EXCLUDED.axis_custom_code,
         axis_data         = EXCLUDED.axis_data,
         axis_integration  = EXCLUDED.axis_integration,
         axis_ux           = EXCLUDED.axis_ux,
         axis_process      = EXCLUDED.axis_process,
         axis_ai_readiness = EXCLUDED.axis_ai_readiness,
         axis_compliance   = EXCLUDED.axis_compliance,
         notes             = EXCLUDED.notes,
         updated_at        = NOW()
       RETURNING *`,
      [id, code, module_name,
       axis_platform || 0, axis_custom_code || 0, axis_data || 0, axis_integration || 0,
       axis_ux || 0, axis_process || 0, axis_ai_readiness || 0, axis_compliance || 0,
       notes || '']
    );
    await pool.query(
      'UPDATE compass_assessments SET updated_at=NOW() WHERE id=$1', [id]
    );
    res.json(rows[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Delete assessment
app.delete('/api/compass/assessments/:id', dbRequired, async (req, res) => {
  try {
    await pool.query('DELETE FROM compass_assessments WHERE id=$1', [req.params.id]);
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── SPA FALLBACK ───────────────────────────────────────────────────────────
app.get('/{*path}', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

// ── BOOT ───────────────────────────────────────────────────────────────────
(async () => {
  try { await initDB(); } catch (e) { console.error('DB init failed:', e.message); }
  app.listen(PORT, () => console.log(`AgenticSAP running on port ${PORT}`));
})();
