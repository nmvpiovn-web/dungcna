const fs = require('fs');

const tomlPath = 'C:\\Users\\admin\\AppData\\Roaming\\xdg.config\\.wrangler\\config\\default.toml';
const content = fs.readFileSync(tomlPath, 'utf8');
const token = content.match(/oauth_token\s*=\s*"([^"]+)"/)[1];
const accountId = '9bca45c9a8ff34be86d4a4bf0cc0245f';

async function checkDeployments() {
  // Worker deployments
  const wUrl = `https://api.cloudflare.com/client/v4/accounts/${accountId}/workers/scripts/tienganh7/deployments`;
  const wRes = await fetch(wUrl, { headers: { Authorization: `Bearer ${token}` } });
  const wData = await wRes.json();
  console.log('Worker tienganh7 deployments:');
  console.log(JSON.stringify(wData.result, null, 2));

  // Pages deployments
  const pUrl = `https://api.cloudflare.com/client/v4/accounts/${accountId}/pages/projects/tienganh7-pro/deployments`;
  const pRes = await fetch(pUrl, { headers: { Authorization: `Bearer ${token}` } });
  const pData = await pRes.json();
  console.log('Pages tienganh7-pro deployments:');
  if (pData.result && pData.result.length > 0) {
    pData.result.slice(0, 3).forEach(d => console.log(' - Pages deploy:', d.id, d.created_on, d.url));
  }
}

checkDeployments().catch(console.error);
