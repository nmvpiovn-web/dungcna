import fs from 'fs';

const usersData = JSON.parse(fs.readFileSync(new URL('../src/lib/data/users.json', import.meta.url), 'utf-8'));
const curriculaData = JSON.parse(fs.readFileSync(new URL('../src/lib/data/curricula.json', import.meta.url), 'utf-8'));

// Exact functions replicated from src/lib/unifiedStore.js
function getUserEnrolledGrades(user) {
  if (!user) return [];
  let meta = {};
  try {
    meta = typeof user.metadata === 'string' ? JSON.parse(user.metadata) : (user.metadata || {});
  } catch {}

  const list = [];
  const baseGrade = user.grade || meta.grade;
  if (baseGrade) list.push(baseGrade);

  if (Array.isArray(meta.enrolled_grades)) {
    for (const g of meta.enrolled_grades) {
      if (g && !list.includes(g)) {
        list.push(g);
      }
    }
  }

  if (list.length === 0 && user.role === 'student') {
    list.push('Lớp 7');
  }
  return list;
}

function isCurriculumEnrolled(user, curriculum) {
  if (!user || user.role !== 'student') return true; // Non-students or admins have full view
  const enrolled = getUserEnrolledGrades(user);
  const code = (curriculum.code || '').toLowerCase();
  const title = (curriculum.title || '').toLowerCase();

  return enrolled.some(enr => {
    const clean = enr.toLowerCase().trim();
    // Match grade number (e.g., 'lớp 7' -> 'grade-7', 'lớp 7')
    const match = clean.match(/lớp\s*([0-9]+)/i) || clean.match(/grade-?([0-9]+)/i);
    if (match) {
      const gNum = match[1];
      if (code === `grade-${gNum}` || title.includes(`lớp ${gNum}`)) return true;
    }
    if (clean.includes('ielts') && (code.includes('ielts') || title.includes('ielts'))) return true;
    if (clean.includes('toeic') && (code.includes('toeic') || title.includes('toeic'))) return true;
    if (clean.includes('toefl') && (code.includes('toefl') || title.includes('toefl'))) return true;
    if (clean.includes('vstep') && (code.includes('vstep') || title.includes('vstep'))) return true;
    if (clean.includes('đại học') || clean.includes('thptqg')) {
      if (code.includes('thpt_qg') || title.includes('thpt qg') || title.includes('đại học')) return true;
    }
    return title.includes(clean) || code === clean;
  });
}

function enrollStudentAdditionalGrade(user, newGrade) {
  let meta = {};
  try { meta = typeof user.metadata === 'string' ? JSON.parse(user.metadata) : (user.metadata || {}); } catch {}

  const currentEnrolled = Array.isArray(meta.enrolled_grades) ? [...meta.enrolled_grades] : [user.grade || 'Lớp 7'];
  if (!currentEnrolled.includes(newGrade)) {
    currentEnrolled.push(newGrade);
  }
  meta.enrolled_grades = currentEnrolled;
  return { ...user, metadata: JSON.stringify(meta) };
}

function removeStudentEnrolledGrade(user, gradeToRemove) {
  let meta = {};
  try { meta = typeof user.metadata === 'string' ? JSON.parse(user.metadata) : (user.metadata || {}); } catch {}

  let currentEnrolled = Array.isArray(meta.enrolled_grades) ? [...meta.enrolled_grades] : [user.grade || 'Lớp 7'];
  currentEnrolled = currentEnrolled.filter(g => g !== gradeToRemove);
  if (currentEnrolled.length === 0) currentEnrolled = [user.grade || 'Lớp 7'];

  meta.enrolled_grades = currentEnrolled;
  return { ...user, metadata: JSON.stringify(meta) };
}

console.log('--- TEST 1: User baokhiem existence & role ---');
const baokhiem = usersData.find(u => u.username === 'baokhiem');
if (!baokhiem) throw new Error('baokhiem not found!');
console.log('baokhiem:', { id: baokhiem.id, name: baokhiem.name, role: baokhiem.role, grade: baokhiem.grade });

console.log('\n--- TEST 2: Enrolled grades for baokhiem ---');
const enrolled = getUserEnrolledGrades(baokhiem);
console.log('Enrolled grades:', enrolled);
if (!enrolled.includes('Lớp 7')) throw new Error('baokhiem must be enrolled in Lớp 7');

