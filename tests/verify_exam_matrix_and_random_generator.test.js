import fs from 'fs';
import assert from 'assert';

console.log('========================================================================');
console.log('=== TEST SUITE: FULL EXAM MATRIX (5M, 15M, 45M) & RANDOM GENERATOR ===');
console.log('========================================================================\n');

const examsData = JSON.parse(fs.readFileSync(new URL('../src/lib/data/exams.json', import.meta.url), 'utf-8'));
const questionsData = JSON.parse(fs.readFileSync(new URL('../src/lib/data/questions.json', import.meta.url), 'utf-8'));

console.log(`Total exams loaded: ${examsData.length}`);
console.log(`Total questions loaded: ${questionsData.length}`);

assert(examsData.length >= 87, `Exams count must be at least 87, got ${examsData.length}`);
assert(questionsData.length >= 570, `Questions count must be at least 570, got ${questionsData.length}`);

// -------------------------------------------------------------
// TEST 1: Grade Matrix Verification (Every Grade Must Have 5m, 15m, 45m)
// -------------------------------------------------------------
console.log('\n--- TEST 1: Grade Matrix Verification (5m, 15m, 45m) ---');

const gradesToTest = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 0];

for (const gr of gradesToTest) {
  const grExams = examsData.filter(e => e.grade === gr);
  const label = gr > 0 ? `Lớp ${gr}` : 'Quốc Tế (IELTS/KET/PET)';
  
  const has5m = grExams.some(e => e.duration_minutes === 5 || e.format_type === 'quick_5m');
  const has15m = grExams.some(e => e.duration_minutes === 15 || e.format_type === 'quick_15m');
  const has45m = grExams.some(e => e.duration_minutes === 45 || e.format_type === 'standard_45m');

  console.log(`Checking ${label}: 5m=${has5m}, 15m=${has15m}, 45m=${has45m}`);
  assert(has5m, `${label} must have at least one 5-minute test!`);
  assert(has15m, `${label} must have at least one 15-minute test!`);
  assert(has45m, `${label} must have at least one 45-minute test!`);
}
console.log('✅ TEST 1 PASSED: All 12 grades and international certificates have 5m, 15m, and 45m tests!');

// -------------------------------------------------------------
// TEST 2: Question Linkage & Integrity
// -------------------------------------------------------------
console.log('\n--- TEST 2: Question Linkage & Quality Check ---');

const sampleExams = ['ex_g1_quick_5m', 'ex_g7_quick_5m', 'ex_g9_standard_45m', 'ex_g12_standard_45m', 'ex_ielts_standard_45m'];

for (const exId of sampleExams) {
  const ex = examsData.find(e => e.id === exId);
  assert(ex, `Exam ${exId} must exist`);
  const qs = questionsData.filter(q => q.exam_id === exId);
  assert(qs.length > 0, `Exam ${exId} must have linked questions, got ${qs.length}`);
  
  // Verify question schema
  const q1 = qs[0];
  assert(q1.prompt, 'Question must have prompt');
  assert(q1.correct_answer, 'Question must have correct_answer');
  assert(q1.options_json, 'Question must have options_json');
  assert(q1.explanation, 'Question must have pedagogical explanation');
  console.log(`Exam ${exId} verified: ${qs.length} questions linked. Sample prompt: "${q1.prompt.slice(0, 45)}..."`);
}
console.log('✅ TEST 2 PASSED: Questions bank linkage and schema integrity verified!');

// -------------------------------------------------------------
// TEST 3: Random Exam Generator Algorithm Simulation
// -------------------------------------------------------------
console.log('\n--- TEST 3: Random Generator Algorithm Simulation ---');

function simulateRandomExam(grade, duration, skill = 'all') {
  let pool = [...questionsData];
  if (grade > 0) {
    pool = pool.filter(q => Number(q.grade) === Number(grade));
  } else {
    pool = pool.filter(q => Number(q.grade) === 0 || (q.cambridge_level && ['KET_A2', 'PET_B1', 'IELTS_7'].includes(q.cambridge_level)));
  }

  if (skill !== 'all') {
    const skillFiltered = pool.filter(q => (q.skill || '').toLowerCase().includes(skill.toLowerCase()));
    if (skillFiltered.length >= 5) pool = skillFiltered;
  }

  const targetCount = duration === 5 ? 5 : (duration === 15 ? 10 : Math.min(25, pool.length));
  assert(pool.length >= targetCount, `Pool for grade ${grade} must have at least ${targetCount} questions, got ${pool.length}`);

  // Shuffle
  const shuffled = [...pool].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, targetCount);
}

// 3.1 Random 5m for Grade 7
const rand5mG7 = simulateRandomExam(7, 5);
assert.strictEqual(rand5mG7.length, 5, '5m exam must have 5 questions');
assert(rand5mG7.every(q => q.grade === 7), 'All questions must be Grade 7');
console.log(`Simulated Random 5m (Grade 7): ${rand5mG7.length} questions selected`);

// 3.2 Random 15m for Grade 9
const rand15mG9 = simulateRandomExam(9, 15);
assert.strictEqual(rand15mG9.length, 10, '15m exam must have 10 questions');
assert(rand15mG9.every(q => q.grade === 9), 'All questions must be Grade 9');
console.log(`Simulated Random 15m (Grade 9): ${rand15mG9.length} questions selected`);

// 3.3 Random 45m for Grade 12
const rand45mG12 = simulateRandomExam(12, 45);
assert.strictEqual(rand45mG12.length, 25, '45m exam must have 25 questions');
assert(rand45mG12.every(q => q.grade === 12), 'All questions must be Grade 12');
console.log(`Simulated Random 45m (Grade 12): ${rand45mG12.length} questions selected`);

// 3.4 Random 5m for IELTS
const rand5mIelts = simulateRandomExam(0, 5);
assert.strictEqual(rand5mIelts.length, 5, '5m international exam must have 5 questions');
console.log(`Simulated Random 5m (IELTS/Cambridge): ${rand5mIelts.length} questions selected`);

console.log('✅ TEST 3 PASSED: Random Exam Generator logic verified successfully!');

console.log('\n========================================================================');
console.log('🎉 ALL EXAM MATRIX & RANDOM GENERATOR TESTS PASSED WITH 100% SUCCESS!');
console.log('========================================================================\n');
