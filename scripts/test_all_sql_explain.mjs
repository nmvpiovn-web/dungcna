// Automated SQL Validator across all API endpoints using SQLite EXPLAIN
import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';

const db = new DatabaseSync(':memory:');

// 1. Run all migrations in order
const migrations = fs.readdirSync('migrations')
  .filter(f => f.endsWith('.sql'))
  .sort()
  .map(f => path.join('migrations', f));

for (const m of migrations) {
  const file = path.resolve(m);
  if (fs.existsSync(file)) {
    const sql = fs.readFileSync(file, 'utf8');
    db.exec(sql);
  }
}

// 2. Scan all files in src/routes/api
function getFiles(dir) {
  let results = [];
  const list = fs.readdirSync(dir);
  for (const file of list) {
    const full = path.join(dir, file);
    const stat = fs.statSync(full);
    if (stat.isDirectory()) {
      results = results.concat(getFiles(full));
    } else if (file.endsWith('.js')) {
      results.push(full);
    }
  }
  return results;
}

const apiFiles = getFiles(path.resolve('src/routes/api'));

// Regex to extract SQL queries passed to db.prepare(...)
const sqlRegex = /db\.prepare\s*\(\s*(?:`([^`]+)`|'([^']+)'|"([^"]+)")\s*\)/g;

let totalQueries = 0;
let errors = [];

for (const file of apiFiles) {
  const content = fs.readFileSync(file, 'utf8');
  let match;
  while ((match = sqlRegex.exec(content)) !== null) {
    totalQueries++;
    let rawSql = match[1] || match[2] || match[3];

    // Smart replacement of template literals:
    let testSql = rawSql
      // where clauses
      .replace(/\$\{[^}]*(?:where|filter|clause|StatusClause|WhereSql)[^}]*\}/gi, ' 1=1 ')
      // in list placeholders
      .replace(/\(\s*\$\{[^}]*(?:placeholder|ids|links)[^}]*\}\s*\)/gi, ' (?) ')
      .replace(/\$\{[^}]*(?:placeholder|ids|links)[^}]*\}/gi, ' ? ')
      // field lists in insert
      .replace(/\$\{[^}]*(?:fields|cols)[^}]*\}/gi, ' id ')
      // generic interpolations
      .replace(/\$\{[^}]+\}/g, ' 1 ')
      .replace(/CURRENT_TIMESTAMP/gi, "'2026-09-30 00:00:00'")
      .trim();

    // Check with EXPLAIN
    try {
      db.prepare(`EXPLAIN ${testSql}`);
    } catch (e) {
      // Ignore duplicate column name in defensive ALTER TABLE migrations
      if (testSql.includes('ALTER TABLE') && /duplicate column name/i.test(e.message)) {
        continue;
      }
      if (testSql.includes('ALTER TABLE') && testSql.includes(' 1 ')) {
        continue;
      }
      errors.push({
        file: path.relative(process.cwd(), file),
        error: e.message,
        sql: testSql.slice(0, 160)
      });
    }
  }
}

console.log(`Total API SQL queries analyzed: ${totalQueries}`);
console.log(`Real Schema / Syntax Errors found: ${errors.length}`);
if (errors.length > 0) {
  console.log('\n--- DETAILED ERRORS ---');
  for (const err of errors) {
    console.log(`File: ${err.file}`);
    console.log(`Error: ${err.error}`);
    console.log(`SQL: ${err.sql}\n`);
  }
}

fs.writeFileSync(path.resolve('artifacts/sql_explain_audit_filtered.json'), JSON.stringify({
  totalQueries,
  errorCount: errors.length,
  errors
}, null, 2));
