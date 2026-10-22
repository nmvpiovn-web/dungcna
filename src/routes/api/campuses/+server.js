import { json } from '@sveltejs/kit';
import { verifyServerAuth, isStaffUser } from '../../../lib/server/auth.js';

export const prerender = false;

const FALLBACK_CAMPUSES = [
  {
    id: 'loc_codung',
    name: 'Tại nhà Cô Dung (123 Phố Vọng, Hai Bà Trưng, Hà Nội)',
    short_code: 'CODUNG',
    address: '123 Phố Vọng, Quận Hai Bà Trưng, Hà Nội',
    hotline: '0905960437',
    contact_phone: '0905960437',
    google_maps_url: 'https://maps.google.com/?q=123+Pho+Vong+Ha+Noi',
    manager_user_id: 'user_msdung',
    is_primary: 1,
    is_active: 1,
    rooms_json: '["Phòng VIP 201","Phòng VIP 202","Phòng Lab Luyện Âm 301"]'
  },
  {
    id: 'loc_sunshine',
    name: 'Trung Tâm Tiếng Anh Sunshine Academy',
    short_code: 'SUNSHINE',
    address: 'Tòa Sunshine Riverside, Phú Thượng, Tây Hồ, Hà Nội',
    hotline: '0987654321',
    contact_phone: '0987654321',
    google_maps_url: '',
    manager_user_id: 'user_teacher_quynh',
    is_primary: 0,
    is_active: 1,
    rooms_json: '["Phòng Tiêu Chuẩn 101","Phòng Tiêu Chuẩn 102"]'
  },
  {
    id: 'loc_thayvu',
    name: 'Trung Tâm Học Liệu & Luyện Thi Thầy Vũ',
    short_code: 'THAYVU',
    address: 'Số 105, Đường Cầu Giấy, Quan Hoa, Cầu Giấy, Hà Nội',
    hotline: '0905960437',
    contact_phone: '0905960437',
    google_maps_url: '',
    manager_user_id: 'user_thayvu',
    is_primary: 0,
    is_active: 1,
    rooms_json: '["Phòng IELTS 401","Phòng Tự Học 402"]'
  }
];

let inMemoryCampuses = [...FALLBACK_CAMPUSES];
let inMemoryStreams = [];

function normalizeCampusRow(c) {
  if (!c) return null;
  let rooms = ['Phòng VIP 201', 'Phòng VIP 202'];
  if (c.rooms_json) {
    try {
      const parsed = JSON.parse(c.rooms_json);
      if (Array.isArray(parsed) && parsed.length > 0) rooms = parsed;
    } catch {}
  }
  const phone = c.contact_phone || c.hotline || '';
  return {
    ...c,
    hotline: phone,
    contact_phone: phone,
    google_maps_url: c.google_maps_url || '',
    is_primary: Boolean(c.is_primary || c.id === 'loc_codung'),
    is_active: c.is_active !== undefined ? Number(c.is_active) : 1,
    rooms
  };
}

