import { json } from '@sveltejs/kit';
import vocabularyData from '$lib/data/vocabulary_db.json';

export const prerender = false;

export async function GET({ url }) {
  const grade = url.searchParams.get('grade');
  const unit = url.searchParams.get('unit');
  const category = url.searchParams.get('category');
  const search = url.searchParams.get('search');
  const level = url.searchParams.get('level');
  const limit = Number(url.searchParams.get('limit')) || 100;

  let results = [...vocabularyData];

  if (grade && grade !== 'all') {
    results = results.filter(w => (w.grade || '').toLowerCase() === grade.toLowerCase());
  }

  if (unit && unit !== 'all') {
    results = results.filter(w => (w.unit_id || '').toLowerCase() === unit.toLowerCase());
  }

  if (category && category !== 'all') {
    results = results.filter(w => (w.category || '').toLowerCase() === category.toLowerCase());
  }

  if (level && level !== 'all') {
    results = results.filter(w => (w.cambridge_level || '').toLowerCase() === level.toLowerCase());
  }

  if (search && search.trim()) {
    const q = search.trim().toLowerCase();
    results = results.filter(w => 
      (w.term && w.term.toLowerCase().includes(q)) ||
      (w.meaning_vi && w.meaning_vi.toLowerCase().includes(q)) ||
      (w.ipa && w.ipa.toLowerCase().includes(q))
    );
  }

  return json({
    success: true,
    total: results.length,
    data: results.slice(0, limit)
  });
}
