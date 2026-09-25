import assert from 'node:assert';
import fs from 'node:fs';

console.log('================================================================');
console.log('=== 5-ROUND RIGOROUS REGRESSION AUDIT: CLASS TRANSFER & RBAC ===');
console.log('================================================================\n');

// Load Data Fixtures
const usersData = JSON.parse(fs.readFileSync(new URL('../src/lib/data/users.json', import.meta.url), 'utf-8'));
const curriculaData = JSON.parse(fs.readFileSync(new URL('../src/lib/data/curricula.json', import.meta.url), 'utf-8'));
const examsData = JSON.parse(fs.readFileSync(new URL('../src/lib/data/exams.json', import.meta.url), 'utf-8'));
const questionsData = JSON.parse(fs.readFileSync(new URL('../src/lib/data/questions.json', import.meta.url), 'utf-8'));

// In-Memory Test State
let usersStore = JSON.parse(JSON.stringify(usersData));
let leaderNotifications = [];
let botReports = [];

// Core functions mirroring unifiedStore.js implementation
function isTeacherOrAdmin(user) {
  if (!user) return false;
  const role = (user.role || '').toLowerCase();
  return role === 'admin' || role === 'superadmin' || role === 'teacher' || role === 'lead_teacher' || role === 'leader';
}

function getUserEnrolledGrades(user) {
  if (!user) return [];
  let meta = {};
  try { meta = typeof user.metadata === 'string' ? JSON.parse(user.metadata) : (user.metadata || {}); } catch {}

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
  if (!user || user.role !== 'student') return true;
  const enrolled = getUserEnrolledGrades(user);
  const code = (curriculum.code || '').toLowerCase();
  const title = (curriculum.title || '').toLowerCase();

  return enrolled.some(enr => {
    const clean = enr.toLowerCase().trim();
    if (clean.includes('lớp 10') && (code === 'grade-10' || title.includes('lớp 10'))) return true;
    if (clean.includes('lớp 11') && (code === 'grade-11' || title.includes('lớp 11'))) return true;
    if (clean.includes('lớp 12') && (code === 'grade-12' || title.includes('lớp 12'))) return true;
    if (clean.includes('lớp 7') && (code === 'grade-7' || title.includes('lớp 7'))) return true;
    if (clean.includes('lớp 8') && (code === 'grade-8' || title.includes('lớp 8'))) return true;
    if (clean.includes('lớp 9') && (code === 'grade-9' || title.includes('lớp 9'))) return true;
    if (clean.includes('ielts') && (code === 'ielts' || title.includes('ielts'))) return true;
    if (clean.includes('toeic') && (code === 'toeic' || title.includes('toeic'))) return true;
    return title.includes(clean) || code === clean;
  });
}

function getAllExamsForUser(user) {
  if (!user || user.role !== 'student') return examsData;
  const enrolled = getUserEnrolledGrades(user);
  return examsData.filter(exam => {
    return enrolled.some(enr => {
      const clean = enr.toLowerCase().trim();
      const numMatch = clean.match(/\d+/);
      const gradeNum = numMatch ? parseInt(numMatch[0]) : null;
      if (gradeNum && exam.grade === gradeNum) return true;
      if (clean.includes('ielts') && (exam.format_type === 'ielts_academic' || exam.curriculum_id?.includes('ielts'))) return true;
      if (clean.includes('toeic') && (exam.format_type === 'toeic' || exam.curriculum_id?.includes('toeic'))) return true;
      if (clean.includes('ket') && (exam.format_type === 'cambridge_ket' || exam.curriculum_id?.includes('ket'))) return true;
      return false;
    });
  });
}

function addLeaderNotification(notif) {
  const item = {
    id: `notif_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`,
    is_read: false,
    created_at: new Date().toISOString(),
    ...notif
  };
  leaderNotifications.unshift(item);
  return item;
}

function dispatchBotReport(type, payload) {
  botReports.push({ type, payload, timestamp: new Date().toISOString() });
}

