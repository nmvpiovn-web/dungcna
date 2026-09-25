const fs = require('fs');
const path = require('path');

const configPath = path.join(process.env.USERPROFILE, 'AppData/Roaming/xdg.config/.wrangler/config/default.toml');
const config = fs.readFileSync(configPath, 'utf8');
const token = config.match(/oauth_token\s*=\s*"([^"]+)"/)[1];
const accountId = '9bca45c9a8ff34be86d4a4bf0cc0245f';
const dbUuid = 'a0d2d5f7-b4ae-48a3-99d6-ecac7ed87218';

async function bindD1ToPages() {
  const getRes = await fetch(`https://api.cloudflare.com/client/v4/accounts/${accountId}/pages/projects/tienganh7-pro`, {
    headers: { Authorization: `Bearer ${token}` }
  });
  const project = (await getRes.json()).result;
  console.log('Project current configs:', project.deployment_configs);

  const updateBody = {
    deployment_configs: {
      production: {
        d1_databases: {
          DB: {
            id: dbUuid
          }
        },
        compatibility_date: "2026-09-23"
      },
      preview: {
        d1_databases: {
          DB: {
            id: dbUuid
          }
        },
        compatibility_date: "2026-09-23"
      }
    }
  };

  const patchRes = await fetch(`https://api.cloudflare.com/client/v4/accounts/${accountId}/pages/projects/tienganh7-pro`, {
    method: 'PATCH',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(updateBody)
  });
  const patchData = await patchRes.json();
  console.log('Patch result:', patchData.success ? 'D1 Bound Successfully to Cloudflare Pages!' : patchData.errors);
}

bindD1ToPages().catch(console.error);
