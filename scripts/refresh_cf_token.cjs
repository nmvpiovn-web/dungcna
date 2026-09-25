const fs = require('fs');
const path = require('path');

const configPath = path.join(process.env.USERPROFILE, 'AppData/Roaming/xdg.config/.wrangler/config/default.toml');
const config = fs.readFileSync(configPath, 'utf8');
const refreshMatch = config.match(/refresh_token\s*=\s*"([^"]+)"/);

if (!refreshMatch) {
  console.log('No refresh token found');
  process.exit(1);
}

const refreshToken = refreshMatch[1];

async function refresh() {
  const body = new URLSearchParams({
    grant_type: 'refresh_token',
    client_id: '54d11594-84e4-41aa-b438-e81b8fa15e71',
    refresh_token: refreshToken
  });

  const res = await fetch('https://dash.cloudflare.com/oauth2/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString()
  });

  const data = await res.json();
  console.log('Refresh result:', data);

  if (data.access_token) {
    const expiresAt = new Date(Date.now() + (data.expires_in || 3600) * 1000).toISOString();
    const newConfig = config
      .replace(/oauth_token\s*=\s*"[^"]+"/, `oauth_token = "${data.access_token}"`)
      .replace(/expiration_time\s*=\s*"[^"]+"/, `expiration_time = "${expiresAt}"`)
      .replace(/refresh_token\s*=\s*"[^"]+"/, `refresh_token = "${data.refresh_token || refreshToken}"`);
    fs.writeFileSync(configPath, newConfig, 'utf8');
    console.log('Updated default.toml successfully with fresh access token!');
  }
}

refresh().catch(console.error);
