const fs = require('fs');
const path = require('path');

const configPath = path.join(process.env.USERPROFILE, 'AppData/Roaming/xdg.config/.wrangler/config/default.toml');
const config = fs.readFileSync(configPath, 'utf8');
const token = config.match(/oauth_token\s*=\s*"([^"]+)"/)[1];
const accountId = '9bca45c9a8ff34be86d4a4bf0cc0245f';
const dbUuid = 'a0d2d5f7-b4ae-48a3-99d6-ecac7ed87218'; // tienganh-pro-db

const users = JSON.parse(fs.readFileSync(path.join(__dirname, '../src/lib/data/users.json'), 'utf8'));

async function queryD1(sql) {
  const res = await fetch(`https://api.cloudflare.com/client/v4/accounts/${accountId}/d1/database/${dbUuid}/query`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ sql })
  });
  return await res.json();
}

async function run() {
  console.log('Altering D1 users table to add username, phone, password columns if not present...');
  try {
    await queryD1('ALTER TABLE users ADD COLUMN username TEXT;');
  } catch (e) {
    console.log('username column might already exist');
  }
  try {
    await queryD1('ALTER TABLE users ADD COLUMN phone TEXT;');
  } catch (e) {
    console.log('phone column might already exist');
  }
  try {
    await queryD1('ALTER TABLE users ADD COLUMN password TEXT;');
  } catch (e) {
    console.log('password column might already exist');
  }

  console.log('Updating user records in D1 with credentials...');
  for (const u of users) {
    const updateSql = `UPDATE users SET username = '${u.username}', phone = '${u.phone}', password = '${u.password}' WHERE id = '${u.id}';`;
    await queryD1(updateSql);
  }

  const check = await queryD1('SELECT id, name, username, phone, role FROM users LIMIT 5;');
  console.log('D1 Users updated sample:', JSON.stringify(check.result?.[0]?.results, null, 2));
}

run().catch(console.error);
