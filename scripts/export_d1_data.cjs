const fs = require('fs');
const path = require('path');

const configPath = path.join(process.env.USERPROFILE, 'AppData/Roaming/xdg.config/.wrangler/config/default.toml');
const config = fs.readFileSync(configPath, 'utf8');
const token = config.match(/oauth_token\s*=\s*"([^"]+)"/)[1];
const accountId = '9bca45c9a8ff34be86d4a4bf0cc0245f';
const dbUuid = 'a0d2d5f7-b4ae-48a3-99d6-ecac7ed87218';

async function queryD1(sql) {
  const res = await fetch(`https://api.cloudflare.com/client/v4/accounts/${accountId}/d1/database/${dbUuid}/query`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ sql })
  });
  const data = await res.json();
  if (!data.success) {
    throw new Error(`D1 query error: ${JSON.stringify(data.errors)}`);
  }
  return data.result[0].results;
}

async function exportAll() {
  console.log('Exporting all D1 tables for local & static cache...');
  const outDir = path.resolve('src/lib/data');
  if (!fs.existsSync(outDir)) {
    fs.mkdirSync(outDir, { recursive: true });
  }

  const tables = [
    'users',
    'curricula',
    'exams',
    'questions',
    'student_evaluations',
    'cambridge_vocabulary',
    'teaching_resources',
    'snapshots',
    'webhooks',
    'tuition_bills',
    'student_stars'
  ];

  const fullData = {};

  for (const t of tables) {
    const rows = await queryD1(`SELECT * FROM ${t}`);
    fs.writeFileSync(path.join(outDir, `${t}.json`), JSON.stringify(rows, null, 2), 'utf-8');
    fullData[t] = rows;
    console.log(`Saved ${t}.json (${rows.length} records)`);
  }

  // Also write a bundled full_store.json
  fs.writeFileSync(path.join(outDir, 'full_store.json'), JSON.stringify(fullData, null, 2), 'utf-8');
  console.log('Export from Cloudflare D1 completed successfully!');
}

exportAll().catch(console.error);
