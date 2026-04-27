-- AgenticSAP Platform — Compass Database Schema
-- Tables are created automatically by server.js on first boot (initDB).
-- Use this file for manual inspection, reset, or local development setup.
--
-- Local setup:
--   createdb agenticsap
--   psql agenticsap < schema.sql
--
-- Railway: attach a PostgreSQL service — DATABASE_URL is injected automatically.

-- ── ASSESSMENTS ────────────────────────────────────────────────────────────
-- One row per client engagement / scoring session.

CREATE TABLE IF NOT EXISTS compass_assessments (
  id          TEXT        PRIMARY KEY,                  -- UUID v4
  name        TEXT        NOT NULL,                     -- e.g. "Acme Corp Q2 2026"
  company     TEXT        NOT NULL DEFAULT '',
  sap_version TEXT        NOT NULL DEFAULT '',          -- e.g. "RISE Public Cloud"
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_assessments_updated
  ON compass_assessments(updated_at DESC);

-- ── MODULE SCORES ──────────────────────────────────────────────────────────
-- One row per SAP module per assessment.
-- 8 axes scored 0.0 – 5.0 (NUMERIC(3,1) = one decimal place, max 3 digits).
-- UNIQUE(assessment_id, module_code) enables idempotent upserts.

CREATE TABLE IF NOT EXISTS compass_modules (
  id                SERIAL      PRIMARY KEY,
  assessment_id     TEXT        NOT NULL REFERENCES compass_assessments(id) ON DELETE CASCADE,
  module_code       TEXT        NOT NULL,               -- e.g. "FI", "SD", "MM"
  module_name       TEXT        NOT NULL DEFAULT '',    -- e.g. "Financial Accounting"

  -- Maturity axes (0 = not assessed, 1 = foundational, 5 = leading)
  axis_platform     NUMERIC(3,1) NOT NULL DEFAULT 0,   -- SAP platform footprint / RISE journey
  axis_custom_code  NUMERIC(3,1) NOT NULL DEFAULT 0,   -- Custom code / ABAP burden
  axis_data         NUMERIC(3,1) NOT NULL DEFAULT 0,   -- Data foundation / MDG / Datasphere
  axis_integration  NUMERIC(3,1) NOT NULL DEFAULT 0,   -- Integration maturity (PI→IS 4.x)
  axis_ux           NUMERIC(3,1) NOT NULL DEFAULT 0,   -- Fiori / UX adoption
  axis_process      NUMERIC(3,1) NOT NULL DEFAULT 0,   -- Process standardisation
  axis_ai_readiness NUMERIC(3,1) NOT NULL DEFAULT 0,   -- AI / Agent readiness (BTP AI, Joule)
  axis_compliance   NUMERIC(3,1) NOT NULL DEFAULT 0,   -- GRC / SoD / audit controls

  notes             TEXT        NOT NULL DEFAULT '',
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  UNIQUE(assessment_id, module_code)
);

CREATE INDEX IF NOT EXISTS idx_modules_assessment
  ON compass_modules(assessment_id);

-- ── READINESS TIERS (reference) ────────────────────────────────────────────
-- Computed in application code from the average of 8 axis scores.
--
--  avg < 2.0            → Foundational
--  avg 2.0 – 2.9        → Developing
--  avg 3.0 – 3.4        → Candidate
--  avg 3.5 – 4.4        → Primed
--  avg ≥ 4.5            → Leading
--  avg ≥ 3.0 but
--    axis_ai_readiness
--    < 2.0              → AI Prerequisites Needed
