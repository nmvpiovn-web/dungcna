import fs from 'node:fs';
import path from 'node:path';

const schemaDump = JSON.parse(fs.readFileSync('artifacts/db_layer_schema_dump.json', 'utf8'));

// Build table -> columns lookup
const tableColumns = {};
const notNullWithoutDefault = {};

for (const [table, cols] of Object.entries(schemaDump)) {
  tableColumns[table] = new Set(cols.map(c => c.name));
  notNullWithoutDefault[table] = new Set(
    cols.filter(c => c.notnull && c.dflt_value === null && !c.pk).map(c => c.name)
  );
}

function findJsFiles(dir) {
  let results = [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const e of entries) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) {
      results = results.concat(findJsFiles(full));
    } else if (e.name.endsWith('.js')) {
      results.push(full);
    }
  }
  return results;
}

const apiFiles = findJsFiles('src/routes/api');
console.log(`Found ${apiFiles.length} API handler files in src/routes/api\n`);

const findings = [];

for (const file of apiFiles) {
  const code = fs.readFileSync(file, 'utf8');
  const relPath = path.relative('.', file).replace(/\\/g, '/');

  // Check 1: Find all SQL statements
  // Regex to extract SQL queries inside prepare(`...`) or prepare("...")
  const prepareRegex = /db\.prepare\s*\(\s*([`'"])([\s\S]*?)\1\s*\)/g;
  let match;

  while ((match = prepareRegex.exec(code)) !== null) {
    const sql = match[2].trim();
    
    // Check INSERT statements
    const insertMatch = sql.match(/INSERT\s+(?:OR\s+\w+\s+)?INTO\s+(\w+)\s*\(([\s\S]*?)\)\s*VALUES/i);
    if (insertMatch) {
      const targetTable = insertMatch[1];
      const targetCols = insertMatch[2].split(',').map(c => c.trim().replace(/[`"']/g, ''));
      
      if (!tableColumns[targetTable]) {
        findings.push({
          type: 'UNKNOWN_TABLE',
          file: relPath,
          table: targetTable,
          sql: sql.slice(0, 80)
        });
      } else {
        // Check if inserted columns exist in schema
        for (const col of targetCols) {
          if (!tableColumns[targetTable].has(col)) {
            findings.push({
              type: 'COLUMN_DOES_NOT_EXIST_ON_INSERT',
              file: relPath,
              table: targetTable,
              column: col,
              sql: sql.slice(0, 100)
            });
          }
        }
        
        // Check if any NOT NULL without default column was omitted
        const omittedNotNull = [];
        for (const reqCol of notNullWithoutDefault[targetTable] || []) {
          if (!targetCols.includes(reqCol)) {
            omittedNotNull.push(reqCol);
          }
        }
        if (omittedNotNull.length > 0) {
          findings.push({
            type: 'OMITTED_NOT_NULL_COLUMN',
            file: relPath,
            table: targetTable,
            omittedColumns: omittedNotNull,
            sql: sql.slice(0, 100)
          });
        }
      }
    }

    // Check SELECT statements
    const selectMatch = sql.match(/SELECT\s+([\s\S]*?)\s+FROM\s+(\w+)/i);
    if (selectMatch) {
      const selectColsRaw = selectMatch[1].trim();
      const targetTable = selectMatch[2];
      
      if (tableColumns[targetTable] && selectColsRaw !== '*' && !selectColsRaw.includes('COUNT(')) {
        // Parse individual selected columns
        const cols = selectColsRaw.split(',').map(c => {
          const cleaned = c.trim().split(/\s+as\s+/i)[0].trim().replace(/[`"']/g, '');
          return cleaned.includes('.') ? cleaned.split('.')[1] : cleaned;
        });
        
        for (const col of cols) {
          if (col && !col.includes('(') && !col.includes('*') && !col.includes('?') && !col.includes('+')) {
            if (!tableColumns[targetTable].has(col)) {
              findings.push({
                type: 'COLUMN_DOES_NOT_EXIST_ON_SELECT',
                file: relPath,
                table: targetTable,
                column: col,
                sql: sql.slice(0, 100)
              });
            }
          }
        }
      }
    }
  }

  // Check 2: Endpoint auth checks
  const hasGet = /export\s+async\s+function\s+GET/.test(code);
  const hasPost = /export\s+async\s+function\s+POST/.test(code);
  const hasPut = /export\s+async\s+function\s+PUT/.test(code);
  const hasDelete = /export\s+async\s+function\s+DELETE/.test(code);
  const callsAuth = /verifyServerAuth/.test(code);
  const isPublicAllowed = /api\/(auth\/(token|register)|webhook|vocabulary|grammar|knowledge\/search)/.test(relPath);

  if ((hasPost || hasPut || hasDelete) && !callsAuth && !isPublicAllowed) {
    findings.push({
      type: 'UNPROTECTED_MUTATION_ENDPOINT',
      file: relPath,
      detail: 'Mutation endpoint does not invoke verifyServerAuth'
    });
  }
}

console.log('=== STATIC AUDIT FINDINGS ===');
console.log(`Total Findings: ${findings.length}`);
for (const f of findings) {
  console.log(`\n[${f.type}] in ${f.file}`);
  console.log(JSON.stringify(f, null, 2));
}

fs.writeFileSync('artifacts/deep_schema_drift_findings.json', JSON.stringify(findings, null, 2));
