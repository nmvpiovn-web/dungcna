import { json } from '@sveltejs/kit';
import { verifyServerAuth, isStaffUser } from '$lib/server/auth.js';

export const prerender = false;

// Fallback in-memory campuses store when DB is in dev mode or mock
const FALLBACK_CAMPUSES = [
  {
    id: 'loc_codung',
    name: 'Nhà Cô Dung (Trụ Sở Chính - Linh Xuân)',
    short_code: 'CODUNG',
    address: 'Khu phố 3, Phường Linh Xuân, TP. Thủ Đức, TP. Hồ Chí Minh',
    hotline: '0912345678',
    manager_user_id: 'user_msdung',
    latitude: 10.8735,
    longitude: 106.7710,
    distance_to_daosontay_m: 350,
    is_active: 1
  },
  {
    id: 'loc_sunshine',
    name: 'Trung Tâm Tiếng Anh Sunshine Academy',
    short_code: 'SUNSHINE',
    address: 'Khu dân cư Sunshine, Linh Trung, TP. Thủ Đức, TP. Hồ Chí Minh',
    hotline: '0987654321',
    manager_user_id: 'user_teacher_quynh',
    latitude: 10.8780,
    longitude: 106.7760,
    distance_to_daosontay_m: 650,
    is_active: 1
  },
  {
    id: 'loc_thayvu',
    name: 'Trung Tâm Học Liệu & Luyện Thi Thầy Vũ',
    short_code: 'THAYVU',
    address: 'Đường Kha Vạn Cân, Linh Chiểu, TP. Thủ Đức, TP. Hồ Chí Minh',
    hotline: '0901234567',
    manager_user_id: 'user_thayvu',
    latitude: 10.8690,
    longitude: 106.7680,
    distance_to_daosontay_m: 900,
    is_active: 1
  },
  {
    id: 'center_daosontay',
    name: 'Trường Tiểu Học Đào Sơn Tây (Cụm Vệ Tinh Trọng Tâm)',
    short_code: 'DAOSONTAY',
    address: 'Đường số 8, Phường Linh Xuân, TP. Thủ Đức, TP. Hồ Chí Minh',
    hotline: '02837241234',
    manager_user_id: 'user_msdung',
    latitude: 10.8753,
    longitude: 106.7725,
    distance_to_daosontay_m: 0,
    is_active: 1
  }
];

let inMemoryStreams = [];

async function ensureTables(db) {
  if (!db) return;
  try {
    await db.batch([
      db.prepare(`
        CREATE TABLE IF NOT EXISTS campuses (
          id TEXT PRIMARY KEY,
          name TEXT NOT NULL,
          short_code TEXT NOT NULL UNIQUE,
          address TEXT NOT NULL,
          hotline TEXT,
          manager_user_id TEXT,
          is_active INTEGER DEFAULT 1,
          created_at TEXT DEFAULT CURRENT_TIMESTAMP
        );
      `),
      db.prepare(`
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
      `),
      db.prepare(`
        INSERT OR IGNORE INTO campuses (id, name, short_code, address, hotline, manager_user_id) VALUES
          ('loc_codung', 'Nhà Cô Dung (Trụ Sở Chính)', 'CODUNG', 'Số 18, Ngõ 42, Phố Triều Khúc, Thanh Xuân, Hà Nội', '0912345678', 'user_msdung'),
          ('loc_sunshine', 'Trung Tâm Tiếng Anh Sunshine Academy', 'SUNSHINE', 'Tòa Sunshine Riverside, Phú Thượng, Tây Hồ, Hà Nội', '0987654321', 'user_teacher_quynh'),
          ('loc_thayvu', 'Trung Tâm Học Liệu & Luyện Thi Thầy Vũ', 'THAYVU', 'Số 105, Đường Cầu Giấy, Quan Hoa, Cầu Giấy, Hà Nội', '0901234567', 'user_thayvu');
      `)
    ]);
  } catch (e) {
    throw e;
  }
}

