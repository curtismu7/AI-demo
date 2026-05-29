#!/usr/bin/env node
'use strict';
/**
 * migrateVerticalsV3.js - one-shot v2 to v3 migration for the verticals system.
 *
 * Transforms:
 *   - schemaVersion: 2 -> 3
 *   - id 'admin' -> 'admin-console' (folder + manifest)
 *   - dashboard.mockData -> separate mock-data.json file
 *   - drops featurePage.accent{Bg,Light,Code,Text,AccentText}; keeps accentColor
 *   - normalizes format strings: 'pct' -> 'percent', 'tier' -> 'text'
 *
 * Behavior:
 *   - All-or-nothing: if any vertical fails Zod validation, nothing is written.
 *   - Idempotent: re-running on a tree with no legacy *.json files is a no-op.
 *
 * Delete this file after Task 23 (per the plan: born-to-die).
 */
const fs = require('fs');
const path = require('path');
const { ManifestSchema } = require('../services/verticalManifest/schema');

const ID_RENAMES = { admin: 'admin-console' };
const DROPPED_ACCENT_FIELDS = ['accentBg', 'accentLight', 'accentCode', 'accentText', 'accentAccentText'];
const FORMAT_NORMALIZATIONS = { pct: 'percent', tier: 'text' };

function normalizeFormat(value) {
  if (typeof value !== 'string') return value;
  return FORMAT_NORMALIZATIONS[value] || value;
}

// Remove all leaf keys whose value is `null` (treat null as "absent" — legacy
// manifests use null for unset optional fields; Zod `.optional()` rejects null).
function stripNulls(obj) {
  if (obj === null || typeof obj !== 'object') return;
  if (Array.isArray(obj)) {
    for (const item of obj) stripNulls(item);
    return;
  }
  for (const k of Object.keys(obj)) {
    if (obj[k] === null) delete obj[k];
    else stripNulls(obj[k]);
  }
}

function transformOne(oldManifest) {
  const newId = ID_RENAMES[oldManifest.id] || oldManifest.id;
  const m = JSON.parse(JSON.stringify(oldManifest));
  m.id = newId;
  m.schemaVersion = 3;
  stripNulls(m);

  // Split mock data out of dashboard.
  let mockData = {};
  if (m.dashboard && m.dashboard.mockData) {
    mockData = m.dashboard.mockData;
    delete m.dashboard.mockData;
  }

  // Normalize hero card formats.
  if (m.dashboard && m.dashboard.hero && Array.isArray(m.dashboard.hero.cards)) {
    for (const card of m.dashboard.hero.cards) {
      if (card.format) card.format = normalizeFormat(card.format);
    }
  }

  // Drop redundant accent variants; normalize featurePage field formats.
  if (m.featurePage) {
    for (const k of DROPPED_ACCENT_FIELDS) delete m.featurePage[k];
    if (Array.isArray(m.featurePage.fields)) {
      for (const f of m.featurePage.fields) {
        if (f.format) f.format = normalizeFormat(f.format);
      }
    }
  }

  return { newId, manifest: m, mockData };
}

function migrate(root) {
  if (!fs.existsSync(root)) throw new Error(`Seed root not found: ${root}`);

  const oldFiles = fs.readdirSync(root)
    .filter((f) => f.endsWith('.json') && fs.statSync(path.join(root, f)).isFile());

  if (oldFiles.length === 0) return; // idempotent: nothing to migrate

  const transformed = [];
  for (const file of oldFiles) {
    const oldId = path.basename(file, '.json');
    const oldManifest = JSON.parse(fs.readFileSync(path.join(root, file), 'utf8'));
    const t = transformOne(oldManifest);
    const res = ManifestSchema.safeParse(t.manifest);
    if (!res.success) {
      throw new Error(
        `Migration validation failed for ${oldId}: ${JSON.stringify(res.error.issues, null, 2)}`
      );
    }
    transformed.push({ oldFile: file, ...t, validated: res.data });
  }

  // All validations passed; write everything.
  for (const { newId, validated, mockData } of transformed) {
    const dir = path.join(root, newId);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'manifest.json'), JSON.stringify(validated, null, 2));
    fs.writeFileSync(path.join(dir, 'mock-data.json'), JSON.stringify(mockData, null, 2));
  }
  for (const { oldFile } of transformed) {
    fs.unlinkSync(path.join(root, oldFile));
  }

  console.log(`Migrated ${transformed.length} verticals: ${transformed.map((t) => t.newId).join(', ')}`);
}

if (require.main === module) {
  const root = process.argv[2] || path.join(__dirname, '..', 'config', 'verticals');
  migrate(root);
}

module.exports = { migrate, transformOne };