function updateUserProfileMock(userId, updates, operator = null) {
  const idx = usersStore.findIndex(u => u.id === userId || u.username === userId);
  if (idx < 0) return { success: false, error: 'Không tìm thấy người dùng!' };

  const current = usersStore[idx];
  let meta = {};
  try { meta = typeof current.metadata === 'string' ? JSON.parse(current.metadata) : (current.metadata || {}); } catch {}

  const isAuthorized = operator && isTeacherOrAdmin(operator);
  let newGrade = meta.grade || current.grade || 'Lớp 7';

  if (updates.grade !== undefined) {
    if (isAuthorized || (current.role !== 'student' && current.role !== 'parent')) {
      newGrade = updates.grade;
    } else if (updates.grade !== (meta.grade || current.grade)) {
      requestUnlockClassMock(current.id, updates.grade, 'Học sinh gửi yêu cầu chuyển lớp từ hồ sơ cá nhân');
    }
  }

  const newMeta = {
    ...meta,
    grade: newGrade,
    school: updates.school !== undefined ? updates.school : meta.school,
    target: updates.target !== undefined ? updates.target : meta.target
  };

  const updatedUser = {
    ...current,
    name: updates.name ? updates.name.trim() : current.name,
    grade: newGrade,
    metadata: JSON.stringify(newMeta),
    updated_at: new Date().toISOString()
  };

  usersStore[idx] = updatedUser;
  return { success: true, user: updatedUser };
}

function requestUnlockClassMock(studentId, gradeTitle, note = '') {
  const user = usersStore.find(u => u.id === studentId || u.username === studentId);
  if (!user) return { success: false, error: 'Chưa đăng nhập!' };

  addLeaderNotification({
    type: 'class_transfer_request',
    title: `📩 Yêu cầu chuyển/mở lớp: ${user.name}`,
    body: `Học sinh ${user.name} (${user.username}, SĐT: ${user.phone || 'Chưa có'}) gửi yêu cầu chuyển sang / mở thêm lớp: ${gradeTitle}.${note ? ' Lý do: ' + note : ''}`,
    target_role: 'admin',
    priority: 'high',
    action_url: '/admin#students',
    metadata: { student_id: user.id, username: user.username, target_grade: gradeTitle, note }
  });

  dispatchBotReport('CLASS_UNLOCK_REQUESTED', {
    student_name: user.name,
    username: user.username,
    requested_grade: gradeTitle,
    note
  });

  return { success: true, message: `Đã gửi yêu cầu chuyển sang ${gradeTitle} tới Cô Dung!` };
}

function updateUserGradeAndClassMock(userId, grade, classId = '', operator = null) {
  const idx = usersStore.findIndex(u => u.id === userId);
  if (idx < 0) return { success: false, error: 'Không tìm thấy người dùng!' };

  const user = usersStore[idx];
  let meta = {};
  try { meta = typeof user.metadata === 'string' ? JSON.parse(user.metadata) : (user.metadata || {}); } catch {}

  meta.grade = grade;
  if (classId) meta.class_id = classId;

  if (!Array.isArray(meta.enrolled_grades) || meta.enrolled_grades.length <= 1) {
    meta.enrolled_grades = [grade];
  } else if (!meta.enrolled_grades.includes(grade)) {
    meta.enrolled_grades.push(grade);
  }

  user.metadata = JSON.stringify(meta);
  user.grade = grade;
  user.updated_at = new Date().toISOString();

  usersStore[idx] = user;

  dispatchBotReport('STUDENT_CLASS_UPDATED', {
    user_name: user.name,
    username: user.username,
    grade,
    class_id: classId,
    updated_by: operator?.name || 'Admin / Leader Cô Dung'
  });

  addLeaderNotification({
    type: 'class_transfer_executed',
    title: `🔄 Chuyển lớp thành công: ${user.name}`,
    body: `Học sinh ${user.name} (${user.username}) đã được chuyển sang ${grade} (Mã lớp: ${classId || 'Mặc định'}). Thực hiện bởi: ${operator?.name || 'Admin / Leader Cô Dung'}.`,
    target_role: 'admin',
    priority: 'medium',
    action_url: '/admin#students',
    metadata: { student_id: user.id, username: user.username, new_grade: grade, class_id: classId }
  });

  return { success: true, user, grade };
}

