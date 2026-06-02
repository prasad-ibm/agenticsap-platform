"use strict";
const pptxgen = require("pptxgenjs");

const pres = new pptxgen();
pres.layout = "LAYOUT_WIDE"; // 13.33" x 7.5"
pres.title = "AgenticSAP Utilities Accelerator";
pres.author = "AgenticSAP";

// ─── Color palette ────────────────────────────────────────────────────────────
const C = {
  navy:    "0A1F44",
  teal:    "00B4A6",
  gold:    "F5B506",
  sapBlue: "006FE6",
  white:   "FFFFFF",
  ltGray:  "F7F9FC",
  muted:   "8B95A8",
  slate:   "4A5568",
};

// ═══════════════════════════════════════════════════════════════════════════════
// SLIDE 1 — Go-to-Market
// ═══════════════════════════════════════════════════════════════════════════════
const s1 = pres.addSlide();
s1.background = { color: "FFFFFF" };

// Thin left border strip
s1.addShape(pres.shapes.RECTANGLE, {
  x: 0, y: 0, w: 0.08, h: 7.5,
  fill: { color: C.navy }, line: { color: C.navy, width: 0 },
});

// Brand line
s1.addText("AgenticSAP", {
  x: 0.18, y: 0.18, w: 3, h: 0.2,
  fontSize: 9, bold: true, color: C.navy, fontFace: "Calibri", margin: 0,
});

// Eyebrow
s1.addText("UTILITIES · AGENTIC TRANSFORMATION", {
  x: 0.4, y: 0.52, w: 6.6, h: 0.2,
  fontSize: 9, bold: true, color: C.teal, fontFace: "Calibri", margin: 0,
});

// Headline line 1
s1.addText("From meter-to-cash to agentic.", {
  x: 0.4, y: 0.78, w: 6.6, h: 0.55,
  fontSize: 34, bold: true, color: C.navy, fontFace: "Calibri", margin: 0,
});

// Headline line 2
s1.addText("Six production agents.", {
  x: 0.4, y: 1.28, w: 6.6, h: 0.55,
  fontSize: 34, bold: true, color: C.sapBlue, fontFace: "Calibri", margin: 0,
});

// Body text
s1.addText(
  "Utility companies are running SAP IS-U, FI-CA, and BPEM on platforms that were never designed for autonomous decision-making. AgenticSAP packages everything a utility CoE needs to deploy goal-driven AI agents across the meter-to-cash process — in weeks, not years.",
  {
    x: 0.4, y: 2.08, w: 6.6, h: 0.9,
    fontSize: 12, color: C.slate, fontFace: "Calibri",
    wrap: true, margin: 0,
  }
);

// Three bullet rows
const bullets = [
  {
    label: "Pre-built, production-tested  ",
    text:  "Six agent archetypes covering MX, BPEM, FI-CA, CIC, IS-U, and EDI reconciliation.",
  },
  {
    label: "Six technical layers per agent  ",
    text:  "Skill manifest · Action handlers · Prompt templates · CDS views · AI Core pipeline · Eval harness.",
  },
  {
    label: "Measurable from day one  ",
    text:  "Every agent ships with a business case, ROI model, and evaluation golden set.",
  },
];

bullets.forEach((b, i) => {
  s1.addText(
    [
      { text: b.label, options: { bold: true, color: C.navy } },
      { text: b.text,  options: { bold: false, color: C.slate } },
    ],
    {
      x: 0.4,
      y: 3.2 + i * 0.62,
      w: 6.6,
      h: 0.55,
      fontSize: 11,
      fontFace: "Calibri",
      margin: 0,
      wrap: true,
    }
  );
});

// Footer
s1.addText(
  "agenticsap-platform-production.up.railway.app  ·  Skill Studio  ·  Technical Code Assets",
  {
    x: 0.4, y: 7.1, w: 12, h: 0.25,
    fontSize: 8, color: C.muted, fontFace: "Calibri", margin: 0,
  }
);

// ── Right dark card ──────────────────────────────────────────────────────────
s1.addShape(pres.shapes.RECTANGLE, {
  x: 7.25, y: 0.4, w: 5.8, h: 6.8,
  fill: { color: C.navy }, line: { color: C.navy, width: 0 },
});

