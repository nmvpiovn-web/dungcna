const fs = require('fs');

const tomlPath = 'C:\\Users\\admin\\AppData\\Roaming\\xdg.config\\.wrangler\\config\\default.toml';
const content = fs.readFileSync(tomlPath, 'utf8');
const tokenMatch = content.match(/oauth_token\s*=\s*"([^"]+)"/);
if (!tokenMatch) {
  console.log('Token not found');
  process.exit(1);
}
const token = tokenMatch[1];
const accountId = '9bca45c9a8ff34be86d4a4bf0cc0245f';
const projectName = 'tienganh7-pro';

async function checkDomains() {
  const url = `https://api.cloudflare.com/client/v4/accounts/${accountId}/pages/projects/${projectName}/domains`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` }
  });
  const data = await res.json();
  if (data.result) {
    for (const d of data.result) {
      console.log(`Domain: ${d.name} | Status: ${d.status} | Error: ${d.verification_data?.error_message || 'None'}`);
    }
  } else {
    console.log(data);
  }
}

checkDomains().catch(console.error);
