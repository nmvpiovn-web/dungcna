const fs = require('fs');

const tomlPath = 'C:\\Users\\admin\\AppData\\Roaming\\xdg.config\\.wrangler\\config\\default.toml';
const content = fs.readFileSync(tomlPath, 'utf8');
const token = content.match(/oauth_token\s*=\s*"([^"]+)"/)[1];
const accountId = '9bca45c9a8ff34be86d4a4bf0cc0245f';
const workerName = 'tienganh7';

async function testWorkerInfo() {
  const url = `https://api.cloudflare.com/client/v4/accounts/${accountId}/workers/scripts/${workerName}`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` }
  });
  console.log('Worker get status:', res.status);
  const data = await res.json();
  console.log('Worker get result:', data.success);
}

testWorkerInfo().catch(console.error);
