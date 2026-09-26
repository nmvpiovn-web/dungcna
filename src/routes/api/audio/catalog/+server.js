import { json } from '@sveltejs/kit';
import audioCatalog from '../../../../lib/data/audio_catalog.json' with { type: 'json' };

export const prerender = false;

export async function GET({ url }) {
  const grade = url.searchParams.get('grade');
  const unit = url.searchParams.get('unit');
  const curriculum = url.searchParams.get('curriculum');
  const q = (url.searchParams.get('q') || '').toLowerCase().trim();

  let results = [...audioCatalog];

  if (grade !== null && grade !== '') {
    const grNum = parseInt(grade, 10);
    results = results.filter(t => t.grade === grNum);
  }

  if (unit !== null && unit !== '') {
    const uNum = parseInt(unit, 10);
    results = results.filter(t => t.unit === uNum);
  }

  if (curriculum) {
    results = results.filter(t => t.curriculum.toLowerCase().includes(curriculum.toLowerCase()));
  }

  if (q) {
    results = results.filter(t => 
      t.title.toLowerCase().includes(q) ||
      t.topic.toLowerCase().includes(q) ||
      (t.transcript && t.transcript.toLowerCase().includes(q)) ||
      (t.key_vocabulary && t.key_vocabulary.some(v => v.toLowerCase().includes(q)))
    );
  }

  return json({
    success: true,
    total: results.length,
    catalog_total_drive_items: 2254, // Official Drive mapping count
    tracks: results
  });
}