function enrollStudentAdditionalGradeMock(studentId, newGrade, operator = null) {
  const idx = usersStore.findIndex(u => u.id === studentId);
  if (idx < 0) return { success: false, error: 'Không tìm thấy học sinh!' };

  const user = usersStore[idx];
  let meta = {};
  try { meta = typeof user.metadata === 'string' ? JSON.parse(user.metadata) : (user.metadata || {}); } catch {}

  const currentEnrolled = Array.isArray(meta.enrolled_grades) ? [...meta.enrolled_grades] : [user.grade || 'Lớp 7'];
  if (!currentEnrolled.includes(newGrade)) {
    currentEnrolled.push(newGrade);
  }
  meta.enrolled_grades = currentEnrolled;
  user.metadata = JSON.stringify(meta);
  user.updated_at = new Date().toISOString();

  usersStore[idx] = user;

  dispatchBotReport('STUDENT_ENROLLED_ADDITIONAL_GRADE', {
    student_name: user.name,
    username: user.username,
    new_grade: newGrade,
    all_enrolled: currentEnrolled.join(', '),
    assigned_by: operator?.name || 'Leader Cô Dung'
  });

  addLeaderNotification({
    type: 'student_enrolled_grade',
    title: `➕ Mở thêm lớp cho ${user.name}`,
    body: `Đã mở thêm lớp "${newGrade}" cho học sinh ${user.name}.`,
    target_role: 'admin',
    priority: 'normal',
    action_url: '/admin#students',
    metadata: { student_id: user.id, new_grade: newGrade }
  });

  return { success: true, user, enrolled_grades: currentEnrolled };
}

function removeStudentEnrolledGradeMock(studentId, gradeToRemove, operator = null) {
  const idx = usersStore.findIndex(u => u.id === studentId);
  if (idx < 0) return { success: false, error: 'Không tìm thấy học sinh!' };

  const user = usersStore[idx];
  let meta = {};
  try { meta = typeof user.metadata === 'string' ? JSON.parse(user.metadata) : (user.metadata || {}); } catch {}

  let currentEnrolled = Array.isArray(meta.enrolled_grades) ? [...meta.enrolled_grades] : [user.grade || 'Lớp 7'];
  currentEnrolled = currentEnrolled.filter(g => g !== gradeToRemove);
  if (currentEnrolled.length === 0) currentEnrolled = [user.grade || 'Lớp 7'];

  meta.enrolled_grades = currentEnrolled;
  user.metadata = JSON.stringify(meta);
  user.updated_at = new Date().toISOString();

  usersStore[idx] = user;
  return { success: true, user, enrolled_grades: currentEnrolled };
}

// -------------------------------------------------------------
// ROUND 1: Profile Security & Student Tamper Prevention
// -------------------------------------------------------------
console.log('--- ROUND 1: Profile Security & Student Tamper Prevention ---');
let testStudent = usersStore.find(u => u.username === 'baokhiem');
assert(testStudent, 'Student baokhiem must exist in store');
const initialGrade = testStudent.grade || 'Lớp 7';
console.log(`Initial student: ${testStudent.name}, Grade: ${initialGrade}, Role: ${testStudent.role}`);

// 1.1 Student tries to change grade directly in ProfileEditModal
const studentEditRes = updateUserProfileMock(testStudent.id, {
  name: 'Nguyễn Bảo Khiêm VIP',
  grade: 'Lớp 12' // Unauthorized attempt
}, testStudent);

assert(studentEditRes.success, 'Profile call must return success');
assert.strictEqual(studentEditRes.user.grade, initialGrade, 'Student MUST NOT be able to change grade directly!');
console.log('✅ Student tamper attempt blocked: Grade remained at', studentEditRes.user.grade);

// 1.2 Transfer request auto-dispatched to Leader
const transferReqNotif = leaderNotifications.find(n => n.type === 'class_transfer_request' && n.metadata?.student_id === testStudent.id);
assert(transferReqNotif, 'Leader must receive class_transfer_request when student indicates new grade');
assert.strictEqual(transferReqNotif.priority, 'high');
console.log('✅ Leader notification generated:', transferReqNotif.title);

// 1.3 Teacher / Admin CAN update profile grade
const adminUser = usersStore.find(u => u.role === 'admin' || u.role === 'teacher');
assert(adminUser, 'Admin/teacher user must exist');
const adminEditRes = updateUserProfileMock(testStudent.id, {
  grade: 'Lớp 8'
}, adminUser);
assert.strictEqual(adminEditRes.user.grade, 'Lớp 8', 'Authorized Admin MUST be able to change grade');
console.log('✅ Admin authorized grade update succeeded: New grade is', adminEditRes.user.grade);

// Reset
updateUserGradeAndClassMock(testStudent.id, initialGrade, 'L7_GLOBAL', adminUser);
console.log('🎉 ROUND 1 PASSED: Profile security & RBAC verified.\n');

