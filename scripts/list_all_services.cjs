const fs = require('fs');

const tomlPath = 'C:\\Users\\admin\\AppData\\Roaming\\xdg.config\\.wrangler\\config\\default.toml';
const content = fs.readFileSync(tomlPath, 'utf8');
const token = content.match(/oauth_token\s*=\s*"([^"]+)"/)[1];
const accountId = '9bca45c9a8ff34be86d4a4bf0cc0245f';

async function listAll() {
  // 1. Pages projects
  const pRes = await fetch(`https://api.cloudflare.com/client/v4/accounts/${accountId}/pages/projects`, {
    headers: { Authorization: `Bearer ${token}` }
  });
  const pData = await pRes.json();
  console.log('=== Pages projects ===');
  if (pData.result) {
    pData.result.forEach(p => console.log(' - Pages project:', p.name, '->', p.subdomain));
  } else {
    console.log(pData);
  }

  // 2. Workers scripts
  const wRes = await fetch(`https://api.cloudflare.com/client/v4/accounts/${accountId}/workers/scripts`, {
    headers: { Authorization: `Bearer ${token}` }
  });
  const wData = await wRes.json();
  console.log('=== Workers scripts ===');
  if (wData.result) {
    wData.result.forEach(w => console.log(' - Worker:', w.id));
  } else {
    console.log(wData);
  }
}

listAll().catch(console.error);
