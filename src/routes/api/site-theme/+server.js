// src/routes/api/site-theme/+server.js
// Theme chung cua web do admin chon — luu D1, ap dung cho moi visitor.
import { json } from '@sveltejs/kit';
import { verifyServerAuth, isStaffUser } from '$lib/server/auth.js';
import { validateThemePayload } from '$lib/themeStudio.js';

export const prerender = false;

async function ensureTables(db) {
  if (!db) return;
  await db.prepare(`
    CREATE TABLE IF NOT EXISTS site_settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    );
  `).run();
}

// GET: public — tra theme chung (null = dung mac dinh trong CSS)
export async function GET({ platform }) {
  const db = platform?.env?.DB;
  if (!db) return json({ success: true, theme: null });
  try {
    await ensureTables(db);
    const row = await db.prepare(`SELECT value FROM site_settings WHERE key = 'theme'`).first();
    let theme = null;
    if (row?.value) {
      try {
        const parsed = JSON.parse(row.value);
        if (!validateThemePayload(parsed)) theme = parsed;
      } catch {}
    }
    return json({ success: true, theme });
  } catch (e) {
    return json({ success: false, error: 'Khong doc duoc theme.' }, { status: 500 });
  }
}

// PUT: staff only — luu theme chung
export async function PUT({ request, platform }) {
  const auth = await verifyServerAuth(request, platform);
  if (!auth.authenticated) return json({ success: false, error: auth.error }, { status: auth.status || 401 });
  if (!isStaffUser(auth.user)) return json({ success: false, error: 'Forbidden: chi staff duoc doi theme.' }, { status: 403 });

  let body;
  try { body = await request.json(); } catch { return json({ success: false, error: 'Body khong hop le.' }, { status: 400 }); }
  const err = validateThemePayload(body?.theme);
  if (err) return json({ success: false, error: err }, { status: 400 });

  const db = platform?.env?.DB;
  if (!db) return json({ success: false, error: 'Khong co DB.' }, { status: 500 });
  try {
    await ensureTables(db);
    await db.prepare(`
      INSERT INTO site_settings (key, value, updated_at)
      VALUES ('theme', ?, CURRENT_TIMESTAMP)
      ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = CURRENT_TIMESTAMP
    `).bind(JSON.stringify(body.theme)).run();
    return json({ success: true });
  } catch (e) {
    return json({ success: false, error: 'Khong luu duoc theme.' }, { status: 500 });
  }
}

// DELETE: staff only — go theme chung, ve mac dinh CSS
export async function DELETE({ request, platform }) {
  const auth = await verifyServerAuth(request, platform);
  if (!auth.authenticated) return json({ success: false, error: auth.error }, { status: auth.status || 401 });
  if (!isStaffUser(auth.user)) return json({ success: false, error: 'Forbidden: chi staff duoc doi theme.' }, { status: 403 });

  const db = platform?.env?.DB;
  if (!db) return json({ success: false, error: 'Khong co DB.' }, { status: 500 });
  try {
    await ensureTables(db);
    await db.prepare(`DELETE FROM site_settings WHERE key = 'theme'`).run();
    return json({ success: true });
  } catch (e) {
    return json({ success: false, error: 'Khong xoa duoc theme.' }, { status: 500 });
  }
}