// Card header
s1.addText("SIX AGENTS · PRODUCTION READY", {
  x: 7.5, y: 0.6, w: 5.3, h: 0.22,
  fontSize: 9, bold: true, color: C.teal, fontFace: "Calibri",
  align: "center", margin: 0,
});

// Six agent pills
const pills = [
  { y: 1.05,  fill: "006FE6", label: "MX-Resolver",           sub: "   IS-U EDM · Meter exception auto-resolution" },
  { y: 1.85,  fill: "00B4A6", label: "BPEM-Triage",           sub: "   BPEM · Case classification & routing" },
  { y: 2.65,  fill: "D97706", label: "Collections-Strategist",sub: "   FI-CA · Propensity-scored collections" },
  { y: 3.45,  fill: "059669", label: "CSR Co-Agent",          sub: "   CIC0 · Real-time next-best-action sidebar" },
  { y: 4.25,  fill: "7C3AED", label: "MoveOps",               sub: "   IS-U · Move-in/out orchestration" },
  { y: 5.05,  fill: "E53E3E", label: "EDI-Recon",             sub: "   IS-U · Market communications reconciliation" },
];

pills.forEach((p) => {
  s1.addShape(pres.shapes.ROUNDED_RECTANGLE, {
    x: 7.47, y: p.y, w: 4.9, h: 0.72,
    fill: { color: p.fill },
    line: { color: p.fill, width: 0 },
    rectRadius: 0.04,
  });
  s1.addText(
    [
      { text: "● " + p.label, options: { bold: true, fontSize: 11 } },
      { text: p.sub,          options: { bold: false, fontSize: 10 } },
    ],
    {
      x: 7.6, y: p.y + 0.16, w: 4.6, h: 0.4,
      color: C.white, fontFace: "Calibri", margin: 0,
    }
  );
});


// ═══════════════════════════════════════════════════════════════════════════════
// SLIDE 2 — Technical Assets
// ═══════════════════════════════════════════════════════════════════════════════
const s2 = pres.addSlide();
s2.background = { color: C.ltGray };

// Left border strip
s2.addShape(pres.shapes.RECTANGLE, {
  x: 0, y: 0, w: 0.08, h: 7.5,
  fill: { color: C.navy }, line: { color: C.navy, width: 0 },
});

// Full-width dark header
s2.addShape(pres.shapes.RECTANGLE, {
  x: 0, y: 0, w: 13.33, h: 1.15,
  fill: { color: C.navy }, line: { color: C.navy, width: 0 },
});

// Header eyebrow
s2.addText("TECHNICAL AGENTIC ENABLEMENT · SIX CODE LAYERS", {
  x: 0.3, y: 0.1, w: 12.5, h: 0.2,
  fontSize: 9, bold: true, color: C.teal, fontFace: "Calibri", margin: 0,
});

// Header headline
s2.addText("One GitHub repository. Six layers. Every agent.", {
  x: 0.3, y: 0.3, w: 12.5, h: 0.4,
  fontSize: 26, bold: true, color: C.white, fontFace: "Calibri", margin: 0,
});

// Header sub
s2.addText(
  "Every agent archetype ships with a complete, versioned code bundle ready to deploy on SAP AI Core + BTP.",
  {
    x: 0.3, y: 0.82, w: 12.5, h: 0.28,
    fontSize: 11, color: "cfd9ee", fontFace: "Calibri", margin: 0,
  }
);

