const fs = require('fs');

const tomlPath = 'C:\\Users\\admin\\AppData\\Roaming\\xdg.config\\.wrangler\\config\\default.toml';
const content = fs.readFileSync(tomlPath, 'utf8');
const token = content.match(/oauth_token\s*=\s*"([^"]+)"/)[1];
const accountId = '9bca45c9a8ff34be86d4a4bf0cc0245f';

async function run() {
  const pUrl = `https://api.cloudflare.com/client/v4/accounts/${accountId}/pages/projects/tienganh7-pro`;
  const pRes = await fetch(pUrl, { headers: { Authorization: `Bearer ${token}` } });
  const pData = await pRes.json();
  console.log('Production branch:', pData.result?.production_branch);
  console.log('Domains:', pData.result?.domains);
  console.log('Canonical deploy URL:', pData.result?.canonical_deployment?.url);
}
run();
