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

function sslConfig(url) {
  if (!url) return false;
  if (url.includes('localhost') || url.includes('127.0.0.1')) return false;
  if (url.includes('.railway.internal')) return false; // private networking — no SSL
  return { rejectUnauthorized: false };               // Railway public URL / other cloud
}

let pool = null;

if (process.env.DATABASE_URL) {
  pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: sslConfig(process.env.DATABASE_URL),
    max: 10,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 5000,
  });
  pool.on('error', (err) => {
    console.error('Unexpected pool client error:', err.message);
  });
}

async function initDB() {
  if (!pool) return;

  await pool.query(`
    CREATE TABLE IF NOT EXISTS compass_assessments (
      id             TEXT PRIMARY KEY,
      name           TEXT NOT NULL,
      company        TEXT NOT NULL DEFAULT '',
      sap_version    TEXT NOT NULL DEFAULT '',
      contact_name   TEXT NOT NULL DEFAULT '',
      contact_title  TEXT NOT NULL DEFAULT '',
      contact_email  TEXT NOT NULL DEFAULT '',
      created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  // Migrate existing tables — add contact columns if absent
  await pool.query(`ALTER TABLE compass_assessments ADD COLUMN IF NOT EXISTS contact_name  TEXT NOT NULL DEFAULT ''`);
  await pool.query(`ALTER TABLE compass_assessments ADD COLUMN IF NOT EXISTS contact_title TEXT NOT NULL DEFAULT ''`);
  await pool.query(`ALTER TABLE compass_assessments ADD COLUMN IF NOT EXISTS contact_email TEXT NOT NULL DEFAULT ''`);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS compass_modules (
      id                SERIAL PRIMARY KEY,
      assessment_id     TEXT NOT NULL REFERENCES compass_assessments(id) ON DELETE CASCADE,
      module_code       TEXT NOT NULL,
      module_name       TEXT NOT NULL DEFAULT '',
      axis_platform     NUMERIC(3,1) NOT NULL DEFAULT 0,
      axis_custom_code  NUMERIC(3,1) NOT NULL DEFAULT 0,
      axis_data         NUMERIC(3,1) NOT NULL DEFAULT 0,
      axis_integration  NUMERIC(3,1) NOT NULL DEFAULT 0,
      axis_ux           NUMERIC(3,1) NOT NULL DEFAULT 0,
      axis_process      NUMERIC(3,1) NOT NULL DEFAULT 0,
      axis_ai_readiness NUMERIC(3,1) NOT NULL DEFAULT 0,
      axis_compliance   NUMERIC(3,1) NOT NULL DEFAULT 0,
      notes             TEXT NOT NULL DEFAULT '',
      updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE(assessment_id, module_code)
    )
  `);

  // Indexes — idempotent
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_assessments_updated ON compass_assessments(updated_at DESC)`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_modules_assessment  ON compass_modules(assessment_id)`);

  console.log('✅ AgenticSAP database ready');
}

function dbRequired(req, res, next) {
  if (!pool) {
    return res.status(503).json({
      error: 'DATABASE_URL not configured',
      hint: 'Add a PostgreSQL service in your Railway project. DATABASE_URL is injected automatically once the service is attached.',
    });
  }
  next();
}

// ── HEALTH ─────────────────────────────────────────────────────────────────

app.get('/api/health', async (req, res) => {
  if (!pool) {
    return res.json({
      status: 'degraded',
      db: false,
      hint: 'Add a PostgreSQL service in your Railway project and redeploy.',
    });
  }
  try {
    const { rows: [{ ts }] } = await pool.query('SELECT NOW() AS ts');
    const { rows: tables }   = await pool.query(`
      SELECT table_name
      FROM   information_schema.tables
      WHERE  table_schema = 'public'
        AND  table_name   IN ('compass_assessments', 'compass_modules')
      ORDER  BY table_name
    `);
    res.json({
      status: 'ok',
      db: true,
      db_time: ts,
      tables: tables.map(t => t.table_name),
    });
  } catch (err) {
    res.status(500).json({ status: 'error', db: false, error: err.message });
  }
});

// ── COMPASS API ────────────────────────────────────────────────────────────