// Six layer cards
const cards = [
  {
    x: 0.22, y: 1.25,
    accent: "006FE6", num: "1", title: "Skill Manifest", sub: "YAML · AI Core",
    body: "Declares agent identity, SAP tool bindings (OData + BAPI), guardrails, trigger config, and observability settings for SAP AI Core deployment.",
    chip: "skill.yaml", chipFill: "EDF5FF", chipColor: "006FE6",
  },
  {
    x: 4.5, y: 1.25,
    accent: "00B4A6", num: "2", title: "Action Handlers", sub: "Node.js · BTP Kyma",
    body: "Validate inputs, call SAP BAPIs with pre/post audit logs, check return codes, and roll back on failure — the agent's only write path into SAP.",
    chip: "handlers/*.js", chipFill: "E0FAF8", chipColor: "00736A",
  },
  {
    x: 8.78, y: 1.25,
    accent: "D97706", num: "3", title: "Prompt Templates", sub: "Jinja2 · GenAI Hub",
    body: "System prompts that inject live CDS context, define decision spaces (AUTO/ESCALATE/CLOSE), enforce JSON response schema, and include few-shot examples.",
    chip: "prompts/system.j2", chipFill: "FEF3C7", chipColor: "92400E",
  },
  {
    x: 0.22, y: 4.08,
    accent: "059669", num: "4", title: "CDS Views", sub: "ABAP CDS · S/4HANA",
    body: "Virtual data products joining SAP transactional tables — IS-U, FI-CA, BPEM, CRM — with window functions to produce the agent's real-time read context.",
    chip: "cds/*.cds", chipFill: "D1FAE5", chipColor: "065F46",
  },
  {
    x: 4.5, y: 4.08,
    accent: "7C3AED", num: "5", title: "AI Core Pipeline", sub: "Dockerfile · pipeline.yaml",
    body: "ML training pipeline (Collections-Strategist): ingest → feature engineering → XGBoost GPU training → AUC evaluation gate → model registry.",
    chip: "pipeline/pipeline.yaml", chipFill: "EDE9FE", chipColor: "5B21B6",
  },
  {
    x: 8.78, y: 4.08,
    accent: "E53E3E", num: "6", title: "Eval Harness", sub: "pytest · Golden Set",
    body: "CI-gated test suite covering accuracy, latency (p95), regulatory constraints, and edge cases. Blocks promotion if any gate fails — auditability built in.",
    chip: "evals/test_*.py", chipFill: "FEE2E2", chipColor: "991B1B",
  },
];

const cW = 4.1, cH = 2.65;

cards.forEach((c) => {
  // Card background (white)
  s2.addShape(pres.shapes.RECTANGLE, {
    x: c.x, y: c.y, w: cW, h: cH,
    fill: { color: C.white },
    line: { color: "E2E8F0", width: 1 },
  });
  // Top accent bar
  s2.addShape(pres.shapes.RECTANGLE, {
    x: c.x, y: c.y, w: cW, h: 0.1,
    fill: { color: c.accent }, line: { color: c.accent, width: 0 },
  });
  // Number badge circle
  s2.addShape(pres.shapes.OVAL, {
    x: c.x + 0.15, y: c.y + 0.2, w: 0.36, h: 0.36,
    fill: { color: c.accent }, line: { color: c.accent, width: 0 },
  });
  s2.addText(c.num, {
    x: c.x + 0.15, y: c.y + 0.22, w: 0.36, h: 0.32,
    fontSize: 11, bold: true, color: C.white, fontFace: "Calibri",
    align: "center", margin: 0,
  });
  // Title
  s2.addText(c.title, {
    x: c.x + 0.6, y: c.y + 0.2, w: cW - 0.7, h: 0.3,
    fontSize: 13, bold: true, color: C.navy, fontFace: "Calibri", margin: 0,
  });
  // Sub (monospace-style with Calibri)
  s2.addText(c.sub, {
    x: c.x + 0.15, y: c.y + 0.62, w: cW - 0.3, h: 0.22,
    fontSize: 9, color: C.muted, fontFace: "Courier New", margin: 0,
  });
  // Body text
  s2.addText(c.body, {
    x: c.x + 0.15, y: c.y + 0.88, w: cW - 0.3, h: 1.3,
    fontSize: 9.5, color: C.slate, fontFace: "Calibri",
    wrap: true, margin: 0,
  });
  // File chip pill
  s2.addShape(pres.shapes.ROUNDED_RECTANGLE, {
    x: c.x + 0.15, y: c.y + cH - 0.4, w: cW - 0.3, h: 0.28,
    fill: { color: c.chipFill },
    line: { color: c.chipFill, width: 0 },
    rectRadius: 0.04,
  });
  s2.addText(c.chip, {
    x: c.x + 0.15, y: c.y + cH - 0.38, w: cW - 0.3, h: 0.26,
    fontSize: 8.5, color: c.chipColor, fontFace: "Courier New",
    align: "center", margin: 0,
  });
});

// Bottom footer bar
s2.addShape(pres.shapes.RECTANGLE, {
  x: 0, y: 6.92, w: 13.33, h: 0.58,
  fill: { color: C.ltGray }, line: { color: "E2E8F0", width: 1 },
});
s2.addText(
  "prasad-ibm/agenticsap-agents  ·  agents/{agent-name}/{layer}/  ·  Pull request → CI eval gates → SAP AI Core deploy",
  {
    x: 0.3, y: 6.97, w: 12.5, h: 0.3,
    fontSize: 9, color: C.slate, fontFace: "Calibri", margin: 0,
  }
);


