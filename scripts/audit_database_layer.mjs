import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';

const db = new DatabaseSync(':memory:');
const migrations = fs.readdirSync('migrations').filter(f => f.endsWith('.sql')).sort();
console.log('=== MIGRATIONS FOUND ===');
console.log(migrations);

for (const f of migrations) {
  const sql = fs.readFileSync(path.join('migrations', f), 'utf8');
  try {
    db.exec(sql);
    console.log(`[PASS] Applied: ${f}`);
  } catch (err) {
    console.error(`[FAIL] Migration error in ${f}:`, err.message);
  }
}

const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%';").all();
console.log(`\n=== TABLES CREATED IN FRESH D1 (${tables.length}) ===`);

const schemaMap = {};
for (const t of tables) {
  const cols = db.prepare(`PRAGMA table_info(${t.name});`).all();
  schemaMap[t.name] = cols;
  console.log(`\nTable [${t.name}]:`);
  for (const c of cols) {
    const pk = c.pk ? ' [PK]' : '';
    const nn = c.notnull ? ' NOT NULL' : '';
    const dflt = c.dflt_value !== null ? ` DEFAULT ${c.dflt_value}` : '';
    console.log(`  - ${c.name}: ${c.type || 'ANY'}${pk}${nn}${dflt}`);
  }
}

fs.writeFileSync('artifacts/db_layer_schema_dump.json', JSON.stringify(schemaMap, null, 2));
console.log('\nSaved full schema dump to artifacts/db_layer_schema_dump.json');
