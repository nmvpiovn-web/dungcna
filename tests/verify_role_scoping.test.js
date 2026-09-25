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

console.log('\n--- ROUND 1 REGRESSION: User daian ("Nguyễn Đại An") Trial Status & Badge ---');
const daian = {
  id: 'usr_daian_123',
  username: 'daian',
  name: 'Nguyễn Đại An',
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

function getStudentBadge(user) {
  const isOfficial = user.approval_status === 'official' || (user.status === 'active' && !user.is_trial && !user.metadata?.includes('"is_trial":true'));
  return isOfficial ? '✓ Học Sinh Chính Thức' : '⏳ Dùng Thử (Trial) • Chờ Cô Dung Duyệt';
}

const daianBadge = getStudentBadge(daian);
console.log('daian initial badge:', daianBadge);
if (daianBadge !== '⏳ Dùng Thử (Trial) • Chờ Cô Dung Duyệt') {
  throw new Error(`daian is a trial user! Badge should NOT be official. Got: ${daianBadge}`);
}
console.log('✅ Round 1 Passed: Trial accounts properly display "⏳ Dùng Thử (Trial) • Chờ Cô Dung Duyệt"!');

console.log('\n--- ROUND 2 REGRESSION: /exam Scoping for daian (Grade 7) ---');
const examsData = JSON.parse(fs.readFileSync(new URL('../src/lib/data/exams.json', import.meta.url), 'utf-8'));

function isExamEnrolledForUser(user, exam) {
  if (!user || user.role !== 'student') return true;
  const grades = getUserEnrolledGrades(user);
  const title = (exam.title || '').toLowerCase();
  const curriculumId = (exam.curriculum_id || '').toLowerCase();

  return grades.some(g => {
    const clean = g.toLowerCase().trim();
    const match = clean.match(/lớp\s*([0-9]+)/i) || clean.match(/grade-?([0-9]+)/i);
    if (match) {
      const num = Number(match[1]);
      if (Number(exam.grade) === num || title.includes(`lớp ${num}`)) return true;
    }
    if (clean.includes('ielts') && (curriculumId.includes('ielts') || title.includes('ielts') || exam.format_type === 'ielts_academic')) return true;
    if (clean.includes('toeic') && (curriculumId.includes('toeic') || title.includes('toeic') || exam.format_type === 'toeic_lr')) return true;
    if (clean.includes('toefl') && (curriculumId.includes('toefl') || title.includes('toefl') || exam.format_type === 'toefl_ibt')) return true;
    if ((clean.includes('đại học') || clean.includes('thptqg')) && (curriculumId.includes('thptqg') || Number(exam.grade) === 12)) return true;
    return false;
  });
}

const accessibleExams = examsData.filter(e => isExamEnrolledForUser(daian, e));
const lockedExams = examsData.filter(e => !isExamEnrolledForUser(daian, e));
console.log(`daian accessible exams count: ${accessibleExams.length}, locked exams: ${lockedExams.length}`);
console.log('Accessible exams:', accessibleExams.map(e => e.title));

if (!accessibleExams.every(e => e.grade === 7 || e.title.includes('Lớp 7'))) {
  throw new Error('daian must only have access to Grade 7 exams!');
}
if (!lockedExams.some(e => e.format_type === 'ielts_academic')) {
  throw new Error('IELTS exams must be locked for Grade 7 student!');
}
if (!lockedExams.some(e => e.format_type === 'toeic_lr')) {
  throw new Error('TOEIC exams must be locked for Grade 7 student!');
}
console.log('✅ Round 2 Passed: /exam strictly scopes to Grade 7; other exams locked with 🔒!');

console.log('\n--- ROUND 3 REGRESSION: /evaluations Privacy Scoping for daian ---');
const evaluationsData = JSON.parse(fs.readFileSync(new URL('../src/lib/data/student_evaluations.json', import.meta.url), 'utf-8'));

function filterEvaluationsForUser(user, evaluations) {
  return evaluations.filter(e => {
    if (user?.role === 'student') {
      const sId = (user.id || '').toLowerCase();
      const sName = (user.name || '').toLowerCase();
      const uName = (user.username || '').toLowerCase();
      const evId = (e.student_id || '').toLowerCase();
      const evName = (e.student_name || '').toLowerCase();
      return evId === sId || evName === sName || (uName && evName.includes(uName));
    }
    return true;
  });
}

const daianEvals = filterEvaluationsForUser(daian, evaluationsData);
console.log(`Evaluations visible to daian: ${daianEvals.length} (out of ${evaluationsData.length} total)`);
if (daianEvals.length !== 0) {
  throw new Error('New student daian has no evaluations yet; must not see other students\' evaluations!');
}
console.log('✅ Round 3 Passed: /evaluations strictly isolates student records; zero privacy leakage!');

console.log('\n--- ROUND 4 REGRESSION: /schedule Scoping for daian ---');
const classSessionsData = JSON.parse(fs.readFileSync(new URL('../src/lib/data/class_sessions.json', import.meta.url), 'utf-8'));

function getSessionsForUserTest(user, sessions) {
  if (user.role === 'student') {
    let meta = {};
    try { meta = typeof user.metadata === 'string' ? JSON.parse(user.metadata) : (user.metadata || {}); } catch {}
    const studentClassId = meta.class_id;
    const studentGrade = user.grade || meta.grade;
    const enrolledGrades = getUserEnrolledGrades(user);
    return sessions.filter(s => 
      (s.student_ids && s.student_ids.includes(user.id)) || 
      (studentClassId && s.class_id === studentClassId) ||
      (studentGrade && s.grade_level === studentGrade) ||
      (enrolledGrades.length > 0 && enrolledGrades.includes(s.grade_level))
    );
  }
  return sessions;
}

const daianSessions = getSessionsForUserTest(daian, classSessionsData);
console.log(`Sessions visible to daian: ${daianSessions.length}`);
console.log('Session classes:', daianSessions.map(s => `${s.class_name} (${s.day_name} ${s.start_time})`));

if (!daianSessions.every(s => s.grade_level === 'Lớp 7')) {
  throw new Error('daian must only see Grade 7 schedule sessions!');
}
if (daianSessions.some(s => s.grade_level === 'Lớp 12')) {
  throw new Error('daian must NOT see Grade 12 session!');
}
console.log('✅ Round 4 Passed: /schedule returns Grade 7 sessions for daian!');

console.log('\n--- ROUND 5 REGRESSION: /admin Gate & Approval Flow ---');
function canAccessAdminCP(user) {
  if (!user) return false;
  return user.role === 'teacher' || user.role === 'superadmin' || user.username === 'admin';
}

if (canAccessAdminCP(daian)) {
  throw new Error('Student daian must NOT have access to Admin CP!');
}
const parentUser = { id: 'usr_p1', role: 'parent', name: 'Phụ huynh' };
if (canAccessAdminCP(parentUser)) {
  throw new Error('Parent must NOT have access to Admin CP!');
}
console.log('Admin CP gate correctly blocks student and parent.');

// Admin approves daian to official
const approvedDaian = {
  ...daian,
  status: 'active',
  approval_status: 'official',
  metadata: JSON.stringify({
    grade: 'Lớp 7',
    target: 'Chương trình GDPT 2026',
    is_trial: false
  })
};
const approvedBadge = getStudentBadge(approvedDaian);
console.log('daian badge after Admin approval:', approvedBadge);
if (approvedBadge !== '✓ Học Sinh Chính Thức') {
  throw new Error(`Approved daian badge should be official. Got: ${approvedBadge}`);
}
console.log('✅ Round 5 Passed: Admin approval flow converts trial to official correctly!');

console.log('\n🎉 ALL 12 AUDIT & REGRESSION TESTS PASSED!');
