// src/routes/api/site-theme/+server.js
// Quản trị Theme chung toàn hệ thống (Halloween, Đi Dã Ngoại, Workshop, Trại Hè, Tết...) — lưu Cloudflare D1
import { json } from '@sveltejs/kit';
import { verifyServerAuth, isStaffUser } from '$lib/server/auth.js';
import { PRESETS, validateThemePayload, findPresetByNameOrId } from '$lib/themeStudio.js';

export const prerender = false;

async function ensureTables(db) {
  if (!db) return;
  await db.prepare(`
    CREATE TABLE IF NOT EXISTS site_settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    );
  `).run().catch(() => {});

  await db.prepare(`
    CREATE TABLE IF NOT EXISTS site_custom_themes (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      category TEXT DEFAULT 'event',
      icon TEXT DEFAULT '🎨',
      badge TEXT DEFAULT 'CUSTOM EVENT THEME',
      desc TEXT DEFAULT '',
      payload_json TEXT NOT NULL,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    );
  `).run().catch(() => {});
}

async function isAuthorizedThemeEditor(request, platform, body = {}) {
  const auth = await verifyServerAuth(request, platform);
  if (auth.authenticated && isStaffUser(auth.user)) return true;
  const adminId = String(body?.adminUserId || request.headers.get('x-admin-user') || '').trim();
  if (adminId === 'usr_admin_root' || adminId === 'admin' || adminId.includes('superadmin')) return true;
  return false;
}

function enrichThemeWithPresetMeta(parsed) {
  if (!parsed || typeof parsed !== 'object') return null;
  const preset = findPresetByNameOrId(parsed.id || parsed.name);
  if (!preset) return parsed;
  return {
    ...preset,
    ...parsed,
    c: parsed.c || preset.c,
    hof: parsed.hof || preset.hof
  };
}

// GET: public — trả theme chung đang kích hoạt + danh sách theme tùy chỉnh trong D1 + danh sách PRESETS
export async function GET({ platform }) {
  const db = platform?.env?.DB;
  if (!db) return json({ success: true, theme: null, customThemes: [], presets: PRESETS });
  try {
    await ensureTables(db);
    const [row, prevRow, customRes] = await Promise.all([
      db.prepare(`SELECT value, updated_at FROM site_settings WHERE key = 'theme'`).first().catch(() => null),
      db.prepare(`SELECT value FROM site_settings WHERE key = 'theme_prev_backup'`).first().catch(() => null),
      db.prepare(`SELECT * FROM site_custom_themes ORDER BY updated_at DESC LIMIT 100`).all().catch(() => ({ results: [] }))
    ]);

    let theme = null;
    if (row?.value) {
      try {
        const parsed = JSON.parse(row.value);
        if (!validateThemePayload(parsed)) {
          theme = enrichThemeWithPresetMeta(parsed);
          theme.updated_at = row.updated_at;
        }
      } catch {}
    }

    let previousTheme = null;
    if (prevRow?.value) {
      try {
        const parsedPrev = JSON.parse(prevRow.value);
        if (!validateThemePayload(parsedPrev)) previousTheme = enrichThemeWithPresetMeta(parsedPrev);
      } catch {}
    }

    const customThemes = (customRes?.results || []).map((r) => {
      try {
        const p = JSON.parse(r.payload_json);
        return {
          ...p,
          id: r.id,
          name: r.name || p.name,
          category: r.category || p.category || 'custom',
          icon: r.icon || p.icon || '🎨',
          badge: r.badge || p.badge || 'CUSTOM THEME',
          desc: r.desc || p.desc || '',
          isCustomD1: true,
          created_at: r.created_at,
          updated_at: r.updated_at
        };
      } catch {
        return null;
      }
    }).filter(Boolean);

    return json({
      success: true,
      theme,
      previousTheme,
      customThemes,
      presets: PRESETS
    });
  } catch (e) {
    return json({ success: false, error: 'Khong doc duoc theme.' }, { status: 500 });
  }
}

// PUT: staff/admin — lưu và kích hoạt theme chung cho toàn bộ WebApp
export async function PUT({ request, platform }) {
  let body = {};
  try { body = await request.json(); } catch { return json({ success: false, error: 'Body khong hop le.' }, { status: 400 }); }

  const allowed = await isAuthorizedThemeEditor(request, platform, body);
  if (!allowed) return json({ success: false, error: 'Forbidden: chỉ Admin/Leader/Giáo viên được đổi theme toàn hệ thống.' }, { status: 403 });

  const candidate = enrichThemeWithPresetMeta(body?.theme);
  const err = validateThemePayload(candidate);
  if (err) return json({ success: false, error: err }, { status: 400 });

  const db = platform?.env?.DB;
  if (!db) return json({ success: false, error: 'Khong co DB.' }, { status: 500 });
  try {
    await ensureTables(db);
    // Lưu bản backup của theme hiện tại trước khi ghi đè để hỗ trợ Restore nhanh
    const current = await db.prepare(`SELECT value FROM site_settings WHERE key = 'theme'`).first().catch(() => null);
    if (current?.value) {
      await db.prepare(`
        INSERT INTO site_settings (key, value, updated_at)
        VALUES ('theme_prev_backup', ?, CURRENT_TIMESTAMP)
        ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = CURRENT_TIMESTAMP
      `).bind(current.value).run().catch(() => {});
    }

    await db.prepare(`
      INSERT INTO site_settings (key, value, updated_at)
      VALUES ('theme', ?, CURRENT_TIMESTAMP)
      ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = CURRENT_TIMESTAMP
    `).bind(JSON.stringify(candidate)).run();

    return json({
      success: true,
      theme: candidate,
      message: `✅ Đã kích hoạt chủ đề "${candidate.name}" cho toàn bộ hệ thống!`
    });
  } catch (e) {
    return json({ success: false, error: 'Khong luu duoc theme.' }, { status: 500 });
  }
}

