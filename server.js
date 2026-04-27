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

  // ── 1. Companies (top level) ───────────────────────────────────────────────
  await pool.query(`
    CREATE TABLE IF NOT EXISTS compass_companies (
      id         TEXT PRIMARY KEY,
      name       TEXT NOT NULL,
      industry   TEXT NOT NULL DEFAULT '',
      size       TEXT NOT NULL DEFAULT '',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await pool.query(`ALTER TABLE compass_companies ADD COLUMN IF NOT EXISTS industry TEXT NOT NULL DEFAULT ''`);
  await pool.query(`ALTER TABLE compass_companies ADD COLUMN IF NOT EXISTS size     TEXT NOT NULL DEFAULT ''`);

  // ── 2. Clients = stakeholders, belong to a company ────────────────────────
  await pool.query(`
    CREATE TABLE IF NOT EXISTS compass_clients (
      id          TEXT PRIMARY KEY,
      company_id  TEXT REFERENCES compass_companies(id) ON DELETE CASCADE,
      name        TEXT NOT NULL DEFAULT '',
      title       TEXT NOT NULL DEFAULT '',
      email       TEXT NOT NULL DEFAULT '',
      created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await pool.query(`ALTER TABLE compass_clients ADD COLUMN IF NOT EXISTS company_id TEXT REFERENCES compass_companies(id) ON DELETE CASCADE`);
  await pool.query(`ALTER TABLE compass_clients ADD COLUMN IF NOT EXISTS title      TEXT NOT NULL DEFAULT ''`);
  await pool.query(`ALTER TABLE compass_clients ADD COLUMN IF NOT EXISTS email      TEXT NOT NULL DEFAULT ''`);

  // ── 3. Migrate old compass_clients rows that still carry company-name data ─
  //    Old schema had: name=company_name, contact_name=person, contact_title, contact_email
  //    For each old row (company_id IS NULL), promote its name to compass_companies and
  //    repoint compass_clients.name to the person's name.
  const { rows: orphans } = await pool.query(`
    SELECT id, name, contact_name, contact_title, contact_email
    FROM compass_clients
    WHERE company_id IS NULL
  `);
  for (const row of orphans) {
    const companyName = row.name || 'Unknown Company';
    const personName  = row.contact_name || '';
    const personTitle = row.contact_title || '';
    const personEmail = row.contact_email || '';
    const companyId   = randomUUID();
    await pool.query(
      `INSERT INTO compass_companies(id, name) VALUES($1,$2) ON CONFLICT DO NOTHING`,
      [companyId, companyName]
    );
    await pool.query(
      `UPDATE compass_clients SET company_id=$1, name=$2, title=$3, email=$4 WHERE id=$5`,
      [companyId, personName, personTitle, personEmail, row.id]
    );
  }

  // ── 4. Assessments (belong to a client/stakeholder) ───────────────────────
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
  await pool.query(`ALTER TABLE compass_assessments ADD COLUMN IF NOT EXISTS client_id        TEXT REFERENCES compass_clients(id) ON DELETE SET NULL`);
  await pool.query(`ALTER TABLE compass_assessments ADD COLUMN IF NOT EXISTS selected_modules TEXT[] NOT NULL DEFAULT '{}'`);

  // ── 5. Modules ────────────────────────────────────────────────────────────
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

  // ── 6. Indexes ────────────────────────────────────────────────────────────
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_companies_created   ON compass_companies(created_at DESC)`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_clients_company     ON compass_clients(company_id)`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_assessments_client  ON compass_assessments(client_id)`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_assessments_updated ON compass_assessments(updated_at DESC)`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_modules_assessment  ON compass_modules(assessment_id)`);

  console.log('✅ AgenticSAP database ready');
}

function dbRequired(req, res, next) {
  if (!pool) {
    return res.status(503).json({
      error: 'DATABASE_URL not configured',
      hint: 'Add a PostgreSQL service in your Railway project.',
    });
  }
  next();
}

// ── HEALTH ─────────────────────────────────────────────────────────────────

app.get('/api/health', async (req, res) => {
  if (!pool) return res.json({ status: 'degraded', db: false, hint: 'Add a PostgreSQL service in your Railway project and redeploy.' });
  try {
    const { rows: [{ ts }] } = await pool.query('SELECT NOW() AS ts');
    const { rows: tables }   = await pool.query(`
      SELECT table_name FROM information_schema.tables
      WHERE table_schema='public'
        AND table_name IN ('compass_companies','compass_clients','compass_assessments','compass_modules')
      ORDER BY table_name
    `);
    res.json({ status: 'ok', db: true, db_time: ts, tables: tables.map(t => t.table_name) });
  } catch (err) {
    res.status(500).json({ status: 'error', db: false, error: err.message });
  }
});

// ── COMPANIES API ──────────────────────────────────────────────────────────

app.get('/api/compass/companies', dbRequired, async (req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT co.*,
        COUNT(DISTINCT cl.id)::int AS client_count,
        COUNT(DISTINCT a.id)::int  AS assessment_count,
        ROUND(AVG(
          (m.axis_platform + m.axis_custom_code + m.axis_data + m.axis_integration +
           m.axis_ux + m.axis_process + m.axis_ai_readiness + m.axis_compliance) / 8.0
        )::numeric, 1) AS avg_score,
        MIN(m.axis_ai_readiness) AS min_ai_readiness
      FROM compass_companies co
      LEFT JOIN compass_clients    cl ON cl.company_id   = co.id
      LEFT JOIN compass_assessments a ON a.client_id     = cl.id
      LEFT JOIN compass_modules     m ON m.assessment_id = a.id
      GROUP BY co.id
      ORDER BY co.created_at DESC
    `);
    res.json(rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/compass/companies', dbRequired, async (req, res) => {
  const name     = (req.body.name     || '').trim();
  const industry = (req.body.industry || '').trim();
  const size     = (req.body.size     || '').trim();
  if (!name) return res.status(400).json({ error: 'Company name is required.' });
  try {
    const { rows } = await pool.query(
      `INSERT INTO compass_companies(id, name, industry, size) VALUES($1,$2,$3,$4) RETURNING *`,
      [randomUUID(), name, industry, size]
    );
    res.json(rows[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.put('/api/compass/companies/:id', dbRequired, async (req, res) => {
  const name     = (req.body.name     || '').trim();
  const industry = (req.body.industry || '').trim();
  const size     = (req.body.size     || '').trim();
  if (!name) return res.status(400).json({ error: 'Company name is required.' });
  try {
    const { rows, rowCount } = await pool.query(
      `UPDATE compass_companies SET name=$2, industry=$3, size=$4 WHERE id=$1 RETURNING *`,
      [req.params.id, name, industry, size]
    );
    if (!rowCount) return res.status(404).json({ error: 'Company not found.' });
    res.json(rows[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.delete('/api/compass/companies/:id', dbRequired, async (req, res) => {
  try {
    const { rows: [{ cnt }] } = await pool.query(
      `SELECT COUNT(*)::int AS cnt FROM compass_clients WHERE company_id=$1`, [req.params.id]
    );
    if (cnt > 0) return res.status(409).json({
      error: `Cannot delete — ${cnt} stakeholder${cnt !== 1 ? 's' : ''} exist for this company. Remove them first.`
    });
    const { rowCount } = await pool.query('DELETE FROM compass_companies WHERE id=$1', [req.params.id]);
    if (!rowCount) return res.status(404).json({ error: 'Company not found.' });
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── CLIENTS (STAKEHOLDERS) API ─────────────────────────────────────────────

app.get('/api/compass/clients', dbRequired, async (req, res) => {
  try {
    const { companyId } = req.query;
    const where = companyId ? 'WHERE cl.company_id=$1' : '';
    const args  = companyId ? [companyId] : [];
    const { rows } = await pool.query(`
      SELECT cl.*,
        co.name AS company_name,
        COUNT(DISTINCT a.id)::int AS assessment_count
      FROM compass_clients cl
      LEFT JOIN compass_companies   co ON co.id = cl.company_id
      LEFT JOIN compass_assessments  a ON a.client_id = cl.id
      ${where}
      GROUP BY cl.id, co.name
      ORDER BY cl.created_at DESC
    `, args);
    res.json(rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/compass/clients', dbRequired, async (req, res) => {
  const company_id = (req.body.company_id || '').trim();
  const name       = (req.body.name       || '').trim();
  const title      = (req.body.title      || '').trim();
  const email      = (req.body.email      || '').trim();
  if (!company_id) return res.status(400).json({ error: 'Company is required.' });
  if (!name)       return res.status(400).json({ error: 'Stakeholder name is required.' });
  try {
    const { rowCount: coExists } = await pool.query('SELECT 1 FROM compass_companies WHERE id=$1', [company_id]);
    if (!coExists) return res.status(404).json({ error: 'Company not found.' });
    const { rows } = await pool.query(
      `INSERT INTO compass_clients(id, company_id, name, title, email) VALUES($1,$2,$3,$4,$5) RETURNING *`,
      [randomUUID(), company_id, name, title, email]
    );
    res.json(rows[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.put('/api/compass/clients/:id', dbRequired, async (req, res) => {
  const name  = (req.body.name  || '').trim();
  const title = (req.body.title || '').trim();
  const email = (req.body.email || '').trim();
  if (!name) return res.status(400).json({ error: 'Stakeholder name is required.' });
  try {
    const { rows, rowCount } = await pool.query(
      `UPDATE compass_clients SET name=$2, title=$3, email=$4 WHERE id=$1 RETURNING *`,
      [req.params.id, name, title, email]
    );
    if (!rowCount) return res.status(404).json({ error: 'Stakeholder not found.' });
    res.json(rows[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.delete('/api/compass/clients/:id', dbRequired, async (req, res) => {
  try {
    const { rows: [{ cnt }] } = await pool.query(
      `SELECT COUNT(*)::int AS cnt FROM compass_assessments WHERE client_id=$1`, [req.params.id]
    );
    if (cnt > 0) return res.status(409).json({
      error: `Cannot delete — ${cnt} assessment${cnt !== 1 ? 's' : ''} linked to this stakeholder.`
    });
    const { rowCount } = await pool.query('DELETE FROM compass_clients WHERE id=$1', [req.params.id]);
    if (!rowCount) return res.status(404).json({ error: 'Stakeholder not found.' });
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── ASSESSMENTS API ────────────────────────────────────────────────────────

app.get('/api/compass/assessments', dbRequired, async (req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT a.*,
        COUNT(m.id)::int AS module_count,
        cl.name  AS contact_name,  cl.title AS contact_title, cl.email AS contact_email,
        co.name  AS company,       co.id    AS company_id
      FROM compass_assessments a
      LEFT JOIN compass_clients    cl ON cl.id = a.client_id
      LEFT JOIN compass_companies  co ON co.id = cl.company_id
      LEFT JOIN compass_modules     m ON m.assessment_id = a.id
      GROUP BY a.id, cl.name, cl.title, cl.email, co.name, co.id
      ORDER BY a.updated_at DESC
    `);
    res.json(rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/compass/assessments', dbRequired, async (req, res) => {
  const name        = (req.body.name        || '').trim();
  const client_id   = (req.body.client_id   || '').trim();
  const sap_version = (req.body.sap_version || '').trim();
  if (!name)      return res.status(400).json({ error: 'Assessment name is required.' });
  if (!client_id) return res.status(400).json({ error: 'A stakeholder must be selected.' });
  try {
    const { rowCount } = await pool.query('SELECT 1 FROM compass_clients WHERE id=$1', [client_id]);
    if (!rowCount) return res.status(404).json({ error: 'Stakeholder not found.' });
    const { rows } = await pool.query(
      `INSERT INTO compass_assessments(id, client_id, name, sap_version) VALUES($1,$2,$3,$4) RETURNING *`,
      [randomUUID(), client_id, name, sap_version]
    );
    res.json(rows[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/compass/assessments/:id', dbRequired, async (req, res) => {
  try {
    const { rows: [assessment] } = await pool.query(`
      SELECT a.*,
        cl.name AS contact_name, cl.title AS contact_title, cl.email AS contact_email,
        co.name AS company, co.id AS company_id
      FROM compass_assessments a
      LEFT JOIN compass_clients   cl ON cl.id = a.client_id
      LEFT JOIN compass_companies co ON co.id = cl.company_id
      WHERE a.id=$1
    `, [req.params.id]);
    if (!assessment) return res.status(404).json({ error: 'Assessment not found.' });
    const { rows: modules } = await pool.query(
      'SELECT * FROM compass_modules WHERE assessment_id=$1 ORDER BY module_code', [req.params.id]
    );
    res.json({ ...assessment, modules });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.put('/api/compass/assessments/:id', dbRequired, async (req, res) => {
  const sap_version      = (req.body.sap_version || '').trim();
  const selected_modules = Array.isArray(req.body.selected_modules) ? req.body.selected_modules : [];
  try {
    const { rows, rowCount } = await pool.query(
      `UPDATE compass_assessments SET sap_version=$2, selected_modules=$3, updated_at=NOW() WHERE id=$1 RETURNING *`,
      [req.params.id, sap_version, selected_modules]
    );
    if (!rowCount) return res.status(404).json({ error: 'Assessment not found.' });
    res.json(rows[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.put('/api/compass/assessments/:id/modules/:code', dbRequired, async (req, res) => {
  const { id, code } = req.params;
  const axisKeys = ['axis_platform','axis_custom_code','axis_data','axis_integration',
                    'axis_ux','axis_process','axis_ai_readiness','axis_compliance'];
  const vals = {};
  for (const k of axisKeys) {
    const v = parseFloat(req.body[k] ?? 0);
    if (isNaN(v) || v < 0 || v > 5) return res.status(400).json({ error: `${k} must be 0–5.` });
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
         module_name=EXCLUDED.module_name, axis_platform=EXCLUDED.axis_platform,
         axis_custom_code=EXCLUDED.axis_custom_code, axis_data=EXCLUDED.axis_data,
         axis_integration=EXCLUDED.axis_integration, axis_ux=EXCLUDED.axis_ux,
         axis_process=EXCLUDED.axis_process, axis_ai_readiness=EXCLUDED.axis_ai_readiness,
         axis_compliance=EXCLUDED.axis_compliance, notes=EXCLUDED.notes, updated_at=NOW()
       RETURNING *`,
      [id, code, module_name,
       vals.axis_platform, vals.axis_custom_code, vals.axis_data, vals.axis_integration,
       vals.axis_ux, vals.axis_process, vals.axis_ai_readiness, vals.axis_compliance, notes]
    );
    await pool.query('UPDATE compass_assessments SET updated_at=NOW() WHERE id=$1', [id]);
    res.json(rows[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/compass/summary', dbRequired, async (req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT a.id, a.name, a.sap_version, a.created_at, a.updated_at,
        cl.id AS client_id, cl.name AS contact_name, cl.title AS contact_title, cl.email AS contact_email,
        co.id AS company_id, co.name AS company,
        COUNT(m.id)::int AS module_count,
        ROUND(AVG(
          (m.axis_platform+m.axis_custom_code+m.axis_data+m.axis_integration+
           m.axis_ux+m.axis_process+m.axis_ai_readiness+m.axis_compliance)/8.0
        )::numeric, 1) AS avg_score,
        MIN(m.axis_ai_readiness) AS min_ai_readiness
      FROM compass_assessments a
      LEFT JOIN compass_clients   cl ON cl.id = a.client_id
      LEFT JOIN compass_companies co ON co.id = cl.company_id
      LEFT JOIN compass_modules    m ON m.assessment_id = a.id
      GROUP BY a.id, cl.id, co.id
      ORDER BY a.updated_at DESC
    `);
    res.json(rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

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
