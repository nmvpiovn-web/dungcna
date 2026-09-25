const fs = require('fs');
const path = require('path');
const configPath = path.join(process.env.USERPROFILE, 'AppData/Roaming/xdg.config/.wrangler/config/default.toml');
const config = fs.readFileSync(configPath, 'utf8');
const token = config.match(/oauth_token\s*=\s*"([^"]+)"/)[1];
const accountId = '9bca45c9a8ff34be86d4a4bf0cc0245f';

async function check() {
  const res = await fetch(`https://api.cloudflare.com/client/v4/accounts/${accountId}/d1/database`, {
    headers: { Authorization: `Bearer ${token}` }
  });
  const data = await res.json();
  console.log('D1 Databases:', JSON.stringify(data, null, 2));
}

check().catch(console.error);