console.log('\n--- TEST 3: Curriculum Scoping & Locking for baokhiem ---');
const enrolledCurricula = curriculaData.filter(c => isCurriculumEnrolled(baokhiem, c));
const lockedCurricula = curriculaData.filter(c => !isCurriculumEnrolled(baokhiem, c));

console.log(`Enrolled count: ${enrolledCurricula.length}, Locked count: ${lockedCurricula.length}`);
console.log('Enrolled curriculum titles:', enrolledCurricula.map(c => c.title));

if (enrolledCurricula.length !== 1 || enrolledCurricula[0].code !== 'grade-7') {
  throw new Error(`Expected exactly 1 enrolled curriculum (grade-7), got ${enrolledCurricula.length}`);
}
if (lockedCurricula.length !== 18) {
  throw new Error(`Expected 18 locked curricula, got ${lockedCurricula.length}`);
}
console.log('✅ Student baokhiem only sees Grade 7; all other 18 curricula are properly LOCKED!');

console.log('\n--- TEST 4: Admin adds additional class (IELTS) ---');
const updatedBaokhiem = enrollStudentAdditionalGrade(baokhiem, 'Luyện Thi IELTS');
const newEnrolledCurricula = curriculaData.filter(c => isCurriculumEnrolled(updatedBaokhiem, c));
console.log('After Admin enrolls IELTS, accessible curricula:', newEnrolledCurricula.map(c => c.title));
if (!newEnrolledCurricula.some(c => c.code === 'ielts')) {
  throw new Error('IELTS should now be unlocked for baokhiem!');
}
console.log('✅ Admin CP multi-grade enrollment verified!');

console.log('\n--- TEST 5: Admin removes additional class ---');
const restoredBaokhiem = removeStudentEnrolledGrade(updatedBaokhiem, 'Luyện Thi IELTS');
const restoredEnrolled = curriculaData.filter(c => isCurriculumEnrolled(restoredBaokhiem, c));
console.log('After removing IELTS, accessible curricula:', restoredEnrolled.map(c => c.title));
if (restoredEnrolled.some(c => c.code === 'ielts')) {
  throw new Error('IELTS should be locked again!');
}
console.log('✅ Re-locking verified!');

console.log('\n--- TEST 6: Teacher & SuperAdmin Access ---');
const admin = usersData.find(u => u.username === 'admin');
const teacher = usersData.find(u => u.role === 'teacher');
const adminAccess = curriculaData.filter(c => isCurriculumEnrolled(admin, c));
const teacherAccess = curriculaData.filter(c => isCurriculumEnrolled(teacher, c));
console.log(`Admin accessible courses: ${adminAccess.length}/19`);
console.log(`Teacher accessible courses: ${teacherAccess.length}/19`);
if (adminAccess.length !== 19 || teacherAccess.length !== 19) {
  throw new Error('Teacher and Admin must have access to all 19 courses!');
}
console.log('\n--- TEST 7: New user thienbao registering with Lớp 7 ---');
const thienbao = {
  id: `usr_${Date.now()}`,
  username: 'thienbao',
  name: 'Thiên Bảo',
  role: 'student',
  grade: 'Lớp 7',
  status: 'trial',
  approval_status: 'trial',
  metadata: JSON.stringify({
    grade: 'Lớp 7',
    target: 'Chương trình GDPT 2026',
    is_trial: true
  })
};
const thienbaoEnrolled = getUserEnrolledGrades(thienbao);
const thienbaoCurricula = curriculaData.filter(c => isCurriculumEnrolled(thienbao, c));
const thienbaoLocked = curriculaData.filter(c => !isCurriculumEnrolled(thienbao, c));

console.log(`thienbao enrolled classes:`, thienbaoEnrolled);
console.log(`thienbao accessible: ${thienbaoCurricula.length}, locked: ${thienbaoLocked.length}`);
if (thienbaoCurricula.length !== 1 || thienbaoCurricula[0].code !== 'grade-7') {
  throw new Error(`thienbao must only have access to Lớp 7! Got: ${thienbaoCurricula.map(c => c.title)}`);
}
if (thienbaoLocked.length !== 18) {
  throw new Error(`thienbao must have exactly 18 locked classes! Got: ${thienbaoLocked.length}`);
}
console.log('✅ thienbao role and grade scoping verified!');

console.log('\n🎉 ALL 7 AUTOMATED VERIFICATION TESTS PASSED!');
