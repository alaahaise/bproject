'use strict';

/* Read-only export used to inspect every available BL field. */
require('dotenv').config({ quiet: true });

const fs = require('fs');
const path = require('path');
const { parseBlInput } = require('../src/numberParser');
const { getBl } = require('../src/blService');
const schema = require('../src/schema');

const OUT_DIR = path.join(__dirname, '..', 'samples');

function display(value) {
  if (value === null || value === undefined) return '';
  return String(value).replace(/\r?\n/g, ' ').slice(0, 180);
}

function section(title, rows, tableName, tables) {
  const byName = new Map(
    (tables[tableName] || []).map((column) => [column.name, column])
  );
  const lines = [
    `## ${title}`,
    '',
    '| Champ | Type | Description HFSQL | Valeur |',
    '| --- | --- | --- | --- |',
  ];
  for (const [key, value] of Object.entries(rows)) {
    const column = byName.get(key) || {};
    lines.push(
      `| \`${key}\` | ${column.type || ''} | ${display(
        column.remarks
      ).replace(/\|/g, '\\|')} | ${display(value).replace(/\|/g, '\\|')} |`
    );
  }
  return lines.join('\n');
}

(async () => {
  fs.mkdirSync(OUT_DIR, { recursive: true });

  const result = await getBl(parseBlInput('BL26-05255'), { full: true });
  fs.writeFileSync(
    path.join(OUT_DIR, 'BL26-05255-full.json'),
    `${JSON.stringify(result, null, 2)}\n`,
    'utf8'
  );

  const tables = await schema.summary();
  fs.writeFileSync(
    path.join(OUT_DIR, 'schema.json'),
    `${JSON.stringify({ tables }, null, 2)}\n`,
    'utf8'
  );

  const md = [];
  md.push('# BL26-05255 — all fields available');
  md.push('');
  md.push(`Generated from the local HFSQL export. ${result.lines.length} line(s).`);
  md.push('');
  md.push(section('BL header — Mouvement', result.full.header, 'Mouvement', tables));
  md.push('');
  md.push(section('Client — Tiers', result.full.client, 'Tiers', tables));
  md.push('');

  result.full.lines.forEach((entry, index) => {
    md.push(`## Line ${index + 1} — Ligne_MT`);
    md.push('');
    md.push(section('Line', entry.line, 'Ligne_MT', tables));
    md.push('');
    if (entry.article) {
      md.push(section('Article', entry.article, 'Articles', tables));
      md.push('');
    }
  });

  fs.writeFileSync(
    path.join(OUT_DIR, 'BL26-05255-fields.md'),
    `${md.join('\n')}\n`,
    'utf8'
  );

  console.log(
    `Wrote ${path.join(OUT_DIR, 'BL26-05255-full.json')}, ` +
      `${path.join(OUT_DIR, 'BL26-05255-fields.md')}, ` +
      `${path.join(OUT_DIR, 'schema.json')}`
  );
  console.log(
    `Header fields: ${Object.keys(result.full.header).length}; ` +
      `client: ${Object.keys(result.full.client).length}; ` +
      `lines: ${result.lines.length}`
  );

  process.exit(0);
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
