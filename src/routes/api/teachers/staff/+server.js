import { json } from '@sveltejs/kit';
import { 
  getAllTeacherProfiles, 
  getTeacherProfile, 
  updateTeacherRoleAndSalary, 
  addTeacherAppraisalAndRating, 
  addTeacherBonus, 
  addTeacherPrivateReminder,
  acknowledgeTeacherReminder
} from '$lib/unifiedStore';

export const prerender = false;

export async function GET({ url }) {
  try {
    const teacherId = url.searchParams.get('teacher_id');
    if (teacherId) {
      const profile = getTeacherProfile(teacherId);
      if (!profile) return json({ success: false, error: 'Không tìm thấy hồ sơ' }, { status: 404 });
      return json({ success: true, profile });
    }

    const profiles = getAllTeacherProfiles();
    return json({ success: true, total: profiles.length, profiles });
  } catch (err) {
    return json({ success: false, error: err.message }, { status: 500 });
  }
}

export async function POST({ request }) {
  try {
    const body = await request.json();
    const action = body.action;
    const teacherId = body.teacher_id;

    if (!teacherId) return json({ success: false, error: 'Thiếu teacher_id' }, { status: 400 });

    if (action === 'update_role_salary') {
      const res = updateTeacherRoleAndSalary(teacherId, {
        role_type: body.role_type,
        role_title: body.role_title,
        base_salary_vnd: body.base_salary_vnd,
        rate_per_session_vnd: body.rate_per_session_vnd,
        salary_type: body.salary_type
      });
      return json(res);
    }

    if (action === 'add_appraisal') {
      const res = addTeacherAppraisalAndRating(teacherId, body.appraisal, body.rating);
      return json(res);
    }

    if (action === 'add_bonus') {
      const res = addTeacherBonus(teacherId, {
        amount_vnd: body.amount_vnd,
        reason: body.reason
      });
      return json(res);
    }

    if (action === 'send_private_reminder') {
      const res = addTeacherPrivateReminder(teacherId, {
        content: body.content,
        urgency: body.urgency
      });
      return json(res);
    }

    if (action === 'acknowledge_reminder') {
      const ok = acknowledgeTeacherReminder(teacherId, body.reminder_id);
      return json({ success: ok, message: 'Đã xác nhận đã đọc nhắc nhở' });
    }

    return json({ success: false, error: 'Hành động không hợp lệ' }, { status: 400 });
  } catch (err) {
    return json({ success: false, error: err.message }, { status: 500 });
  }
}
