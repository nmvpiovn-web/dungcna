import { json } from '@sveltejs/kit';
import grammarData from '$lib/data/grammar_topics.json';

export const prerender = false;

export async function GET({ url }) {
  const grade = url.searchParams.get('grade');
  const search = url.searchParams.get('search');

  let results = [...grammarData];

  if (grade && grade !== 'all') {
    results = results.filter(g => (g.grade_level || '').toLowerCase().includes(grade.toLowerCase()));
  }

  if (search && search.trim()) {
    const q = search.trim().toLowerCase();
    results = results.filter(g => 
      (g.topic && g.topic.toLowerCase().includes(q)) ||
      (g.curriculum_unit && g.curriculum_unit.toLowerCase().includes(q))
    );
  }

  return json({
    success: true,
    total: results.length,
    data: results
  });
}