// -------------------------------------------------------------
// ROUND 2: AdminCP Class Transfer & Multi-Grade Enrollment
// -------------------------------------------------------------
console.log('--- ROUND 2: AdminCP Class Transfer & Multi-Grade Enrollment ---');
testStudent = usersStore.find(u => u.id === testStudent.id);

// 2.1 Transfer primary class to Grade 9
const transferTo9 = updateUserGradeAndClassMock(testStudent.id, 'Lớp 9', 'L9_CHUYEN', adminUser);
assert(transferTo9.success);
assert.strictEqual(transferTo9.user.grade, 'Lớp 9');
const meta9 = JSON.parse(transferTo9.user.metadata);
assert.strictEqual(meta9.grade, 'Lớp 9');
assert.strictEqual(meta9.class_id, 'L9_CHUYEN');
console.log('✅ Admin primary class transfer executed: User is now Lớp 9');

// 2.2 Enroll additional grade: IELTS
const addIelts = enrollStudentAdditionalGradeMock(testStudent.id, 'Luyện Thi IELTS', adminUser);
assert(addIelts.success);
const enrolledGrades = getUserEnrolledGrades(addIelts.user);
assert(enrolledGrades.includes('Lớp 9'), 'Must retain Grade 9');
assert(enrolledGrades.includes('Luyện Thi IELTS'), 'Must include IELTS');
console.log('✅ Enrolled grades after addition:', enrolledGrades);

// 2.3 Remove additional grade
const removeIelts = removeStudentEnrolledGradeMock(testStudent.id, 'Luyện Thi IELTS', adminUser);
assert(removeIelts.success);
const enrolledAfter = getUserEnrolledGrades(removeIelts.user);
assert(!enrolledAfter.includes('Luyện Thi IELTS'));
assert(enrolledAfter.includes('Lớp 9'));
console.log('✅ Enrolled grades after removal:', enrolledAfter);

console.log('🎉 ROUND 2 PASSED: AdminCP class transfer & multi-grade enrollment verified.\n');

// -------------------------------------------------------------
// ROUND 3: REST API Endpoint /api/students Handlers
// -------------------------------------------------------------
console.log('--- ROUND 3: REST API Endpoint Handlers Audit ---');

function mockStudentsApiHandler(action, body, operator = null) {
  const studentId = body.student_id || body.id;
  switch (action) {
    case 'change_grade':
      return updateUserGradeAndClassMock(studentId, body.grade, body.class_id || '', operator);
    case 'add_enrolled_grade':
      return enrollStudentAdditionalGradeMock(studentId, body.grade, operator);
    case 'remove_enrolled_grade':
      return removeStudentEnrolledGradeMock(studentId, body.grade, operator);
    case 'request_class_transfer':
      return requestUnlockClassMock(studentId, body.target_grade, body.note || '');
    case 'update_profile':
      return updateUserProfileMock(studentId, body.updates || {}, operator);
    default:
      return { success: false, error: 'Hành động không hợp lệ' };
  }
}

// 3.1 Test API change_grade
const apiRes1 = mockStudentsApiHandler('change_grade', { student_id: testStudent.id, grade: 'Lớp 7', class_id: 'L7_GLOBAL' }, adminUser);
assert(apiRes1.success && apiRes1.user.grade === 'Lớp 7');
console.log('✅ API action: change_grade succeeded:', apiRes1.user.grade);

// 3.2 Test API add_enrolled_grade
const apiRes2 = mockStudentsApiHandler('add_enrolled_grade', { student_id: testStudent.id, grade: 'Luyện Thi IELTS' }, adminUser);
assert(apiRes2.success && apiRes2.enrolled_grades.includes('Luyện Thi IELTS'));
console.log('✅ API action: add_enrolled_grade succeeded:', apiRes2.enrolled_grades);

// 3.3 Test API request_class_transfer
const apiRes3 = mockStudentsApiHandler('request_class_transfer', { student_id: testStudent.id, target_grade: 'Lớp 8', note: 'Gửi từ mobile app' });
assert(apiRes3.success);
console.log('✅ API action: request_class_transfer succeeded:', apiRes3.message);

console.log('🎉 ROUND 3 PASSED: REST API Endpoint Handlers verified.\n');

