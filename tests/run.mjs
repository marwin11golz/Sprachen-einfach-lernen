// Führt alle *.test.mjs in diesem Ordner aus und fasst das Ergebnis zusammen.
// Diese Tests brauchen nichts ausser Node - keine Installation, kein Browser.
//
//   npm test
//
// Die Tests unter tests/browser/ laufen getrennt, siehe dortige README.

import { readdirSync } from 'fs';
import { spawnSync } from 'child_process';
import { fileURLToPath } from 'url';
import path from 'path';

const dir = path.dirname(fileURLToPath(import.meta.url));
const files = readdirSync(dir).filter(f => f.endsWith('.test.mjs')).sort();

if (files.length === 0) {
  console.error('Keine Testdateien gefunden.');
  process.exit(1);
}

let failed = 0;
for (const file of files) {
  console.log(`\n──────── ${file} ────────`);
  const res = spawnSync(process.execPath, [path.join(dir, file)], { stdio: 'inherit' });
  if (res.status !== 0) failed++;
}

console.log('\n════════════════════════════════');
if (failed) {
  console.log(`${failed} von ${files.length} Testdateien FEHLGESCHLAGEN`);
  process.exit(1);
}
console.log(`Alle ${files.length} Testdateien bestanden`);