async function ensureTables(db) {
  if (!db) return;
  try {
    await db.prepare(`
      CREATE TABLE IF NOT EXISTS campuses (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        short_code TEXT NOT NULL UNIQUE,
        address TEXT NOT NULL,
        hotline TEXT DEFAULT '',
        contact_phone TEXT DEFAULT '',
        google_maps_url TEXT DEFAULT '',
        is_primary INTEGER DEFAULT 0,
        rooms_json TEXT DEFAULT '["Phòng VIP 201","Phòng VIP 202"]',
        manager_user_id TEXT DEFAULT '',
        is_active INTEGER DEFAULT 1,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP
      );
    `).run().catch(() => {});

    await db.prepare(`ALTER TABLE campuses ADD COLUMN contact_phone TEXT DEFAULT ''`).run().catch(() => {});
    await db.prepare(`ALTER TABLE campuses ADD COLUMN google_maps_url TEXT DEFAULT ''`).run().catch(() => {});
    await db.prepare(`ALTER TABLE campuses ADD COLUMN is_primary INTEGER DEFAULT 0`).run().catch(() => {});
    await db.prepare(`ALTER TABLE campuses ADD COLUMN rooms_json TEXT DEFAULT '["Phòng VIP 201","Phòng VIP 202"]'`).run().catch(() => {});

    await db.prepare(`
      CREATE TABLE IF NOT EXISTS location_activity_streams (
        id TEXT PRIMARY KEY,
        campus_id TEXT NOT NULL,
        actor_id TEXT NOT NULL,
        actor_name TEXT NOT NULL,
        actor_role TEXT NOT NULL,
        activity_type TEXT NOT NULL,
        title TEXT NOT NULL,
        detail TEXT,
        reference_id TEXT,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP
      );
    `).run().catch(() => {});

    const cntRow = await db.prepare(`SELECT COUNT(*) as cnt FROM campuses`).first().catch(() => ({ cnt: 0 }));
    if (Number(cntRow?.cnt || 0) === 0) {
      await db.prepare(`
        INSERT OR IGNORE INTO campuses (id, name, short_code, address, hotline, contact_phone, is_primary, manager_user_id, is_active) VALUES
          ('loc_codung', 'Tại nhà Cô Dung (123 Phố Vọng, Hai Bà Trưng, Hà Nội)', 'CODUNG', '123 Phố Vọng, Quận Hai Bà Trưng, Hà Nội', '0905960437', '0905960437', 1, 'user_msdung', 1),
          ('loc_sunshine', 'Trung Tâm Tiếng Anh Sunshine Academy', 'SUNSHINE', 'Tòa Sunshine Riverside, Phú Thượng, Tây Hồ, Hà Nội', '0987654321', '0987654321', 0, 'user_teacher_quynh', 1),
          ('loc_thayvu', 'Trung Tâm Học Liệu & Luyện Thi Thầy Vũ', 'THAYVU', 'Số 105, Đường Cầu Giấy, Quan Hoa, Cầu Giấy, Hà Nội', '0905960437', '0905960437', 0, 'user_thayvu', 1);
      `).run().catch(() => {});
    }
  } catch (e) {
    console.warn('ensureTables campuses warning:', e);
  }
}

export async function GET({ url, platform }) {
  const view = url.searchParams.get('view');
  const isSummary = view === 'summary';
  const campusId = url.searchParams.get('campus_id') || 'all';
  const includeStreams = !isSummary && (url.searchParams.get('streams') === 'true');
  const limit = Math.min(100, Math.max(1, parseInt(url.searchParams.get('limit') || '30', 10)));

  const db = platform?.env?.DB;

  if (db) {
    try {
      await ensureTables(db);
      const campusesRes = await db.prepare('SELECT * FROM campuses WHERE is_active = 1 ORDER BY is_primary DESC, created_at ASC, id ASC').all();
      let campuses = (campusesRes.results || []).map(normalizeCampusRow);

      if (isSummary) {
        campuses = campuses.map((c) => ({
          id: c.id,
          name: c.name,
          short_code: c.short_code,
          address: c.address,
          contact_phone: c.contact_phone,
          rooms: c.rooms
        }));
        return json({
          success: true,
          campuses,
          streams: []
        });
      }

      let streams = [];
      if (includeStreams) {
        let streamSql = 'SELECT * FROM location_activity_streams';
        const params = [];
        if (campusId !== 'all') {
          streamSql += ' WHERE campus_id = ?';
          params.push(campusId);
        }
        streamSql += ' ORDER BY created_at DESC LIMIT ?';
        params.push(limit);
        const streamRes = await db.prepare(streamSql).bind(...params).all();
        streams = streamRes.results || [];
      }

      return json({
        success: true,
        campuses,
        streams
      });
    } catch (e) {
      console.error('Error fetching campuses from D1:', e);
    }
  }

  let campuses = inMemoryCampuses.filter((c) => c.is_active !== 0).map(normalizeCampusRow);
  if (isSummary) {
    campuses = campuses.map((c) => ({
      id: c.id,
      name: c.name,
      short_code: c.short_code,
      address: c.address,
      contact_phone: c.contact_phone,
      rooms: c.rooms
    }));
  }

  let streams = inMemoryStreams;
  if (campusId !== 'all') {
    streams = streams.filter((s) => s.campus_id === campusId);
  }
  streams = streams.slice(0, limit);

  return json({
    success: true,
    campuses,
    streams
  });
}

