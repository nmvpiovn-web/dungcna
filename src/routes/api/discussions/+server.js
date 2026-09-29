import { json } from '@sveltejs/kit';
import { getDiscussionsForEvaluation, addEvaluationComment, deleteEvaluationComment } from '../../../lib/unifiedStore.js';
import { verifyServerAuth, isStaffUser } from '../../../lib/server/auth.js';

export const prerender = false;

async function requireStaff(request, platform) {
  const auth = await verifyServerAuth(request, platform);
  if (!auth.authenticated) return { response: json({ success: false, error: auth.error }, { status: auth.status || 401 }) };
  if (!isStaffUser(auth.user)) return { response: json({ success: false, error: 'Forbidden: Thảo luận đánh giá chỉ dành cho staff.' }, { status: 403 }) };
  return { user: auth.user };
}

export async function GET({ url, request, platform }) {
  try {
    const access = await requireStaff(request, platform); if (access.response) return access.response;
    const evaluationId = url.searchParams.get('evaluation_id');
    if (!evaluationId) return json({ success: false, error: 'Thiếu evaluation_id' }, { status: 400 });

    const comments = getDiscussionsForEvaluation(evaluationId);
    return json({ success: true, total: comments.length, comments });
  } catch (err) {
    return json({ success: false, error: err.message }, { status: 500 });
  }
}

export async function POST({ request, platform }) {
  try {
    const access = await requireStaff(request, platform); if (access.response) return access.response;
    const body = await request.json();
    if (!body.evaluation_id || !body.content) {
      return json({ success: false, error: 'Nội dung phản biện hoặc câu hỏi không được để trống' }, { status: 400 });
    }

    const created = addEvaluationComment({ ...body, user_id: access.user.id, author_id: access.user.id, author_name: access.user.name || access.user.username, author_role: access.user.role });
    return json({ success: true, message: 'Đã gửi ý kiến phản biện / thảo luận!', comment: created });
  } catch (err) {
    return json({ success: false, error: err.message }, { status: 500 });
  }
}

export async function DELETE({ url, request, platform }) {
  try {
    const access = await requireStaff(request, platform); if (access.response) return access.response;
    const id = url.searchParams.get('id');
    if (!id) return json({ success: false, error: 'Thiếu comment ID' }, { status: 400 });

    const ok = deleteEvaluationComment(id);
    return json({ success: ok, message: 'Đã xóa bình luận phản biện' });
  } catch (err) {
    return json({ success: false, error: err.message }, { status: 500 });
  }
}
