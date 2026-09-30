import test from 'node:test';
import assert from 'node:assert/strict';

// Helper matching parseStudentGrade function in src/routes/dictionary/+page.svelte
function parseStudentGrade(raw) {
  if (!raw && raw !== 0) return null;
  if (typeof raw === 'number' && raw >= 1 && raw <= 12) {
    return `Lớp ${raw}`;
  }
  const s = String(raw).trim().toLowerCase();
  const m = s.match(/(?:lớp|grade|khoi)?\s*([0-9]+)/);
  if (m) {
    const n = parseInt(m[1], 10);
    if (n >= 1 && n <= 12) return `Lớp ${n}`;
  }
  return null;
}

test('DICTIONARY-GRADE-01: Numbers 1 to 12 are precisely parsed', () => {
  for (let i = 1; i <= 12; i++) {
    assert.strictEqual(parseStudentGrade(i), `Lớp ${i}`);
  }
});

test('DICTIONARY-GRADE-02: String variations for all grades 1 to 12', () => {
  assert.strictEqual(parseStudentGrade('1'), 'Lớp 1');
  assert.strictEqual(parseStudentGrade('Lớp 2'), 'Lớp 2');
  assert.strictEqual(parseStudentGrade('lop 3'), 'Lớp 3');
  assert.strictEqual(parseStudentGrade('grade 4'), 'Lớp 4');
  assert.strictEqual(parseStudentGrade('grade-5'), 'Lớp 5');
  assert.strictEqual(parseStudentGrade('Lớp 6'), 'Lớp 6');
  assert.strictEqual(parseStudentGrade('7'), 'Lớp 7');
  assert.strictEqual(parseStudentGrade('khoi 8'), 'Lớp 8');
  assert.strictEqual(parseStudentGrade('Lớp 9'), 'Lớp 9');
  assert.strictEqual(parseStudentGrade('lop 10'), 'Lớp 10');
  assert.strictEqual(parseStudentGrade('grade 11'), 'Lớp 11');
  assert.strictEqual(parseStudentGrade('Lớp 12'), 'Lớp 12');
});

test('DICTIONARY-GRADE-03: Invalid grades return null', () => {
  assert.strictEqual(parseStudentGrade(null), null);
  assert.strictEqual(parseStudentGrade(''), null);
  assert.strictEqual(parseStudentGrade(0), null);
  assert.strictEqual(parseStudentGrade(13), null);
  assert.strictEqual(parseStudentGrade('ielts_student'), null);
});

test('DICTIONARY-GRADE-04: Metadata JSON string and object extraction', () => {
  const metaObj = { grade: 7 };
  assert.strictEqual(parseStudentGrade(metaObj.grade), 'Lớp 7');

  const metaStr = JSON.stringify({ grade: 'Lớp 12' });
  const parsed = JSON.parse(metaStr);
  assert.strictEqual(parseStudentGrade(parsed.grade), 'Lớp 12');
});