export async function GET({ request, url, platform }) {
  const auth = await verifyServerAuth(request, platform);
  if (!auth.authenticated) return json({ success: false, error: auth.error }, { status: auth.status || 401 });

  const view = url.searchParams.get('view');
  const isSummary = view === 'summary';

  // If not summary, require staff privilege
  if (!isSummary && !isStaffUser(auth.user)) {
    return json({ success: false, error: 'Forbidden: Chỉ staff được xem dữ liệu cơ sở đầy đủ.' }, { status: 403 });
  }

  const campusId = url.searchParams.get('campus_id') || 'all';
  const includeStreams = !isSummary && (url.searchParams.get('streams') === 'true');
  const limit = Math.min(100, Math.max(1, parseInt(url.searchParams.get('limit') || '30', 10)));

  const db = platform?.env?.DB;

  if (db) {
    try {
      await ensureTables(db);
      const campusesRes = await db.prepare('SELECT * FROM campuses WHERE is_active = 1 ORDER BY id ASC').all();
      let campuses = campusesRes.results || [];

      if (isSummary) {
        campuses = campuses.map(c => ({
          id: c.id,
          name: c.name,
          short_code: c.short_code
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
        let params = [];
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
      return json({ success: false, error: 'DatabaseError: Không thể đọc dữ liệu cơ sở.' }, { status: 503 });
    }
  }

  if (platform?.env?.ENABLE_LOCAL_MOCK !== 'true') return json({ success: false, error: 'DatabaseUnavailable: Thiếu D1 binding.' }, { status: 503 });

  // Local fallback
  let campuses = FALLBACK_CAMPUSES;
  if (isSummary) {
    campuses = campuses.map(c => ({
      id: c.id,
      name: c.name,
      short_code: c.short_code
    }));
    return json({
      success: true,
      campuses,
      streams: []
    });
  }

  let streams = inMemoryStreams;
  if (campusId !== 'all') {
    streams = streams.filter(s => s.campus_id === campusId);
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
  if (!auth.authenticated) return json({ success: false, error: auth.error }, { status: auth.status || 401 });
  if (!isStaffUser(auth.user)) {
    return json({ success: false, error: 'Forbidden: Bạn không có quyền quản lý cơ sở hoặc tạo sự kiện' }, { status: 403 });
  }

  let body = {};
  try {
    body = await request.json();
  } catch {
    return json({ success: false, error: 'InvalidJSON: Payload yêu cầu JSON hợp lệ' }, { status: 400 });
  }

  const { action } = body;
  const db = platform?.env?.DB;
  if (!db && platform?.env?.ENABLE_LOCAL_MOCK !== 'true') return json({ success: false, error: 'DatabaseUnavailable: Thiếu D1 binding.' }, { status: 503 });

  if (action === 'log_stream') {
    const { campus_id, activity_type, title, detail, reference_id } = body;
    if (!campus_id || !title) {
      return json({ success: false, error: 'Thiếu campus_id hoặc title của sự kiện' }, { status: 400 });
    }

    const streamItem = {
      id: `stm_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      campus_id,
      actor_id: auth.user.id,
      actor_name: auth.user.name || auth.user.username,
      actor_role: auth.user.role,
      activity_type: activity_type || 'general_activity',
      title,
      detail: detail || '',
      reference_id: reference_id || null,
      created_at: new Date().toISOString()
    };

    if (db) {
      try {
        await ensureTables(db);
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
    }

    if (!db) {
      inMemoryStreams.unshift(streamItem);
      if (inMemoryStreams.length > 200) inMemoryStreams = inMemoryStreams.slice(0, 200);
    }

    return json({ success: true, message: 'Đã ghi nhận sự kiện luồng cơ sở thành công', stream: streamItem });
  }

  return json({ success: false, error: `Hành động không hợp lệ: '${action}'` }, { status: 400 });
}
