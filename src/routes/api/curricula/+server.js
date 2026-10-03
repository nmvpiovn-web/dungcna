import { json } from '@sveltejs/kit';

export const prerender = false;

export async function GET({ platform }) {
  const db = platform?.env?.DB;
  if (!db) {
    return json({ success: false, error: 'Database unavailable' }, { status: 503 });
  }
  const res = await db.prepare(
    `SELECT id, code, category, title, description, icon, order_num
     FROM curricula ORDER BY order_num, title`
  ).all();
  const rows = res.results || [];
  return json({ success: true, total: rows.length, source: 'd1', data: rows });
}