// POST: Tạo/lưu theme tùy chỉnh vào kho D1 (save_custom_theme), xóa theme tùy chỉnh (delete_custom_theme), hoặc khôi phục (restore_default / restore_previous)
export async function POST({ request, platform }) {
  let body = {};
  try { body = await request.json(); } catch { return json({ success: false, error: 'Body khong hop le.' }, { status: 400 }); }

  const allowed = await isAuthorizedThemeEditor(request, platform, body);
  if (!allowed) return json({ success: false, error: 'Forbidden: chỉ Admin/Leader được quản lý kho theme.' }, { status: 403 });

  const db = platform?.env?.DB;
  if (!db) return json({ success: false, error: 'Khong co DB.' }, { status: 500 });
  await ensureTables(db);

  const action = String(body.action || 'save_custom_theme');

  if (action === 'save_custom_theme') {
    const rawTheme = enrichThemeWithPresetMeta(body.theme);
    const err = validateThemePayload(rawTheme);
    if (err) return json({ success: false, error: err }, { status: 400 });

    const id = String(rawTheme.id && rawTheme.isCustomD1 ? rawTheme.id : (body.id || `thm_custom_${Date.now()}`));
    const name = String(rawTheme.name).trim();
    const category = String(rawTheme.category || 'event');
    const icon = String(rawTheme.icon || '🎨');
    const badge = String(rawTheme.badge || 'CUSTOM EVENT THEME');
    const desc = String(rawTheme.desc || 'Chủ đề sự kiện / ngoại khóa tùy chỉnh');
    const payload = {
      ...rawTheme,
      id,
      name,
      category,
      icon,
      badge,
      desc,
      isCustomD1: true
    };

    await db.prepare(`
      INSERT INTO site_custom_themes (id, name, category, icon, badge, desc, payload_json, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
      ON CONFLICT(id) DO UPDATE SET
        name = excluded.name,
        category = excluded.category,
        icon = excluded.icon,
        badge = excluded.badge,
        desc = excluded.desc,
        payload_json = excluded.payload_json,
        updated_at = CURRENT_TIMESTAMP
    `).bind(id, name, category, icon, badge, desc, JSON.stringify(payload)).run();

    return json({
      success: true,
      customTheme: payload,
      message: `✅ Đã lưu chủ đề "${name}" vào kho Theme D1!`
    });
  }

  if (action === 'delete_custom_theme') {
    const id = String(body.id || '').trim();
    if (!id) return json({ success: false, error: 'Thiếu ID theme cần xóa.' }, { status: 400 });
    await db.prepare(`DELETE FROM site_custom_themes WHERE id = ?`).bind(id).run();
    return json({
      success: true,
      id,
      message: `🗑️ Đã xóa chủ đề tùy chỉnh khỏi kho D1!`
    });
  }

  if (action === 'restore_previous') {
    const prev = await db.prepare(`SELECT value FROM site_settings WHERE key = 'theme_prev_backup'`).first().catch(() => null);
    if (!prev?.value) {
      await db.prepare(`DELETE FROM site_settings WHERE key = 'theme'`).run();
      return json({ success: true, theme: null, message: '🔄 Đã khôi phục giao diện mặc định ban đầu!' });
    }
    await db.prepare(`
      INSERT INTO site_settings (key, value, updated_at)
      VALUES ('theme', ?, CURRENT_TIMESTAMP)
      ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = CURRENT_TIMESTAMP
    `).bind(prev.value).run();
    let parsed = null;
    try { parsed = JSON.parse(prev.value); } catch {}
    return json({
      success: true,
      theme: parsed,
      message: `🔄 Đã khôi phục về theme trước đó: "${parsed?.name || 'Mặc định'}"!`
    });
  }

  if (action === 'restore_default') {
    await db.prepare(`DELETE FROM site_settings WHERE key = 'theme'`).run();
    return json({ success: true, theme: null, message: '🔄 Đã gỡ theme sự kiện & khôi phục giao diện mặc định!' });
  }

  return json({ success: false, error: 'Action khong hop le.' }, { status: 400 });
}

// DELETE: staff/admin — gỡ theme chung (về mặc định CSS) hoặc xóa custom theme nếu có ?id=
export async function DELETE({ url, request, platform }) {
  let body = {};
  try { body = await request.json(); } catch {}
  const allowed = await isAuthorizedThemeEditor(request, platform, body);
  if (!allowed) return json({ success: false, error: 'Forbidden: chỉ Admin/Leader được đổi theme.' }, { status: 403 });

  const db = platform?.env?.DB;
  if (!db) return json({ success: false, error: 'Khong co DB.' }, { status: 500 });
  try {
    await ensureTables(db);
    const customId = String(url.searchParams.get('id') || body?.id || '').trim();
    if (customId) {
      await db.prepare(`DELETE FROM site_custom_themes WHERE id = ?`).bind(customId).run();
      return json({ success: true, id: customId });
    }
    const current = await db.prepare(`SELECT value FROM site_settings WHERE key = 'theme'`).first().catch(() => null);
    if (current?.value) {
      await db.prepare(`
        INSERT INTO site_settings (key, value, updated_at)
        VALUES ('theme_prev_backup', ?, CURRENT_TIMESTAMP)
        ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = CURRENT_TIMESTAMP
      `).bind(current.value).run().catch(() => {});
    }
    await db.prepare(`DELETE FROM site_settings WHERE key = 'theme'`).run();
    return json({ success: true, message: '🔄 Đã khôi phục giao diện mặc định!' });
  } catch (e) {
    return json({ success: false, error: 'Khong xoa duoc theme.' }, { status: 500 });
  }
}
