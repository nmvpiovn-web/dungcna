import { json } from '@sveltejs/kit';
import { verifyServerAuth, hashPassword, verifyPassword } from '../../../../lib/server/auth.js';

export async function POST({ request, platform }) {
  try {
    const auth = await verifyServerAuth(request, platform);
    if (!auth.authenticated) {
      return json({ success: false, error: 'Vui long dang nhap de thuc hien.' }, { status: 401 });
    }

    const db = platform?.env?.DB;
    if (!db) {
      return json({ success: false, error: 'Loi may chu: Khong the ket noi co so du lieu.' }, { status: 500 });
    }

    let body;
    try {
      body = await request.json();
    } catch {
      return json({ success: false, error: 'JSON khong hop le' }, { status: 400 });
    }

    const { old_password, new_password } = body;

    if (!old_password || !new_password) {
      return json({ success: false, error: 'Thieu mat khau cu hoac mat khau moi.' }, { status: 400 });
    }

    if (new_password.length < 6) {
      return json({ success: false, error: 'Mat khau moi phai co it nhat 6 ky tu.' }, { status: 400 });
    }

    // Verify old password
    const user = await db.prepare('SELECT password, metadata FROM users WHERE id = ?').bind(auth.user.id).first();
    if (!user) {
      return json({ success: false, error: 'Khong tim thay nguoi dung.' }, { status: 404 });
    }

    const isMatch = await verifyPassword(old_password, user.password);
    if (!isMatch) {
      return json({ success: false, error: 'Mat khau hien tai khong chinh xac.' }, { status: 401 });
    }

    const newHashed = await hashPassword(new_password);

    // Remove must_change_password from metadata
    await db.prepare(`
      UPDATE users
      SET password = ?,
          metadata = json_remove(COALESCE(metadata, '{}'), '$.must_change_password'),
          updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).bind(newHashed, auth.user.id).run();

    return json({ success: true, message: 'Doi mat khau thanh cong.' });
  } catch (err) {
    console.error('Change password error:', err);
    return json({ success: false, error: 'Loi may chu: Khong the xu ly yeu cau.' }, { status: 500 });
  }
}
