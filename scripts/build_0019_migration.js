// Build migrations/0019_seed_public_quiz_catalog.sql from scripts/catalog_data.json
import fs from 'fs';
import { mapBankQuestionToQuizQuestion } from '../src/lib/server/quizBankBridge.js';

function escapeSql(str) {
  if (str === null || str === undefined) return 'NULL';
  return `'${String(str).replace(/'/g, "''")}'`;
}

export function generateMigrationSql() {
  if (!fs.existsSync('scripts/catalog_data.json')) {
    throw new Error('scripts/catalog_data.json does not exist. Run fetch_catalog_questions.js first.');
  }

  const catalog = JSON.parse(fs.readFileSync('scripts/catalog_data.json', 'utf8'));

  const lines = [
    '-- ============================================================================',
    '-- MIGRATION 0019: SEED PUBLIC QUIZ CATALOG (GRADES 1-12 + IELTS)',
    '-- Target: Cloudflare D1 / SQLite',
    '-- Idempotent: Safe to re-run without duplicate rows or data corruption',
    '-- ============================================================================',
    ''
  ];

  for (const item of catalog) {
    const { gradeInfo, questions } = item;
    lines.push(`-- ----------------------------------------------------------------------------`);
    lines.push(`-- Quiz: ${gradeInfo.title} (${gradeInfo.grade})`);
    lines.push(`-- ----------------------------------------------------------------------------`);
    lines.push(`INSERT OR IGNORE INTO quizzes (`);
    lines.push(`  id, title, description, created_by, creator_name, time_limit_minutes, status, created_at, updated_at`);
    lines.push(`) VALUES (`);
    lines.push(`  ${escapeSql(gradeInfo.id)},`);
    lines.push(`  ${escapeSql(gradeInfo.title)},`);
    lines.push(`  ${escapeSql(gradeInfo.desc)},`);
    lines.push(`  'usr_system_catalog',`);
    lines.push(`  'Tiếng Anh Cô Dung',`);
    lines.push(`  25,`);
    lines.push(`  'published',`);
    lines.push(`  '2026-10-10T00:00:00.000Z',`);
    lines.push(`  '2026-10-10T00:00:00.000Z'`);
    lines.push(`);`);
    lines.push(``);

    const TARGET_LETTERS = ['A', 'B', 'C', 'D', 'B', 'C', 'D', 'A', 'C', 'D', 'A', 'B'];
    questions.forEach((q, idx) => {
      const targetLetter = TARGET_LETTERS[idx % 12];
      const mapped = mapBankQuestionToQuizQuestion(q, gradeInfo.id, idx, targetLetter);
      lines.push(`INSERT OR IGNORE INTO quiz_questions (`);
      lines.push(`  id, quiz_id, type, prompt, prompt_image_url, options_json, correct_answer, explanation, points, q_order`);
      lines.push(`) VALUES (`);
      lines.push(`  ${escapeSql(mapped.id)},`);
      lines.push(`  ${escapeSql(mapped.quiz_id)},`);
      lines.push(`  ${escapeSql(mapped.type)},`);
      lines.push(`  ${escapeSql(mapped.prompt)},`);
      lines.push(`  NULL,`);
      lines.push(`  ${escapeSql(mapped.options_json)},`);
      lines.push(`  ${escapeSql(mapped.correct_answer)},`);
      lines.push(`  ${escapeSql(mapped.explanation)},`);
      lines.push(`  ${mapped.points},`);
      lines.push(`  ${mapped.q_order}`);
      lines.push(`);`);
    });
    lines.push(``);
  }

  const sql = lines.join('\n');
  fs.writeFileSync('migrations/0019_seed_public_quiz_catalog.sql', sql);
  console.log(`Successfully generated migrations/0019_seed_public_quiz_catalog.sql (${catalog.length} quizzes)`);
}

if (process.argv[1]?.endsWith('build_0019_migration.js')) {
  generateMigrationSql();
}