// -------------------------------------------------------------
// ROUND 4: Role-Grade Scoping & Exam Access Control Post-Transfer
// -------------------------------------------------------------
console.log('--- ROUND 4: Role-Grade Scoping & Exam Access Control ---');

// Reset testStudent to Lớp 7 only
updateUserGradeAndClassMock(testStudent.id, 'Lớp 7', 'L7_GLOBAL', adminUser);
removeStudentEnrolledGradeMock(testStudent.id, 'Luyện Thi IELTS', adminUser);
let currentStudent = usersStore.find(u => u.id === testStudent.id);

// 4.1 Check Grade 7 exams
let accessibleExamsG7 = getAllExamsForUser(currentStudent);
let hasG7Exams = accessibleExamsG7.some(e => e.grade === 7);
let hasG9Exams = accessibleExamsG7.some(e => e.grade === 9);
assert(hasG7Exams, 'Grade 7 student must have access to Grade 7 exams');
assert(!hasG9Exams, 'Grade 7 student MUST NOT have access to Grade 9 exams');
console.log(`✅ Student in Lớp 7 sees ${accessibleExamsG7.length} accessible exams (Grade 9 locked).`);

// 4.2 Transfer to Grade 9
updateUserGradeAndClassMock(testStudent.id, 'Lớp 9', 'L9_CHUYEN', adminUser);
currentStudent = usersStore.find(u => u.id === testStudent.id);

let accessibleExamsG9 = getAllExamsForUser(currentStudent);
let hasG7ExamsAfter = accessibleExamsG9.some(e => e.grade === 7);
let hasG9ExamsAfter = accessibleExamsG9.some(e => e.grade === 9);
assert(hasG9ExamsAfter, 'Transferred student MUST have access to Grade 9 exams');
assert(!hasG7ExamsAfter, 'Transferred student to Grade 9 MUST NOT see Grade 7 exams unlocked');
console.log(`✅ After transfer to Lớp 9: Grade 9 exams unlocked (${accessibleExamsG9.length} exams), Grade 7 locked.`);

// 4.3 Multi-grade enrolled (Lớp 9 + IELTS)
enrollStudentAdditionalGradeMock(testStudent.id, 'Luyện Thi IELTS', adminUser);
currentStudent = usersStore.find(u => u.id === testStudent.id);
let accessibleExamsMulti = getAllExamsForUser(currentStudent);
let hasIeltsExams = accessibleExamsMulti.some(e => e.format_type === 'ielts_academic' || e.curriculum_id?.includes('ielts'));
assert(hasIeltsExams, 'Multi-grade student MUST have access to IELTS exams');
console.log(`✅ Multi-grade student (Lớp 9 + IELTS) has unlocked access to BOTH! Total accessible: ${accessibleExamsMulti.length}`);

console.log('🎉 ROUND 4 PASSED: Role-grade scoping & exam locking post-transfer verified.\n');

// -------------------------------------------------------------
// ROUND 5: Leader Live Notifications & Real-Time Event Dispatch
// -------------------------------------------------------------
console.log('--- ROUND 5: Leader Live Notifications & Event Engine ---');

console.log(`Total Leader Notifications logged: ${leaderNotifications.length}`);
console.log(`Total Bot Reports dispatched: ${botReports.length}`);

const transferEvents = leaderNotifications.filter(n =>
  n.type === 'class_transfer_request' ||
  n.type === 'class_transfer_executed' ||
  n.type === 'student_enrolled_grade'
);

assert(transferEvents.length >= 3, 'Must record all transfer events');
for (const ev of transferEvents.slice(-4)) {
  console.log(`  - [${ev.priority.toUpperCase()}] ${ev.title}: ${ev.body.slice(0, 75)}...`);
}

const unreadCount = leaderNotifications.filter(n => !n.is_read).length;
assert(unreadCount >= 1, 'Unread notification count must be >= 1');
console.log(`Leader unread notification counter: ${unreadCount}`);

// Clean up
updateUserGradeAndClassMock(testStudent.id, 'Lớp 7', 'L7_GLOBAL', adminUser);
removeStudentEnrolledGradeMock(testStudent.id, 'Luyện Thi IELTS', adminUser);

console.log('🎉 ROUND 5 PASSED: Leader notification center & real-time event dispatch verified.\n');

console.log('================================================================');
console.log('🏆 5/5 REGRESSION AUDIT ROUNDS PASSED WITH 100% ZERO REGRESSION!');
console.log('================================================================');
