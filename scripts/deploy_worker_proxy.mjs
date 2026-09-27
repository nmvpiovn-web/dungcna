import { readFileSync } from 'fs';

async function updateWorker() {
  const toml = readFileSync('C:\\Users\\admin\\AppData\\Roaming\\xdg.config\\.wrangler\\config\\default.toml', 'utf8');
  const m = toml.match(/oauth_token\s*=\s*['"]([^'"]+)/);
  if (!m) throw new Error('No oauth token found');
  const token = m[1];

  const workerCode = readFileSync('scripts/cf_worker_proxy.js', 'utf8');

  const formData = new FormData();
  formData.append('metadata', new Blob([JSON.stringify({
    main_module: 'worker.js',
    compatibility_date: '2026-09-23'
  })], { type: 'application/json' }));

  formData.append('worker.js', new Blob([workerCode], {
    type: 'application/javascript+module'
  }), 'worker.js');

  const accountId = '9bca45c9a8ff34be86d4a4bf0cc0245f';
  const res = await fetch(`https://api.cloudflare.com/client/v4/accounts/${accountId}/workers/scripts/tienganh7`, {
    method: 'PUT',
    headers: {
      'Authorization': `Bearer ${token}`
    },
    body: formData
  });

  const data = await res.json();
  console.log('Update Worker Result:', JSON.stringify(data, null, 2));
}

updateWorker().catch(console.error);
