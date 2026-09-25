const fs = require('fs');
const path = require('path');
const config = fs.readFileSync(path.join(process.env.USERPROFILE, 'AppData/Roaming/xdg.config/.wrangler/config/default.toml'), 'utf8');
const token = config.match(/oauth_token\s*=\s*"([^"]+)"/)[1];
const accountId = '9bca45c9a8ff34be86d4a4bf0cc0245f';
const zoneId = '054ecc44a1750c75002d7a5773c54836';

async function test() {
  const scriptsRes = await fetch(`https://api.cloudflare.com/client/v4/accounts/${accountId}/workers/scripts`, {
    headers: { Authorization: `Bearer ${token}` }
  });
  const scriptsData = await scriptsRes.json();
  console.log('Workers scripts:', scriptsData.result?.map(s => ({ id: s.id, created_on: s.created_on })));

  const routesRes = await fetch(`https://api.cloudflare.com/client/v4/zones/${zoneId}/workers/routes`, {
    headers: { Authorization: `Bearer ${token}` }
  });
  const routesData = await routesRes.json();
  console.log('Worker routes on zone:', routesData);

  // Check Pages tienganh7-pro details
  const pagesProjRes = await fetch(`https://api.cloudflare.com/client/v4/accounts/${accountId}/pages/projects/tienganh7-pro`, {
    headers: { Authorization: `Bearer ${token}` }
  });
  console.log('Pages tienganh7-pro:', await pagesProjRes.json());
}

test().catch(console.error);