// ═══════════════════════════════════════════════════════════════════════════════
// SLIDE 3 — Business Value
// ═══════════════════════════════════════════════════════════════════════════════
const s3 = pres.addSlide();
s3.background = { color: "FFFFFF" };

// Left border strip
s3.addShape(pres.shapes.RECTANGLE, {
  x: 0, y: 0, w: 0.08, h: 7.5,
  fill: { color: C.navy }, line: { color: C.navy, width: 0 },
});

// Eyebrow
s3.addText("MEASURABLE BUSINESS OUTCOMES", {
  x: 0.4, y: 0.22, w: 12, h: 0.2,
  fontSize: 9, bold: true, color: C.teal, fontFace: "Calibri", margin: 0,
});

// Headline
s3.addText("Six agents. Quantified value. Deployable in weeks.", {
  x: 0.4, y: 0.42, w: 12, h: 0.45,
  fontSize: 28, bold: true, color: C.navy, fontFace: "Calibri", margin: 0,
});

// Helper to make a rich text cell with colored bold + rest
function cell(boldText, boldColor, rest, bgColor) {
  const opts = {
    fill: { color: bgColor || "FFFFFF" },
    valign: "middle",
    margin: [3, 4, 3, 4],
  };
  if (boldText && boldColor) {
    return {
      text: rest
        ? [
            { text: boldText, options: { bold: true, color: boldColor, fontFace: "Calibri", fontSize: 9 } },
            { text: " " + rest, options: { bold: false, color: C.slate, fontFace: "Calibri", fontSize: 9 } },
          ]
        : [{ text: boldText, options: { bold: true, color: boldColor, fontFace: "Calibri", fontSize: 9 } }],
      options: opts,
    };
  }
  return {
    text: boldText || "",
    options: { ...opts, color: C.slate, fontFace: "Calibri", fontSize: 9 },
  };
}

const W = "FFFFFF";
const B = "EDF5FF";

const headerRow = [
  { text: "AGENT",               options: { fill: { color: C.navy }, color: C.white, bold: true, fontFace: "Calibri", fontSize: 9, valign: "middle", align: "center" } },
  { text: "MODULE",              options: { fill: { color: C.navy }, color: C.white, bold: true, fontFace: "Calibri", fontSize: 9, valign: "middle", align: "center" } },
  { text: "PROBLEM SOLVED",      options: { fill: { color: C.navy }, color: C.white, bold: true, fontFace: "Calibri", fontSize: 9, valign: "middle", align: "center" } },
  { text: "DEPLOYED CAPABILITY", options: { fill: { color: C.navy }, color: C.white, bold: true, fontFace: "Calibri", fontSize: 9, valign: "middle", align: "center" } },
  { text: "MEASURABLE OUTCOME",  options: { fill: { color: C.navy }, color: C.white, bold: true, fontFace: "Calibri", fontSize: 9, valign: "middle", align: "center" } },
];

function plainCell(txt, color, bgColor) {
  return {
    text: txt,
    options: { fill: { color: bgColor || "FFFFFF" }, valign: "middle", color: color || C.slate, fontFace: "Calibri", fontSize: 9, margin: [3,4,3,4] },
  };
}
function boldCell(txt, color, bgColor) {
  return {
    text: txt,
    options: { fill: { color: bgColor || "FFFFFF" }, valign: "middle", color: color, bold: true, fontFace: "Calibri", fontSize: 9, margin: [3,4,3,4] },
  };
}
function outcomeCell(txt, color, bgColor) {
  return {
    text: txt,
    options: { fill: { color: bgColor || "FFFFFF" }, valign: "middle", color: color, bold: true, fontFace: "Calibri", fontSize: 9, margin: [3,4,3,4] },
  };
}