// List all assessments
app.get('/api/compass/assessments', dbRequired, async (req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT a.*, COUNT(m.id)::int AS module_count
      FROM   compass_assessments a
      LEFT JOIN compass_modules m ON m.assessment_id = a.id
      GROUP  BY a.id
      ORDER  BY a.updated_at DESC
    `);
    res.json(rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Create assessment
app.post('/api/compass/assessments', dbRequired, async (req, res) => {
  const name          = (req.body.name || '').trim();
  const company       = (req.body.company || '').trim();
  const sap_version   = (req.body.sap_version || '').trim();
  const contact_name  = (req.body.contact_name || '').trim();
  const contact_title = (req.body.contact_title || '').trim();
  const contact_email = (req.body.contact_email || '').trim();

  if (!name) return res.status(400).json({ error: 'Assessment name is required.' });
  if (name.length > 200) return res.status(400).json({ error: 'Name must be 200 characters or fewer.' });

  try {
    const id = randomUUID();
    const { rows } = await pool.query(
      `INSERT INTO compass_assessments(id, name, company, sap_version, contact_name, contact_title, contact_email)
       VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
      [id, name, company, sap_version, contact_name, contact_title, contact_email]
    );
    res.json(rows[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Get single assessment with all module scores
app.get('/api/compass/assessments/:id', dbRequired, async (req, res) => {
  try {
    const { rows: [assessment] } = await pool.query(
      'SELECT * FROM compass_assessments WHERE id=$1',
      [req.params.id]
    );
    if (!assessment) return res.status(404).json({ error: 'Assessment not found.' });

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

  // Validate axis values are in range
  const axisKeys = ['axis_platform','axis_custom_code','axis_data','axis_integration',
                    'axis_ux','axis_process','axis_ai_readiness','axis_compliance'];
  const vals = {};
  for (const k of axisKeys) {
    const v = parseFloat(req.body[k] ?? 0);
    if (isNaN(v) || v < 0 || v > 5) return res.status(400).json({ error: `${k} must be a number between 0 and 5.` });
    vals[k] = v;
  }

  const module_name = (req.body.module_name || code).trim();
  const notes       = (req.body.notes || '').trim();

  try {
    // Verify assessment exists
    const { rowCount } = await pool.query(
      'SELECT 1 FROM compass_assessments WHERE id=$1', [id]
    );
    if (!rowCount) return res.status(404).json({ error: 'Assessment not found.' });

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
       vals.axis_platform, vals.axis_custom_code, vals.axis_data, vals.axis_integration,
       vals.axis_ux, vals.axis_process, vals.axis_ai_readiness, vals.axis_compliance,
       notes]
    );
    await pool.query('UPDATE compass_assessments SET updated_at=NOW() WHERE id=$1', [id]);
    res.json(rows[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Client summary — all assessments with avg scores, grouped for the summary page
app.get('/api/compass/summary', dbRequired, async (req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT
        a.id, a.name, a.company, a.sap_version,
        a.contact_name, a.contact_title, a.contact_email,
        a.created_at, a.updated_at,
        COUNT(m.id)::int AS module_count,
        ROUND(AVG(
          (m.axis_platform + m.axis_custom_code + m.axis_data + m.axis_integration +
           m.axis_ux + m.axis_process + m.axis_ai_readiness + m.axis_compliance) / 8.0
        )::numeric, 1) AS avg_score,
        MIN(m.axis_ai_readiness) AS min_ai_readiness
      FROM compass_assessments a
      LEFT JOIN compass_modules m ON m.assessment_id = a.id
      GROUP BY a.id
      ORDER BY a.updated_at DESC
    `);
    res.json(rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Delete assessment
app.delete('/api/compass/assessments/:id', dbRequired, async (req, res) => {
  try {
    const { rowCount } = await pool.query(
      'DELETE FROM compass_assessments WHERE id=$1', [req.params.id]
    );
    if (!rowCount) return res.status(404).json({ error: 'Assessment not found.' });
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── SPA FALLBACK ───────────────────────────────────────────────────────────
app.get('/{*path}', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

// ── BOOT ───────────────────────────────────────────────────────────────────
(async () => {
  try {
    await initDB();
  } catch (e) {
    console.error('DB init failed:', e.message);
    console.error('The app will start but database features will be unavailable.');
  }
  app.listen(PORT, () => console.log(`AgenticSAP running on port ${PORT}`));
})();
