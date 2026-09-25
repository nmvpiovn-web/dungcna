import { json } from '@sveltejs/kit';
import { getDiscussionsForEvaluation, addEvaluationComment, deleteEvaluationComment } from '$lib/unifiedStore';

export const prerender = false;

export async function GET({ url }) {
  try {
    const evaluationId = url.searchParams.get('evaluation_id');
    if (!evaluationId) return json({ success: false, error: 'Thiếu evaluation_id' }, { status: 400 });

    const comments = getDiscussionsForEvaluation(evaluationId);
    return json({ success: true, total: comments.length, comments });
  } catch (err) {
    return json({ success: false, error: err.message }, { status: 500 });
  }
}

export async function POST({ request }) {
  try {
    const body = await request.json();
    if (!body.evaluation_id || !body.content) {
      return json({ success: false, error: 'Nội dung phản biện hoặc câu hỏi không được để trống' }, { status: 400 });
    }

    const created = addEvaluationComment(body);
    return json({ success: true, message: 'Đã gửi ý kiến phản biện / thảo luận!', comment: created });
  } catch (err) {
    return json({ success: false, error: err.message }, { status: 500 });
  }
}

export async function DELETE({ url }) {
  try {
    const id = url.searchParams.get('id');
    if (!id) return json({ success: false, error: 'Thiếu comment ID' }, { status: 400 });

    const ok = deleteEvaluationComment(id);
    return json({ success: ok, message: 'Đã xóa bình luận phản biện' });
  } catch (err) {
    return json({ success: false, error: err.message }, { status: 500 });
  }
}
