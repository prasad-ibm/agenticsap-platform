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
  if (url.includes('.railway.internal')) return false;
  return { rejectUnauthorized: false };
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

  // ── clients (admin-managed, created before assessments) ───────────────────
  await pool.query(`
    CREATE TABLE IF NOT EXISTS compass_clients (
      id            TEXT PRIMARY KEY,
      name          TEXT NOT NULL,
      contact_name  TEXT NOT NULL DEFAULT '',
      contact_title TEXT NOT NULL DEFAULT '',
      contact_email TEXT NOT NULL DEFAULT '',
      created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  // ── assessments (reference a client) ──────────────────────────────────────
  await pool.query(`
    CREATE TABLE IF NOT EXISTS compass_assessments (
      id               TEXT PRIMARY KEY,
      client_id        TEXT REFERENCES compass_clients(id) ON DELETE SET NULL,
      name             TEXT NOT NULL,
      sap_version      TEXT NOT NULL DEFAULT '',
      selected_modules TEXT[] NOT NULL DEFAULT '{}',
      created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  // ── migrate: add columns to old schema if absent ──────────────────────────
  await pool.query(`ALTER TABLE compass_assessments ADD COLUMN IF NOT EXISTS client_id        TEXT REFERENCES compass_clients(id) ON DELETE SET NULL`);
  await pool.query(`ALTER TABLE compass_assessments ADD COLUMN IF NOT EXISTS selected_modules TEXT[] NOT NULL DEFAULT '{}'`);

  // ── migrate: promote legacy company/contact rows into compass_clients ──────
  // Only runs if old columns exist and there are unlinked rows.
  const { rows: cols } = await pool.query(`
    SELECT column_name FROM information_schema.columns
    WHERE table_name = 'compass_assessments' AND column_name = 'company'
  `);
  if (cols.length > 0) {
    await pool.query(`
      INSERT INTO compass_clients (id, name, contact_name, contact_title, contact_email)
      SELECT DISTINCT ON (company)
        gen_random_uuid()::text, company,
        COALESCE(contact_name, ''), COALESCE(contact_title, ''), COALESCE(contact_email, '')
      FROM compass_assessments
      WHERE company IS NOT NULL AND company != '' AND client_id IS NULL
    `);
    await pool.query(`
      UPDATE compass_assessments a
      SET    client_id = c.id
      FROM   compass_clients c
      WHERE  c.name = a.company AND a.client_id IS NULL
    `);
  }

  // ── modules ────────────────────────────────────────────────────────────────
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

  await pool.query(`CREATE INDEX IF NOT EXISTS idx_clients_created    ON compass_clients(created_at DESC)`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_assessments_updated ON compass_assessments(updated_at DESC)`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_assessments_client  ON compass_assessments(client_id)`);
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
      SELECT table_name FROM information_schema.tables
      WHERE  table_schema = 'public'
        AND  table_name   IN ('compass_clients', 'compass_assessments', 'compass_modules')
      ORDER  BY table_name
    `);
    res.json({ status: 'ok', db: true, db_time: ts, tables: tables.map(t => t.table_name) });
  } catch (err) {
    res.status(500).json({ status: 'error', db: false, error: err.message });
  }
});

// ── CLIENTS API (admin) ────────────────────────────────────────────────────

// List all clients with assessment count + avg score
app.get('/api/compass/clients', dbRequired, async (req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT
        c.*,
        COUNT(DISTINCT a.id)::int AS assessment_count,
        ROUND(AVG(
          (m.axis_platform + m.axis_custom_code + m.axis_data + m.axis_integration +
           m.axis_ux + m.axis_process + m.axis_ai_readiness + m.axis_compliance) / 8.0
        )::numeric, 1) AS avg_score,
        MIN(m.axis_ai_readiness) AS min_ai_readiness,
        MAX(a.updated_at) AS last_updated
      FROM compass_clients c
      LEFT JOIN compass_assessments a ON a.client_id = c.id
      LEFT JOIN compass_modules m ON m.assessment_id = a.id
      GROUP BY c.id
      ORDER BY c.created_at DESC
    `);
    res.json(rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Create client
app.post('/api/compass/clients', dbRequired, async (req, res) => {
  const name          = (req.body.name || '').trim();
  const contact_name  = (req.body.contact_name || '').trim();
  const contact_title = (req.body.contact_title || '').trim();
  const contact_email = (req.body.contact_email || '').trim();

  if (!name) return res.status(400).json({ error: 'Company name is required.' });
  if (name.length > 200) return res.status(400).json({ error: 'Name must be 200 characters or fewer.' });

  try {
    const { rows } = await pool.query(
      `INSERT INTO compass_clients(id, name, contact_name, contact_title, contact_email)
       VALUES($1,$2,$3,$4,$5) RETURNING *`,
      [randomUUID(), name, contact_name, contact_title, contact_email]
    );
    res.json(rows[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Update client
app.put('/api/compass/clients/:id', dbRequired, async (req, res) => {
  const name          = (req.body.name || '').trim();
  const contact_name  = (req.body.contact_name || '').trim();
  const contact_title = (req.body.contact_title || '').trim();
  const contact_email = (req.body.contact_email || '').trim();

  if (!name) return res.status(400).json({ error: 'Company name is required.' });

  try {
    const { rows, rowCount } = await pool.query(
      `UPDATE compass_clients
       SET name=$2, contact_name=$3, contact_title=$4, contact_email=$5
       WHERE id=$1 RETURNING *`,
      [req.params.id, name, contact_name, contact_title, contact_email]
    );
    if (!rowCount) return res.status(404).json({ error: 'Client not found.' });
    res.json(rows[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Delete client
app.delete('/api/compass/clients/:id', dbRequired, async (req, res) => {
  try {
    const { rows: [{ cnt }] } = await pool.query(
      `SELECT COUNT(*)::int AS cnt FROM compass_assessments WHERE client_id=$1`, [req.params.id]
    );
    if (cnt > 0) return res.status(409).json({
      error: `Cannot delete — this client has ${cnt} assessment${cnt !== 1 ? 's' : ''}. Delete assessments first.`
    });
    const { rowCount } = await pool.query('DELETE FROM compass_clients WHERE id=$1', [req.params.id]);
    if (!rowCount) return res.status(404).json({ error: 'Client not found.' });
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── ASSESSMENTS API ────────────────────────────────────────────────────────

// List all assessments (with client info via JOIN)
app.get('/api/compass/assessments', dbRequired, async (req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT a.*, COUNT(m.id)::int AS module_count,
             c.name AS company, c.contact_name, c.contact_title, c.contact_email
      FROM   compass_assessments a
      LEFT JOIN compass_clients  c ON c.id = a.client_id
      LEFT JOIN compass_modules  m ON m.assessment_id = a.id
      GROUP  BY a.id, c.name, c.contact_name, c.contact_title, c.contact_email
      ORDER  BY a.updated_at DESC
    `);
    res.json(rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Create assessment
app.post('/api/compass/assessments', dbRequired, async (req, res) => {
  const name        = (req.body.name || '').trim();
  const client_id   = (req.body.client_id || '').trim();
  const sap_version = (req.body.sap_version || '').trim();

  if (!name)      return res.status(400).json({ error: 'Assessment name is required.' });
  if (!client_id) return res.status(400).json({ error: 'A client must be selected.' });
  if (name.length > 200) return res.status(400).json({ error: 'Name must be 200 characters or fewer.' });

  try {
    const { rowCount: clientExists } = await pool.query(
      'SELECT 1 FROM compass_clients WHERE id=$1', [client_id]
    );
    if (!clientExists) return res.status(404).json({ error: 'Client not found.' });

    const { rows } = await pool.query(
      `INSERT INTO compass_assessments(id, client_id, name, sap_version)
       VALUES($1,$2,$3,$4) RETURNING *`,
      [randomUUID(), client_id, name, sap_version]
    );
    res.json(rows[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Get single assessment with modules + client info
app.get('/api/compass/assessments/:id', dbRequired, async (req, res) => {
  try {
    const { rows: [assessment] } = await pool.query(`
      SELECT a.*, c.name AS company, c.contact_name, c.contact_title, c.contact_email
      FROM compass_assessments a
      LEFT JOIN compass_clients c ON c.id = a.client_id
      WHERE a.id=$1
    `, [req.params.id]);
    if (!assessment) return res.status(404).json({ error: 'Assessment not found.' });

    const { rows: modules } = await pool.query(
      'SELECT * FROM compass_modules WHERE assessment_id=$1 ORDER BY module_code',
      [req.params.id]
    );
    res.json({ ...assessment, modules });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Update assessment config (sap_version, selected_modules)
app.put('/api/compass/assessments/:id', dbRequired, async (req, res) => {
  const sap_version      = (req.body.sap_version || '').trim();
  const selected_modules = Array.isArray(req.body.selected_modules) ? req.body.selected_modules : [];
  try {
    const { rows, rowCount } = await pool.query(
      `UPDATE compass_assessments
       SET sap_version=$2, selected_modules=$3, updated_at=NOW()
       WHERE id=$1 RETURNING *`,
      [req.params.id, sap_version, selected_modules]
    );
    if (!rowCount) return res.status(404).json({ error: 'Assessment not found.' });
    res.json(rows[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Upsert module scores
app.put('/api/compass/assessments/:id/modules/:code', dbRequired, async (req, res) => {
  const { id, code } = req.params;
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
    const { rowCount } = await pool.query('SELECT 1 FROM compass_assessments WHERE id=$1', [id]);
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
       vals.axis_ux, vals.axis_process, vals.axis_ai_readiness, vals.axis_compliance, notes]
    );
    await pool.query('UPDATE compass_assessments SET updated_at=NOW() WHERE id=$1', [id]);
    res.json(rows[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Summary — per-assessment with client info and avg scores
app.get('/api/compass/summary', dbRequired, async (req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT
        a.id, a.name, a.sap_version, a.created_at, a.updated_at,
        c.id AS client_id, c.name AS company,
        c.contact_name, c.contact_title, c.contact_email,
        COUNT(m.id)::int AS module_count,
        ROUND(AVG(
          (m.axis_platform + m.axis_custom_code + m.axis_data + m.axis_integration +
           m.axis_ux + m.axis_process + m.axis_ai_readiness + m.axis_compliance) / 8.0
        )::numeric, 1) AS avg_score,
        MIN(m.axis_ai_readiness) AS min_ai_readiness
      FROM compass_assessments a
      LEFT JOIN compass_clients c ON c.id = a.client_id
      LEFT JOIN compass_modules m ON m.assessment_id = a.id
      GROUP BY a.id, c.id
      ORDER BY a.updated_at DESC
    `);
    res.json(rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Delete assessment
app.delete('/api/compass/assessments/:id', dbRequired, async (req, res) => {
  try {
    const { rowCount } = await pool.query('DELETE FROM compass_assessments WHERE id=$1', [req.params.id]);
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
