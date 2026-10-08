// /api/admincp/users — quản lý tài khoản (SUPERADMIN / ADMIN ONLY)
// GET: danh sách users (?q= tìm tên/username, ?role= lọc role). Không bao giờ trả password.
// POST: { action: 'update_role', user_id, role } | { action: 'toggle_status', user_id }
import { json } from '@sveltejs/kit';
import { verifyServerAuth } from '$lib/server/auth.js';

export const prerender = false;

const MANAGER_ROLES = new Set(['superadmin', 'admin']);
const ASSIGNABLE_ROLES = ['student', 'parent', 'teacher', 'leader', 'admin'];
const MAX_LIMIT = 500;

function isManagerUser(user) {
  if (!user) return false;
  return MANAGER_ROLES.has(String(user.role || '').toLowerCase());
}

async function requireManager(request, platform) {
  const auth = await verifyServerAuth(request, platform);
  if (!auth.authenticated) {
    return { error: json({ success: false, error: auth.error || 'Unauthorized: Vui lòng đăng nhập' }, { status: auth.status || 401 }) };
  }
  if (!isManagerUser(auth.user)) {
    return { error: json({ success: false, error: 'Forbidden: Chỉ superadmin/admin mới được quản lý tài khoản' }, { status: 403 }) };
  }
  return { user: auth.user };
}

// Bao giờ cũng loại bỏ password hash — kể cả với manager.
function sanitizeRow(r) {
  return {
    id: r.id,
    username: r.username,
    name: r.name,
    phone: r.phone || '',
    email: r.email || '',
    role: r.role,
    status: r.status || 'active',
    created_at: r.created_at
  };
}

export async function GET({ request, url, platform }) {
  const gate = await requireManager(request, platform);
  if (gate.error) return gate.error;

  const db = platform?.env?.DB;
  if (!db) {
    return json({ success: false, error: 'DatabaseUnavailable: Không thể tải danh sách khi thiếu kết nối D1' }, { status: 503 });
  }

  const q = String(url.searchParams.get('q') || '').trim();
  const role = String(url.searchParams.get('role') || 'all').toLowerCase();
  const limit = Math.min(MAX_LIMIT, Math.max(1, parseInt(url.searchParams.get('limit') || '200', 10) || 200));
  const offset = Math.max(0, parseInt(url.searchParams.get('offset') || '0', 10) || 0);

  try {
    let sql = `SELECT id, username, name, phone, email, role, status, created_at FROM users WHERE 1=1`;
    const params = [];
    if (q) {
      sql += ` AND (LOWER(name) LIKE ? OR LOWER(username) LIKE ?)`;
      const like = `%${q.toLowerCase()}%`;
      params.push(like, like);
    }
    if (role !== 'all') {
      sql += ` AND LOWER(role) = ?`;
      params.push(role);
    }
    sql += ` ORDER BY datetime(created_at) DESC LIMIT ? OFFSET ?`;
    params.push(limit, offset);

    const res = await db.prepare(sql).bind(...params).all();
    return json({
      success: true,
      users: (res.results || []).map(sanitizeRow),
      total: (res.results || []).length
    });
  } catch (err) {
    console.error('[api/admincp/users] GET error:', err);
    return json({ success: false, error: `DatabaseError: Không thể tải danh sách tài khoản (${err.message})` }, { status: 500 });
  }
}

export async function POST({ request, platform }) {
  const gate = await requireManager(request, platform);
  if (gate.error) return gate.error;
  const me = gate.user;

  let body = {};
  try {
    body = await request.json();
  } catch {
    return json({ success: false, error: 'InvalidJSON: Dữ liệu gửi lên không đúng định dạng JSON' }, { status: 400 });
  }

  const action = String(body.action || '');
  const userId = String(body.user_id || '').trim();
  if (!userId) {
    return json({ success: false, error: 'MissingUserId: Thiếu mã tài khoản' }, { status: 400 });
  }

  const db = platform?.env?.DB;
  if (!db) {
    return json({ success: false, error: 'DatabaseUnavailable: Không thể cập nhật khi thiếu kết nối D1' }, { status: 503 });
  }

  try {
    const target = await db.prepare(
      `SELECT id, username, name, role, status FROM users WHERE id = ? LIMIT 1;`
    ).bind(userId).first();
    if (!target) {
      return json({ success: false, error: 'UserNotFound: Không tìm thấy tài khoản' }, { status: 404 });
    }

    if (action === 'update_role') {
      const newRole = String(body.role || '').toLowerCase();
      if (!ASSIGNABLE_ROLES.includes(newRole)) {
        return json({ success: false, error: `InvalidRole: Role phải là một trong: ${ASSIGNABLE_ROLES.join(', ')}` }, { status: 400 });
      }
      // Chống tự hạ role của chính mình (tránh lock-out) và cấm đổi role superadmin nếu mình không phải superadmin.
      if (target.id === me.id) {
        return json({ success: false, error: 'SelfRoleChange: Không được tự đổi role của chính mình' }, { status: 403 });
      }
      if (String(target.role || '').toLowerCase() === 'superadmin' && String(me.role || '').toLowerCase() !== 'superadmin') {
        return json({ success: false, error: 'Forbidden: Chỉ superadmin mới được đổi role của superadmin' }, { status: 403 });
      }
      await db.prepare(`UPDATE users SET role = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?;`)
        .bind(newRole, userId).run();
      return json({ success: true, message: `Đã đổi role @${target.username} thành ${newRole}.`, user: { ...sanitizeRow(target), role: newRole } });
    }

    if (action === 'toggle_status') {
      if (target.id === me.id) {
        return json({ success: false, error: 'SelfLock: Không được tự khóa tài khoản của chính mình' }, { status: 403 });
      }
      const newStatus = (target.status || 'active') === 'locked' ? 'active' : 'locked';
      await db.prepare(`UPDATE users SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?;`)
        .bind(newStatus, userId).run();
      return json({
        success: true,
        message: newStatus === 'locked' ? `Đã khóa tài khoản @${target.username}.` : `Đã mở khóa tài khoản @${target.username}.`,
        user: { ...sanitizeRow(target), status: newStatus }
      });
    }

    return json({ success: false, error: `InvalidAction: action phải là update_role hoặc toggle_status` }, { status: 400 });
  } catch (err) {
    console.error('[api/admincp/users] POST error:', err);
    return json({ success: false, error: `DatabaseError: Không thể cập nhật tài khoản (${err.message})` }, { status: 500 });
  }
}
