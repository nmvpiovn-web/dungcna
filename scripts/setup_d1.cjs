const fs = require('fs');
const path = require('path');

const configPath = path.join(process.env.USERPROFILE, 'AppData/Roaming/xdg.config/.wrangler/config/default.toml');
const config = fs.readFileSync(configPath, 'utf8');
const tokenMatch = config.match(/oauth_token\s*=\s*"([^"]+)"/);
if (!tokenMatch) {
  console.error('No oauth token found');
  process.exit(1);
}
const token = tokenMatch[1];
const accountId = '9bca45c9a8ff34be86d4a4bf0cc0245f';

async function setup() {
  console.log('Checking existing D1 databases...');
  const listRes = await fetch(`https://api.cloudflare.com/client/v4/accounts/${accountId}/d1/database`, {
    headers: { Authorization: `Bearer ${token}` }
  });
  const listData = await listRes.json();
  console.log('Current DBs:', listData.result?.map(d => ({ name: d.name, uuid: d.uuid })));

  let db = listData.result?.find(d => d.name === 'tienganh-pro-db');
  if (!db) {
    console.log('Creating database tienganh-pro-db...');
    const createRes = await fetch(`https://api.cloudflare.com/client/v4/accounts/${accountId}/d1/database`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ name: 'tienganh-pro-db' })
    });
    const createData = await createRes.json();
    console.log('Create result:', createData);
    db = createData.result;
  }

  console.log('Target D1 Database info:', db);
  return db;
}

setup().catch(console.error);