const tableRows = [
  headerRow,
  [
    boldCell("MX-Resolver", "006FE6", B),
    plainCell("IS-U EDM", C.slate, B),
    plainCell("80,000+ meter reading exceptions processed manually each month — 3-day SLA breach, high error rate.", C.slate, B),
    plainCell("Classifies root cause, auto-corrects within 2.5% tolerance, closes BPEM workcase with full audit trail.", C.slate, B),
    outcomeCell("35% backlog reduction in 60 days · $2.4M/yr avoided cost · zero audit gaps", "006FE6", B),
  ],
  [
    boldCell("BPEM-Triage", "00B4A6", W),
    plainCell("BPEM", C.slate, W),
    plainCell("BPEM case age averaging 6+ days · billing controllers triaging 500 cases/week manually.", C.slate, W),
    plainCell("Classifies all 5 root-cause categories ≥85% accuracy, routes or auto-resolves.", C.slate, W),
    outcomeCell("48% reduction in case age · $1.8M/yr avoided cost · SLA < 48 hrs", "00B4A6", W),
  ],
  [
    boldCell("Collections-Strategist", "D97706", B),
    plainCell("FI-CA", C.slate, B),
    plainCell("One-size dunning strategy across all overdue accounts — high write-off rate, regulatory exposure.", C.slate, B),
    plainCell("Propensity model scores each account; selects from 5 strategy tiers with regulatory guardrails.", C.slate, B),
    outcomeCell("22% reduction in write-offs · $3.1M/yr recovered · full GDPR audit trail", "D97706", B),
  ],
  [
    boldCell("CSR Co-Agent", "059669", W),
    plainCell("CIC0/CRM", C.slate, W),
    plainCell("CSR average handle time 8.4 min · inconsistent NBA guidance across 200-agent contact centre.", C.slate, W),
    plainCell("Real-time CIC0 sidebar streams top-3 next-best actions and account context during every call.", C.slate, W),
    outcomeCell("2.1 min AHT saved · $1.2M/yr productivity gain · NPS +11 pts", "059669", W),
  ],
  [
    boldCell("MoveOps", "7C3AED", B),
    plainCell("IS-U/CRM", C.slate, B),
    plainCell("Move-in/out requires 14 manual steps across 3 systems — 4.2 min per transaction, high re-work.", C.slate, B),
    plainCell("End-to-end orchestration: CRM notification → address validation → IS-U contract → device assignment.", C.slate, B),
    outcomeCell("4.2 min/move × 80K moves/yr · $1.1M/yr · re-work rate −60%", "7C3AED", B),
  ],
  [
    boldCell("EDI-Recon", "E53E3E", W),
    plainCell("IS-U/EDI", C.slate, W),
    plainCell("Market settlement disputes $800K/yr in penalties — IDocs reconciled manually 2 days after receipt.", C.slate, W),
    plainCell("Validates inbound IDocs vs enrollment state; auto-disputes within tolerance; escalates outliers.", C.slate, W),
    outcomeCell("60% dispute reduction · $800K/yr avoided penalties · same-day reconciliation", "E53E3E", W),
  ],
];

s3.addTable(tableRows, {
  x: 0.2, y: 1.05,
  w: 12.93,
  colW: [1.55, 1.05, 2.85, 2.85, 4.63],
  rowH: 0.78,
  border: { pt: 0.5, color: "E2E8F0" },
  autoPage: false,
});

// Bottom ROI bar
s3.addShape(pres.shapes.RECTANGLE, {
  x: 0, y: 6.48, w: 13.33, h: 1.02,
  fill: { color: C.navy }, line: { color: C.navy, width: 0 },
});

// Four stats
const stats = [
  { x: 0.5,  val: "$9.6M+",     label: "combined annual value" },
  { x: 3.85, val: "6 agents",   label: "deployed on SAP AI Core + BTP" },
  { x: 7.2,  val: "8–12 weeks", label: "assessment to production" },
  { x: 10.3, val: "100%",       label: "audit-ready, eval harnesses included" },
];

stats.forEach((s) => {
  s3.addText(s.val, {
    x: s.x, y: 6.52, w: 2.8, h: 0.38,
    fontSize: 22, bold: true, color: C.white, fontFace: "Calibri", margin: 0,
  });
  s3.addText(s.label, {
    x: s.x, y: 6.9, w: 2.8, h: 0.22,
    fontSize: 9, color: C.teal, fontFace: "Calibri", margin: 0,
  });
});

// ─── Write file ───────────────────────────────────────────────────────────────
const outPath = "C:\\Users\\Public\\agenticsap-platform\\AgenticSAP_Utilities_Accelerator.pptx";
pres.writeFile({ fileName: outPath }).then(() => {
  console.log("DONE:", outPath);
}).catch((err) => {
  console.error("ERROR:", err);
  process.exit(1);
});
