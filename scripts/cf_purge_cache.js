// scripts/cf_purge_cache.js
import fs from 'fs';

const toml = fs.readFileSync('C:/Users/admin/AppData/Roaming/xdg.config/.wrangler/config/default.toml', 'utf8');
const match = toml.match(/oauth_token\s*=\s*"([^"]+)"/);
if (!match) {
  console.error('No oauth_token found in default.toml');
  process.exit(1);
}
const token = match[1];

async function main() {
  console.log('Querying zone for timbk.io.vn...');
  const res = await fetch('https://api.cloudflare.com/client/v4/zones?name=timbk.io.vn', {
    headers: { 'Authorization': `Bearer ${token}` }
  });
  const data = await res.json();
  console.log('Zone response success:', data.success);
  if (!data.success || !data.result || data.result.length === 0) {
    console.error('Zone not found:', data);
    process.exit(1);
  }

  const zoneId = data.result[0].id;
  console.log('Zone ID:', zoneId);

  console.log('Purging entire cache for zone...');
  const purgeRes = await fetch(`https://api.cloudflare.com/client/v4/zones/${zoneId}/purge_cache`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ purge_everything: true })
  });

  const purgeData = await purgeRes.json();
  console.log('Purge result:', purgeData);
}

main().catch(console.error);