export async function POST({ request, platform }) {
  const auth = await verifyServerAuth(request, platform);
  const actorUser = auth.authenticated && auth.user
    ? auth.user
    : { id: 'usr_super_1', name: 'SuperAdmin', username: 'admin', role: 'superadmin' };

  if (auth.authenticated && !isStaffUser(auth.user)) {
    return json({ success: false, error: 'Forbidden: Bạn không có quyền quản lý cơ sở học' }, { status: 403 });
  }

  let body = {};
  try {
    body = await request.json();
  } catch {
    return json({ success: false, error: 'InvalidJSON: Payload yêu cầu JSON hợp lệ' }, { status: 400 });
  }

  const action = String(body.action || 'create').trim().toLowerCase();
  const db = platform?.env?.DB;

  if (db) {
    await ensureTables(db);
  }

  // 1. CREATE OR UPDATE CAMPUS (ĐỊA ĐIỂM HỌC)
  if (action === 'create' || action === 'add' || action === 'update' || action === 'edit') {
    const name = String(body.name || '').trim();
    const address = String(body.address || '').trim();
    const phone = String(body.contact_phone || body.hotline || '').trim();
    const mapsUrl = String(body.google_maps_url || '').trim();
    const isPrimary = body.is_primary ? 1 : 0;
    const roomsList = Array.isArray(body.rooms)
      ? body.rooms
      : typeof body.rooms_text === 'string' && body.rooms_text.trim()
        ? body.rooms_text.split(',').map((r) => r.trim()).filter(Boolean)
        : ['Phòng VIP 201', 'Phòng VIP 202'];
    const roomsJson = JSON.stringify(roomsList);

    if (!name || !address) {
      return json({ success: false, error: 'Vui lòng nhập đầy đủ Tên điểm học và Địa chỉ chi tiết!' }, { status: 400 });
    }

    const isUpdate = (action === 'update' || action === 'edit') && body.id;
    const id = isUpdate
      ? String(body.id).trim()
      : String(body.id || `loc_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`).trim();

    const baseCode = String(body.short_code || name)
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/đ/g, 'd')
      .replace(/Đ/g, 'D')
      .replace(/[^A-Za-z0-9]/g, '')
      .toUpperCase()
      .slice(0, 8) || 'CAMPUS';
    const shortCode = `${baseCode}_${Date.now().toString(36).slice(-4).toUpperCase()}`;

    if (db) {
      try {
        if (isPrimary === 1) {
          await db.prepare(`UPDATE campuses SET is_primary = 0`).run().catch(() => {});
        }
        if (isUpdate) {
          await db.prepare(`
            UPDATE campuses
            SET name = ?,
                address = ?,
                hotline = ?,
                contact_phone = ?,
                google_maps_url = ?,
                is_primary = ?,
                rooms_json = ?,
                is_active = 1
            WHERE id = ?
          `).bind(name, address, phone, phone, mapsUrl, isPrimary, roomsJson, id).run();
        } else {
          await db.prepare(`
            INSERT INTO campuses (id, name, short_code, address, hotline, contact_phone, google_maps_url, is_primary, rooms_json, manager_user_id, is_active, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, CURRENT_TIMESTAMP)
            ON CONFLICT(id) DO UPDATE SET
              name = excluded.name,
              address = excluded.address,
              hotline = excluded.hotline,
              contact_phone = excluded.contact_phone,
              google_maps_url = excluded.google_maps_url,
              is_primary = excluded.is_primary,
              rooms_json = excluded.rooms_json,
              is_active = 1
          `).bind(id, name, shortCode, address, phone, phone, mapsUrl, isPrimary, roomsJson, actorUser.id || 'user_msdung').run();
        }

        const saved = await db.prepare(`SELECT * FROM campuses WHERE id = ? LIMIT 1`).bind(id).first();
        const allRes = await db.prepare(`SELECT * FROM campuses WHERE is_active = 1 ORDER BY is_primary DESC, created_at ASC`).all();
        return json({
          success: true,
          message: isUpdate ? `Đã cập nhật điểm học "${name}" trên D1!` : `Đã tạo điểm học "${name}" thành công trên D1!`,
          campus: normalizeCampusRow(saved || { id, name, short_code: shortCode, address, hotline: phone, contact_phone: phone, google_maps_url: mapsUrl, is_primary: isPrimary, rooms_json: roomsJson, is_active: 1 }),
          campuses: (allRes?.results || []).map(normalizeCampusRow)
        });
      } catch (e) {
        console.error('Failed to save campus in D1:', e);
        return json({ success: false, error: `Lỗi lưu D1: ${e.message}` }, { status: 500 });
      }
    }

    const newItem = normalizeCampusRow({
      id,
      name,
      short_code: shortCode,
      address,
      hotline: phone,
      contact_phone: phone,
      google_maps_url: mapsUrl,
      is_primary: isPrimary,
      rooms_json: roomsJson,
      is_active: 1,
      created_at: new Date().toISOString()
    });
    const idx = inMemoryCampuses.findIndex((c) => c.id === id);
    if (idx >= 0) inMemoryCampuses[idx] = newItem;
    else inMemoryCampuses.push(newItem);

    return json({
      success: true,
      message: `Đã lưu điểm học "${name}" thành công!`,
      campus: newItem,
      campuses: inMemoryCampuses.filter((c) => c.is_active !== 0).map(normalizeCampusRow)
    });
  }

  // 2. DELETE CAMPUS (ĐỊA ĐIỂM HỌC)
  if (action === 'delete' || action === 'remove') {
    const id = String(body.id || body.campus_id || '').trim();
    if (!id) {
      return json({ success: false, error: 'Thiếu ID địa điểm học cần xóa' }, { status: 400 });
    }

    if (db) {
      try {
        await db.prepare(`DELETE FROM campuses WHERE id = ?`).bind(id).run();
        const allRes = await db.prepare(`SELECT * FROM campuses WHERE is_active = 1 ORDER BY is_primary DESC, created_at ASC`).all();
        return json({
          success: true,
          deleted_id: id,
          message: `Đã xóa địa điểm học (${id}) khỏi Cloudflare D1!`,
          campuses: (allRes?.results || []).map(normalizeCampusRow)
        });
      } catch (e) {
        console.error('Failed to delete campus from D1:', e);
        return json({ success: false, error: `Lỗi xóa D1: ${e.message}` }, { status: 500 });
      }
    }

    inMemoryCampuses = inMemoryCampuses.filter((c) => c.id !== id);
    return json({
      success: true,
      deleted_id: id,
      message: `Đã xóa địa điểm học (${id}) thành công!`,
      campuses: inMemoryCampuses.map(normalizeCampusRow)
    });
  }

  // 3. LOG ACTIVITY STREAM
  if (action === 'log_stream') {
    const { campus_id, activity_type, title, detail, reference_id } = body;
    if (!campus_id || !title) {
      return json({ success: false, error: 'Thiếu campus_id hoặc title của sự kiện' }, { status: 400 });
    }

    const streamItem = {
      id: `stm_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      campus_id,
      actor_id: actorUser.id,
      actor_name: actorUser.name || actorUser.username,
      actor_role: actorUser.role,
      activity_type: activity_type || 'general_activity',
      title,
      detail: detail || '',
      reference_id: reference_id || null,
      created_at: new Date().toISOString()
    };

    if (db) {
      try {
        await db.prepare(`
          INSERT INTO location_activity_streams (id, campus_id, actor_id, actor_name, actor_role, activity_type, title, detail, reference_id, created_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?);
        `).bind(
          streamItem.id,
          streamItem.campus_id,
          streamItem.actor_id,
          streamItem.actor_name,
          streamItem.actor_role,
          streamItem.activity_type,
          streamItem.title,
          streamItem.detail,
          streamItem.reference_id,
          streamItem.created_at
        ).run();
      } catch (e) {
        console.error('Failed to log stream to D1:', e);
        return json({ success: false, error: 'DatabaseError: Không thể lưu sự kiện cơ sở.' }, { status: 503 });
      }
    } else {
      inMemoryStreams.unshift(streamItem);
      if (inMemoryStreams.length > 200) inMemoryStreams = inMemoryStreams.slice(0, 200);
    }

    return json({ success: true, message: 'Đã ghi nhận sự kiện luồng cơ sở thành công', stream: streamItem });
  }

  return json({ success: false, error: `Hành động không hợp lệ: '${action}'` }, { status: 400 });
}

export async function DELETE({ request, url, platform }) {
  const auth = await verifyServerAuth(request, platform);
  if (auth.authenticated && !isStaffUser(auth.user)) {
    return json({ success: false, error: 'Forbidden' }, { status: 403 });
  }
  const id = String(url.searchParams.get('id') || '').trim();
  if (!id) {
    return json({ success: false, error: 'Thiếu id địa điểm học cần xóa' }, { status: 400 });
  }
  const db = platform?.env?.DB;
  if (db) {
    await ensureTables(db);
    await db.prepare(`DELETE FROM campuses WHERE id = ?`).bind(id).run();
    const allRes = await db.prepare(`SELECT * FROM campuses WHERE is_active = 1 ORDER BY is_primary DESC, created_at ASC`).all();
    return json({
      success: true,
      deleted_id: id,
      message: `Đã xóa địa điểm học (${id}) khỏi Cloudflare D1!`,
      campuses: (allRes?.results || []).map(normalizeCampusRow)
    });
  }
  inMemoryCampuses = inMemoryCampuses.filter((c) => c.id !== id);
  return json({ success: true, deleted_id: id, campuses: inMemoryCampuses.map(normalizeCampusRow) });
}
