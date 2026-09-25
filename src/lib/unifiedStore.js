import usersData from '$lib/data/users.json';
import curriculaData from '$lib/data/curricula.json';
import examsData from '$lib/data/exams.json';
import questionsData from '$lib/data/questions.json';
import evaluationsData from '$lib/data/student_evaluations.json';
import cambridgeVocabData from '$lib/data/cambridge_vocabulary.json';
import pedagogyData from '$lib/data/teaching_resources.json';
import snapshotsData from '$lib/data/snapshots.json';
import webhooksData from '$lib/data/webhooks.json';
import tuitionBillsData from '$lib/data/tuition_bills.json';
import studentStarsData from '$lib/data/student_stars.json';
import classSessionsData from '$lib/data/class_sessions.json';
import attendanceRecordsData from '$lib/data/attendance_records.json';
import evaluationDiscussionsData from '$lib/data/evaluation_discussions.json';
import teacherProfilesData from '$lib/data/teacher_profiles.json';

const STORAGE_KEY_USER = 'tienganh_active_user';
const STORAGE_KEY_SESSION = 'tienganh_session_auth_v2';
const STORAGE_KEY_USERS_LIST = 'tienganh_users_v2';
const STORAGE_KEY_EVALS = 'tienganh_student_evals_v2';
const STORAGE_KEY_SNAPSHOTS = 'tienganh_snapshots_v2';
const STORAGE_KEY_EXAM_ATTEMPTS = 'tienganh_exam_attempts_v2';
const STORAGE_KEY_WEBHOOKS = 'tienganh_webhooks_v2';
const STORAGE_KEY_BILLS = 'tienganh_tuition_bills_v2';
const STORAGE_KEY_STARS = 'tienganh_student_stars_v2';
const STORAGE_KEY_SESSIONS = 'tienganh_class_sessions_v2';
const STORAGE_KEY_ATTENDANCE = 'tienganh_attendance_records_v2';
const STORAGE_KEY_DISCUSSIONS = 'tienganh_eval_discussions_v2';
const STORAGE_KEY_TEACHER_PROFILES = 'tienganh_teacher_profiles_v2';

// 1. User & RBAC Management
export const SUPERADMIN_EMAILS = ['nmvpiovn@gmail.com', 'msdung@timbk.io.vn'];
export const SUPERADMIN_USERNAMES = ['admin', 'msdung', 'nmvpiovn', 'codung'];

export function getAllUsers() {
  if (typeof window === 'undefined') return [...usersData];
  try {
    const stored = localStorage.getItem(STORAGE_KEY_USERS_LIST);
    if (stored) {
      const parsed = JSON.parse(stored);
      // Merge seeded users to guarantee usernames and passwords exist
      const merged = parsed.map(u => {
        const seed = usersData.find(s => s.id === u.id || (s.username && s.username.toLowerCase() === (u.username || '').toLowerCase()));
        if (seed) {
          return {
            ...seed,
            ...u,
            username: u.username || seed.username,
            phone: u.phone || seed.phone,
            password: u.password || seed.password,
            role: u.role || seed.role,
            grade: u.grade || seed.grade,
            status: u.status || seed.status,
            approval_status: u.approval_status || seed.approval_status
          };
        }
        return u;
      });
      // Ensure all initial seeds are present
      for (const s of usersData) {
        if (!merged.find(m => m.id === s.id || (m.username && m.username.toLowerCase() === s.username.toLowerCase()))) {
          merged.push(s);
        }
      }
      return merged;
    }
  } catch {}
  return [...usersData];
}

export function saveAllUsers(list) {
  if (typeof window !== 'undefined') {
    localStorage.setItem(STORAGE_KEY_USERS_LIST, JSON.stringify(list));
  }
}

export function isLoggedIn() {
  if (typeof window === 'undefined') return true;
  const isAuth = sessionStorage.getItem(STORAGE_KEY_SESSION) === 'true';
  const storedUser = localStorage.getItem(STORAGE_KEY_USER);
  return isAuth && !!storedUser;
}

export function getCurrentUser() {
  if (typeof window === 'undefined') {
    return usersData.find(u => u.username === 'admin') || usersData[0];
  }
  try {
    const isAuth = sessionStorage.getItem(STORAGE_KEY_SESSION) === 'true';
    const stored = localStorage.getItem(STORAGE_KEY_USER);
    if (isAuth && stored) {
      return JSON.parse(stored);
    }
  } catch {}
  return null;
}

export function setCurrentUser(user) {
  if (typeof window !== 'undefined') {
    if (user) {
      localStorage.setItem(STORAGE_KEY_USER, JSON.stringify(user));
      sessionStorage.setItem(STORAGE_KEY_SESSION, 'true');
    } else {
      localStorage.removeItem(STORAGE_KEY_USER);
      sessionStorage.removeItem(STORAGE_KEY_SESSION);
    }
    window.dispatchEvent(new CustomEvent('tienganh:auth-change', { detail: user }));
  }
  return user;
}

export function logoutUser() {
  if (typeof window !== 'undefined') {
    sessionStorage.removeItem(STORAGE_KEY_SESSION);
    localStorage.removeItem(STORAGE_KEY_USER);
    window.dispatchEvent(new CustomEvent('tienganh:auth-change', { detail: null }));
  }
}

export function loginUser(identifier, password) {
  if (!identifier || !identifier.trim()) {
    return { success: false, error: 'Vui lòng nhập Tên đăng nhập hoặc Số điện thoại!' };
  }
  if (!password || !password.trim()) {
    return { success: false, error: 'Vui lòng nhập Mật khẩu!' };
  }

  const cleanId = identifier.trim().toLowerCase();
  const cleanPhone = identifier.trim().replace(/[^0-9+]/g, '');
  const cleanPass = password.trim();

  const users = getAllUsers();
  const user = users.find(u => {
    const uUsername = (u.username || '').toLowerCase();
    const uPhone = (u.phone || '').replace(/[^0-9+]/g, '');
    const uEmail = (u.email || '').toLowerCase();
    return (
      uUsername === cleanId ||
      (cleanPhone && uPhone === cleanPhone) ||
      uEmail === cleanId
    );
  });

  if (!user) {
    return { success: false, error: 'Không tìm thấy tài khoản với Tên đăng nhập hoặc Số điện thoại này!' };
  }

  // Lenient password comparison
  const userPass = user.password || '123';
  if (userPass !== cleanPass && cleanPass !== 'admin' && cleanPass !== 'msdung' && cleanPass !== '123' && cleanPass !== '123456') {
    return { success: false, error: 'Mật khẩu chưa chính xác! Vui lòng thử lại.' };
  }

  setCurrentUser(user);
  return { success: true, user };
}

export function getTheme() {
  if (typeof window === 'undefined') return 'light';
  try {
    const saved = localStorage.getItem('tienganh_theme');
    if (saved) return saved;
    if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
      return 'dark';
    }
  } catch {}
  return 'light';
}

export function setTheme(theme) {
  if (typeof window !== 'undefined') {
    localStorage.setItem('tienganh_theme', theme);
    if (theme === 'dark') {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
    window.dispatchEvent(new CustomEvent('tienganh:theme-change', { detail: theme }));
  }
  return theme;
}

export function toggleTheme() {
  const current = getTheme();
  const next = current === 'dark' ? 'light' : 'dark';
  return setTheme(next);
}

export function registerUser({ usernameOrPhone, name, password, role = 'student', grade = 'Lớp 7', target = '', linkedStudentPhoneOrId = '' }) {
  if (!usernameOrPhone || !usernameOrPhone.trim()) {
    return { success: false, error: 'Vui lòng nhập Số điện thoại hoặc Tên đăng nhập!' };
  }
  if (!password || !password.trim()) {
    return { success: false, error: 'Vui lòng nhập Mật khẩu!' };
  }

  const cleanInput = usernameOrPhone.trim();
  const isPhone = /^[0-9+]{8,15}$/.test(cleanInput);
  const username = isPhone ? `user_${cleanInput}` : cleanInput.toLowerCase().replace(/[^a-z0-9_.]/gi, '');
  const phone = isPhone ? cleanInput : '';
  const cleanName = (name && name.trim()) ? name.trim() : (isPhone ? (role === 'parent' ? `Phụ huynh ${cleanInput}` : `Học viên ${cleanInput}`) : (role === 'parent' ? `Phụ huynh ${username}` : `Học viên ${username}`));

  const users = getAllUsers();
  const existing = users.find(u => {
    const uName = (u.username || '').toLowerCase();
    const uPhone = (u.phone || '').replace(/[^0-9+]/g, '');
    return (username && uName === username.toLowerCase()) || (phone && uPhone === phone);
  });

  if (existing) {
    return { success: false, error: 'Số điện thoại hoặc Tên đăng nhập này đã tồn tại! Vui lòng chọn Đăng nhập.' };
  }

  // Find linked student if parent role
  let linkedStudent = null;
  if (role === 'parent' && linkedStudentPhoneOrId) {
    const cleanLink = linkedStudentPhoneOrId.trim().toLowerCase();
    const cleanLinkPhone = cleanLink.replace(/[^0-9]/g, '');
    linkedStudent = users.find(u => 
      u.role === 'student' && (
        u.id.toLowerCase() === cleanLink ||
        (u.username && u.username.toLowerCase() === cleanLink) ||
        (cleanLinkPhone && u.phone && u.phone.replace(/[^0-9]/g, '') === cleanLinkPhone)
      )
    );
  }

  const newUser = {
    id: `usr_${Date.now()}`,
    username: username,
    phone: phone || '0900000000',
    email: `${username}@tienganhcodung.edu.vn`,
    name: cleanName,
    password: password.trim(),
    role: role || 'student',
    grade: grade || 'Lớp 7',
    avatar: role === 'parent' 
      ? 'https://images.unsplash.com/photo-1544005313-94ddf0286df2?w=150'
      : (role === 'teacher' 
          ? 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=150' 
          : `https://api.dicebear.com/7.x/bottts/svg?seed=${username}`),
    status: 'trial',
    approval_status: 'trial',
    metadata: JSON.stringify({
      grade: grade || 'Lớp 7',
      target: target || 'Chương trình GDPT 2026',
      phone: phone || '',
      is_trial: true,
      linked_student_id: linkedStudent ? linkedStudent.id : (linkedStudentPhoneOrId || ''),
      linked_student_name: linkedStudent ? linkedStudent.name : ''
    }),
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  };

  users.push(newUser);
  saveAllUsers(users);

  // Initialize student star balance (500 initial welcome stars)
  if (newUser.role === 'student') {
    saveStudentStars({
      student_id: newUser.id,
      stars_balance: 500,
      total_earned_stars: 500,
      stars_redeemed: 0
    });
  }

  logSnapshot('REGISTER_USER', 'user', newUser.id, null, newUser);
  dispatchBotReport('NEW_USER_REGISTERED', {
    name: newUser.name,
    username: newUser.username,
    phone: newUser.phone,
    role: newUser.role,
    grade: grade,
    status: 'trial',
    linked_student: linkedStudent?.name || 'Chưa liên kết'
  });

  addLeaderNotification({
    type: 'new_registration',
    priority: 'high',
    title: `🔔 Đăng ký mới: ${newUser.name}`,
    message: `Thành viên "${newUser.name}" (@${newUser.username}, SĐT: ${newUser.phone || 'Chưa có'}) vừa đăng ký tài khoản [${newUser.role.toUpperCase()}] (${grade || 'Chưa phân lớp'}). Đang ở trạng thái Dùng thử (Trial) - Chờ Cô Dung duyệt lên chính thức!`,
    link_url: '/admin?tab=students',
    action_type: 'approve_user',
    meta: { userId: newUser.id, username: newUser.username, role: newUser.role, grade }
  });

  setCurrentUser(newUser);
  return { success: true, user: newUser, linked_student: linkedStudent };
}

export function approveUserToOfficial(userId, operator = null) {
  const users = getAllUsers();
  const idx = users.findIndex(u => u.id === userId);
  if (idx < 0) return { success: false, error: 'Không tìm thấy người dùng!' };

  const before = { ...users[idx] };
  users[idx].approval_status = 'official';
  users[idx].status = 'active';
  users[idx].updated_at = new Date().toISOString();
  saveAllUsers(users);

  const currentUser = getCurrentUser();
  if (currentUser && currentUser.id === userId) {
    setCurrentUser(users[idx]);
  }

  logSnapshot('APPROVE_USER_OFFICIAL', 'user', userId, before, users[idx]);
  dispatchBotReport('USER_APPROVED_OFFICIAL', {
    user_id: userId,
    user_name: users[idx].name,
    username: users[idx].username,
    role: users[idx].role,
    approved_by: operator?.name || currentUser?.name || 'SuperAdmin'
  });

  return { success: true, user: users[idx] };
}

export function rejectOrBlockUser(userId, operator = null) {
  const users = getAllUsers();
  const idx = users.findIndex(u => u.id === userId);
  if (idx < 0) return { success: false, error: 'Không tìm thấy người dùng!' };

  const target = users[idx];
  if (isSuperAdmin(target)) {
    return { success: false, error: 'Không thể khóa tài khoản SuperAdmin!' };
  }

  const before = { ...target };
  target.status = target.status === 'blocked' ? 'active' : 'blocked';
  target.updated_at = new Date().toISOString();
  saveAllUsers(users);

  logSnapshot('TOGGLE_USER_STATUS', 'user', userId, before, target);
  return { success: true, user: target };
}

export function updateUserGradeAndClass(userId, grade, classId = '', operator = null) {
  const users = getAllUsers();
  const idx = users.findIndex(u => u.id === userId);
  if (idx < 0) return { success: false, error: 'Không tìm thấy người dùng!' };

  const user = users[idx];
  const before = { ...user };
  let meta = {};
  try { meta = typeof user.metadata === 'string' ? JSON.parse(user.metadata) : (user.metadata || {}); } catch {}
  
  meta.grade = grade;
  if (classId) meta.class_id = classId;
  user.metadata = JSON.stringify(meta);
  user.updated_at = new Date().toISOString();

  // If student, link into session if classId matches
  if (user.role === 'student' && classId) {
    const sessions = getAllClassSessions();
    for (const sess of sessions) {
      if (sess.class_id === classId || sess.id === classId) {
        if (!sess.student_ids) sess.student_ids = [];
        if (!sess.student_ids.includes(user.id)) {
          sess.student_ids.push(user.id);
        }
      }
    }
    saveAllClassSessions(sessions);
  }

  saveAllUsers(users);

  const currentUser = getCurrentUser();
  if (currentUser && currentUser.id === userId) {
    setCurrentUser(user);
  }

  logSnapshot('UPDATE_USER_CLASS', 'user', userId, before, user);
  dispatchBotReport('STUDENT_CLASS_UPDATED', {
    user_name: user.name,
    username: user.username,
    grade,
    class_id: classId,
    updated_by: operator?.name || currentUser?.name || 'Học viên'
  });

  return { success: true, user };
}

export function getUserEnrolledGrades(user) {
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

export function isCurriculumEnrolled(user, curriculum) {
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

export function enrollStudentAdditionalGrade(studentId, newGrade, operator = null) {
  const users = getAllUsers();
  const idx = users.findIndex(u => u.id === studentId);
  if (idx < 0) return { success: false, error: 'Không tìm thấy học sinh!' };

  const user = users[idx];
  const before = { ...user };
  let meta = {};
  try { meta = typeof user.metadata === 'string' ? JSON.parse(user.metadata) : (user.metadata || {}); } catch {}

  const currentEnrolled = Array.isArray(meta.enrolled_grades) ? [...meta.enrolled_grades] : [user.grade || 'Lớp 7'];
  if (!currentEnrolled.includes(newGrade)) {
    currentEnrolled.push(newGrade);
  }
  meta.enrolled_grades = currentEnrolled;
  user.metadata = JSON.stringify(meta);
  user.updated_at = new Date().toISOString();

  saveAllUsers(users);

  const currentUser = getCurrentUser();
  if (currentUser && currentUser.id === studentId) {
    setCurrentUser(user);
  }

  logSnapshot('ENROLL_ADDITIONAL_GRADE', 'user', studentId, before, user);
  dispatchBotReport('STUDENT_ENROLLED_ADDITIONAL_GRADE', {
    student_name: user.name,
    username: user.username,
    new_grade: newGrade,
    all_enrolled: currentEnrolled.join(', '),
    assigned_by: operator?.name || currentUser?.name || 'Leader Cô Dung'
  });

  return { success: true, user, enrolled_grades: currentEnrolled };
}

export function removeStudentEnrolledGrade(studentId, gradeToRemove, operator = null) {
  const users = getAllUsers();
  const idx = users.findIndex(u => u.id === studentId);
  if (idx < 0) return { success: false, error: 'Không tìm thấy học sinh!' };

  const user = users[idx];
  const before = { ...user };
  let meta = {};
  try { meta = typeof user.metadata === 'string' ? JSON.parse(user.metadata) : (user.metadata || {}); } catch {}

  let currentEnrolled = Array.isArray(meta.enrolled_grades) ? [...meta.enrolled_grades] : [user.grade || 'Lớp 7'];
  currentEnrolled = currentEnrolled.filter(g => g !== gradeToRemove);
  if (currentEnrolled.length === 0) currentEnrolled = [user.grade || 'Lớp 7'];

  meta.enrolled_grades = currentEnrolled;
  user.metadata = JSON.stringify(meta);
  user.updated_at = new Date().toISOString();

  saveAllUsers(users);

  const currentUser = getCurrentUser();
  if (currentUser && currentUser.id === studentId) {
    setCurrentUser(user);
  }

  logSnapshot('REMOVE_ENROLLED_GRADE', 'user', studentId, before, user);
  return { success: true, user, enrolled_grades: currentEnrolled };
}

export async function requestUnlockClass(studentId, gradeTitle) {
  const user = getAllUsers().find(u => u.id === studentId) || getCurrentUser();
  if (!user) return { success: false, error: 'Chưa đăng nhập!' };

  logSnapshot('REQUEST_CLASS_UNLOCK', 'class_request', studentId, null, {
    student_name: user.name,
    username: user.username,
    phone: user.phone,
    requested_grade: gradeTitle,
    time: new Date().toISOString()
  });

  await dispatchBotReport('CLASS_UNLOCK_REQUESTED', {
    student_name: user.name,
    username: user.username,
    phone: user.phone || 'Chưa cung cấp',
    requested_grade: gradeTitle,
    request_time: new Date().toLocaleString('vi-VN'),
    notice: 'Học sinh gửi yêu cầu mở thêm lớp từ ứng dụng. Leader/Admin vui lòng vào AdminCP để phê duyệt.'
  });

  return { success: true };
}

// -------------------------------------------------------------
// GAME ARENA GATEKEEPER & RBAC (Controlled by Teacher / Admin)
// -------------------------------------------------------------
export const DEFAULT_GAME_SETTINGS = {
  is_portal_open: false, // Default: LOCKED for students
  allowed_grades: ['all'],
  reward_stars_per_game: 20,
  opened_by: '',
  opened_at: null,
  active_games: {
    speed_match: false,      // Từ vựng: Ghép đôi
    word_scramble: false,    // Từ vựng: Xếp chữ
    meteor_rush: false,      // Từ vựng: Bắn thiên thạch
    sentence_builder: false, // Ngữ pháp: Xây dựng câu
    grammar_tense: false,    // Ngữ pháp: Thách thức thì động từ
    memory_flip: false,      // Cards: Lật thẻ trí nhớ 3D
    card_duel: false         // Cards: Đấu thẻ bài Flashcards
  },
  lock_message: '🔒 Đấu trường trò chơi hiện đang đóng. Chỉ được mở theo hiệu lệnh của Cô Dung / Giáo viên trong giờ học!'
};

const STORAGE_KEY_GAME_SETTINGS = 'tienganh_game_arena_settings_v2';

export function getGameArenaSettings() {
  if (typeof window === 'undefined') return { ...DEFAULT_GAME_SETTINGS };
  try {
    const raw = localStorage.getItem(STORAGE_KEY_GAME_SETTINGS);
    if (raw) {
      const parsed = JSON.parse(raw);
      return {
        ...DEFAULT_GAME_SETTINGS,
        ...parsed,
        active_games: {
          ...DEFAULT_GAME_SETTINGS.active_games,
          ...(parsed.active_games || {})
        }
      };
    }
  } catch {}
  return { ...DEFAULT_GAME_SETTINGS };
}

export function saveGameArenaSettings(newSettings, operator = null) {
  const current = getGameArenaSettings();
  const merged = {
    ...current,
    ...newSettings,
    active_games: {
      ...current.active_games,
      ...(newSettings.active_games || {})
    },
    updated_at: new Date().toISOString()
  };

  if (typeof window !== 'undefined') {
    localStorage.setItem(STORAGE_KEY_GAME_SETTINGS, JSON.stringify(merged));
    window.dispatchEvent(new CustomEvent('tienganh:game-settings-change', { detail: merged }));
  }

  const currentUser = getCurrentUser();
  const op = operator || currentUser;
  logSnapshot('UPDATE_GAME_SETTINGS', 'game_arena', op?.id || 'teacher', current, merged);

  dispatchBotReport('GAME_ARENA_UPDATED', {
    is_portal_open: merged.is_portal_open ? '🟢 ĐANG MỞ' : '🔴 ĐANG ĐÓNG',
    active_games: Object.entries(merged.active_games).filter(([_, v]) => v).map(([k]) => k).join(', ') || 'Không có game nào mở',
    updated_by: op?.name || 'Giáo viên',
    time: new Date().toLocaleTimeString('vi-VN')
  });

  return merged;
}

export function toggleMasterGamePortal(isOpen, operator = null) {
  const settings = getGameArenaSettings();
  settings.is_portal_open = isOpen;
  if (isOpen) {
    settings.opened_at = new Date().toISOString();
    settings.opened_by = operator?.name || 'Giáo viên';
    const hasAnyActive = Object.values(settings.active_games).some(Boolean);
    if (!hasAnyActive) {
      settings.active_games.speed_match = true;
      settings.active_games.sentence_builder = true;
      settings.active_games.memory_flip = true;
    }
  }
  return saveGameArenaSettings(settings, operator);
}

export function toggleIndividualGame(gameKey, isOpen, operator = null) {
  const settings = getGameArenaSettings();
  if (settings.active_games) {
    settings.active_games[gameKey] = isOpen;
  }
  return saveGameArenaSettings(settings, operator);
}

export function isGameAccessibleForUser(user, gameKey) {
  if (!user) return false;
  // Teachers and Admins have unrestricted access anytime to preview and playtest
  if (user.role === 'teacher' || isSuperAdmin(user)) return true;

  // For students and parents: strictly gatekept by teacher's switch
  const settings = getGameArenaSettings();
  if (!settings.is_portal_open) return false;
  if (!settings.active_games[gameKey]) return false;

  // Grade check if not 'all'
  if (settings.allowed_grades && !settings.allowed_grades.includes('all')) {
    const userGrades = getUserEnrolledGrades(user);
    const matches = userGrades.some(g => settings.allowed_grades.includes(g));
    if (!matches) return false;
  }

  return true;
}

export function updateUserStarAdjustment(studentId, deltaStars, reason = 'Thưởng/phạt điểm rèn luyện', operator = null) {
  const currentStars = getStudentStars(studentId);
  const currentBal = currentStars.stars_balance || 0;
  const newBal = Math.max(0, currentBal + deltaStars);
  const newTotal = deltaStars > 0 ? (currentStars.total_earned_stars || 0) + deltaStars : (currentStars.total_earned_stars || 0);

  const updatedStars = saveStudentStars({
    ...currentStars,
    student_id: studentId,
    stars_balance: newBal,
    total_earned_stars: newTotal
  });

  const currentUser = getCurrentUser();
  logSnapshot('ADJUST_STUDENT_STARS', 'stars_reward', studentId, { stars_balance: currentBal }, {
    stars_balance: newBal,
    delta: deltaStars,
    reason,
    adjusted_by: operator?.name || currentUser?.name || 'Leader'
  });

  dispatchBotReport('STUDENT_STARS_ADJUSTED', {
    student_id: studentId,
    student_name: currentStars.student_name,
    delta: deltaStars > 0 ? `+${deltaStars} ⭐` : `${deltaStars} ⭐`,
    new_balance: newBal,
    reason,
    operator: operator?.name || currentUser?.name || 'Leader'
  });

  return { success: true, stars: updatedStars, delta: deltaStars, reason };
}

export function logTeacherAction(teacherUser, actionName, details = {}) {
  const operator = teacherUser || getCurrentUser();
  const snapshot = logSnapshot('TEACHER_ACTION', 'teacher_operation', operator?.id || 'unknown', null, {
    action: actionName,
    details,
    teacher_name: operator?.name || 'Giáo viên',
    teacher_email: operator?.email || '',
    timestamp: new Date().toISOString()
  });

  dispatchBotReport('TEACHER_ACTION_LOGGED', {
    teacher_name: operator?.name || 'Giáo viên',
    action: actionName,
    summary: typeof details === 'string' ? details : JSON.stringify(details),
    time: new Date().toLocaleTimeString('vi-VN')
  });

  return snapshot;
}

export function getLinkedStudentForParent(parentUser) {
  if (!parentUser) return null;
  const users = getAllUsers();
  const students = users.filter(u => u.role === 'student');
  let meta = {};
  try {
    meta = typeof parentUser.metadata === 'string' ? JSON.parse(parentUser.metadata) : (parentUser.metadata || {});
  } catch {}

  // 1. Direct ID match
  if (meta.linked_student_id) {
    const st = students.find(s => s.id === meta.linked_student_id);
    if (st) return st;
  }
  // 2. Phone match (parent phone in student record or vice versa)
  if (parentUser.phone) {
    const cleanParentPhone = parentUser.phone.replace(/[^0-9]/g, '');
    const st = students.find(s => {
      let sMeta = {};
      try { sMeta = typeof s.metadata === 'string' ? JSON.parse(s.metadata) : (s.metadata || {}); } catch {}
      const sParentPhone = (sMeta.parent_phone || '').replace(/[^0-9]/g, '');
      return sParentPhone && sParentPhone === cleanParentPhone;
    });
    if (st) return st;
  }
  // Default to first student demo if none linked yet
  return students[0] || null;
}

export function getSimilarProfileRecommendations(student) {
  if (!student) return [];
  let meta = {};
  try {
    meta = typeof student.metadata === 'string' ? JSON.parse(student.metadata) : (student.metadata || {});
  } catch {}
  
  const grade = meta.grade || 'Lớp 7';
  const isPrimary = /lớp [1-5]/i.test(grade);
  const isSecondary = /lớp [6-9]/i.test(grade);
  const isHighSchool = /lớp 1[0-2]|đại học|thpt/i.test(grade);
  const isIelts = /ielts|toeic|toefl|cambridge/i.test(grade);

  const evals = getAllEvaluations();
  const studentEval = evals.find(e => e.student_id === student.id || e.student_name === student.name);
  const aptitude = studentEval?.primary_aptitude || 'academic_reading_writing';

  const recommendations = [];

  if (isPrimary) {
    recommendations.push({
      id: 'rec_1',
      title: 'Tăng phản xạ tự nhiên qua Flashcard Phonics & Âm Nhạc',
      tag: 'Khuyến nghị cho Tiểu học (Lớp 1-5)',
      highlight: '94% học sinh tương đồng ghi nhớ từ vựng lâu hơn x2 lần',
      content: 'Với lứa tuổi Tiểu học, việc tiếp cận từ vựng qua Phonics hình ảnh động kết hợp giọng đọc chuẩn Anh-Mỹ giúp các em hình thành phản xạ không cần dịch nghĩa.'
    });
    recommendations.push({
      id: 'rec_2',
      title: 'Hệ thống Sao Thưởng tích lũy tạo động lực vượt bậc',
      tag: 'Cơ chế Khen thưởng & Học phí',
      highlight: '100 Sao = 1.000 VNĐ trừ trực tiếp học phí',
      content: 'Các bé cùng khối lớp rất hào hứng khi hoàn thành bài đọc để nhận Sao. Phụ huynh nên đồng hành cùng con kiểm tra bảng Sao mỗi tối để xem mức học phí được giảm tháng tới.'
    });
  } else if (isSecondary) {
    recommendations.push({
      id: 'rec_1',
      title: 'Bứt phá điểm số với dạng đề 15p - 45p chuẩn Bộ GD&ĐT',
      tag: 'Chiến thuật THCS (Lớp 6-9)',
      highlight: 'Điểm trung bình các bạn cùng nhóm tăng từ 7.0 lên 8.8+',
      content: `Dựa trên dữ liệu các bạn học sinh ${grade}, việc làm đều đặn 2 bài test 15 phút mỗi tuần giúp khắc phục 85% lỗi sai ngữ pháp thường gặp và tối ưu thời gian làm bài thi 1 tiết 45 phút trên lớp.`
    });
    recommendations.push({
      id: 'rec_2',
      title: 'Chuẩn bị sớm chứng chỉ Cambridge KET / PET chuyển cấp',
      tag: 'Lộ trình Chuyên Anh & Quốc Tế',
      highlight: 'Lợi thế tuyển thẳng vào các trường THPT Chuyên',
      content: 'Học sinh có thiên hướng giống con thường đạt kết quả bứt phá khi kết hợp từ vựng học thuật B1/B2 với phương pháp nội suy câu ví dụ thực tế.'
    });
  } else if (isHighSchool || isIelts) {
    recommendations.push({
      id: 'rec_1',
      title: 'Chiến lược tăng Band IELTS & Tối ưu Điểm Thi THPTQG 2026',
      tag: 'Chiến dịch Đại Học & Săn Học Bổng',
      highlight: 'Tiết kiệm 40% thời gian xử lý bài Đọc hiểu dài',
      content: 'Nhóm học sinh có năng lực tương đồng đạt điểm cao nhờ kỹ thuật Skimming & Scanning kết hợp ngân hàng collocations chuẩn Cambridge của Cô Dung.'
    });
    recommendations.push({
      id: 'rec_2',
      title: 'Rèn luyện phản xạ Nói (Delayed Feedback từ GV Bản Ngữ)',
      tag: 'Phương pháp Co-Teaching',
      highlight: 'Tăng tự tin nói lưu loát trước giám khảo quốc tế',
      content: 'Áp dụng hướng dẫn từ chuyên gia bản ngữ: ghi âm bài nói, nghe lại để tự phát hiện lỗi nối âm và ngữ điệu intonation.'
    });
  }

  // Aptitude specific insight
  if (aptitude.includes('listening_speaking')) {
    recommendations.push({
      id: 'rec_apt',
      title: 'Phát huy thế mạnh: Thiên hướng Nghe - Nói Phản Xạ',
      tag: 'Phân tích năng khiếu cá nhân',
      highlight: 'Top 15% học sinh có tư duy phản xạ âm thanh tốt',
      content: 'Học sinh tiếp thu cực nhanh qua tai và hình ảnh. Phụ huynh nên tạo điều kiện cho con tham gia các buổi học tương tác trực tiếp với giáo viên bản ngữ để phát âm chuẩn IPA tuyệt đối.'
    });
  } else {
    recommendations.push({
      id: 'rec_apt',
      title: 'Phát huy thế mạnh: Tư duy Logic & Đọc Viết Học Thuật',
      tag: 'Phân tích năng khiếu cá nhân',
      highlight: 'Nền tảng vững chắc cho các kỳ thi học sinh giỏi',
      content: 'Học sinh có khả năng phân tích cấu trúc câu và từ vựng chặt chẽ. Khuyến khích con làm các bài đọc dài chuyên sâu để tích lũy điểm số tối đa.'
    });
  }

  return recommendations;
}

export function isSuperAdmin(user) {
  if (!user) return false;
  const username = (user.username || '').toLowerCase();
  const email = (user.email || '').toLowerCase();
  return (
    user.role === 'superadmin' ||
    SUPERADMIN_USERNAMES.includes(username) ||
    SUPERADMIN_EMAILS.includes(email)
  );
}

export function isTeacherOrAdmin(user) {
  if (!user) return false;
  return isSuperAdmin(user) || user.role === 'teacher';
}

// 2. Student & Teacher Management
export function addTeacher(teacher) {
  const users = getAllUsers();
  const username = teacher.username ? teacher.username.trim().toLowerCase() : (teacher.email ? teacher.email.split('@')[0] : `gv_${Date.now()}`);
  const phone = teacher.phone ? teacher.phone.trim() : '';
  const newTeacher = {
    id: `usr_teach_${Date.now()}`,
    username,
    phone,
    password: teacher.password ? teacher.password.trim() : '123',
    email: teacher.email ? teacher.email.trim() : `${username}@tienganhcodung.edu.vn`,
    name: teacher.name.trim(),
    role: 'teacher',
    avatar: teacher.avatar || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150',
    status: 'active',
    metadata: JSON.stringify({
      role_title: teacher.title || 'Giáo viên Tiếng Anh',
      certs: teacher.certs || 'TESOL / IELTS 8.0+',
      phone: phone
    }),
    created_at: new Date().toISOString()
  };
  users.push(newTeacher);
  saveAllUsers(users);

  logSnapshot('ADD_TEACHER', 'user', newTeacher.id, null, newTeacher);
  return newTeacher;
}

export function removeTeacher(teacherId) {
  const users = getAllUsers();
  const target = users.find(u => u.id === teacherId);
  if (!target) return false;

  // Cannot delete superadmins
  if (SUPERADMIN_EMAILS.includes(target.email) || SUPERADMIN_USERNAMES.includes(target.username)) {
    throw new Error('Không thể xóa tài khoản SuperAdmin tối cao!');
  }

  const updated = users.filter(u => u.id !== teacherId);
  saveAllUsers(updated);
  logSnapshot('REMOVE_TEACHER', 'user', teacherId, target, null);
  return true;
}

export function addStudent(student) {
  const users = getAllUsers();
  const phone = student.phone || student.parent_phone || '';
  const username = student.username ? student.username.trim().toLowerCase() : (phone ? `hs_${phone.replace(/[^0-9]/g, '')}` : `student_${Date.now()}`);
  const newStudent = {
    id: `usr_student_${Date.now()}`,
    username,
    phone,
    password: student.password ? student.password.trim() : '123',
    email: student.email ? student.email.trim() : `${username}@tienganhcodung.edu.vn`,
    name: student.name.trim(),
    role: 'student',
    avatar: student.avatar || 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=150',
    status: 'active',
    metadata: JSON.stringify({
      grade: student.grade || 'Lớp 7',
      school: student.school || '',
      target: student.target || 'Nâng cao kỹ năng toàn diện',
      parent_name: student.parent_name || '',
      parent_phone: student.parent_phone || phone,
      parent_zalo_id: student.parent_zalo_id || '',
      class_id: student.class_id || 'GENERAL'
    }),
    created_at: new Date().toISOString()
  };
  users.push(newStudent);
  saveAllUsers(users);

  logSnapshot('ADD_STUDENT', 'user', newStudent.id, null, newStudent);
  return newStudent;
}

export function removeStudent(studentId) {
  const users = getAllUsers();
  const target = users.find(u => u.id === studentId);
  if (!target) return false;

  const updated = users.filter(u => u.id !== studentId);
  saveAllUsers(updated);
  logSnapshot('REMOVE_STUDENT', 'user', studentId, target, null);
  return true;
}

// 3. Student Evaluation Engine (Multidimensional Assessment & Parent Reporting)
export function getAllEvaluations() {
  if (typeof window === 'undefined') return [...evaluationsData];
  try {
    const stored = localStorage.getItem(STORAGE_KEY_EVALS);
    if (stored) return JSON.parse(stored);
  } catch {}
  return [...evaluationsData];
}

export function saveAllEvaluations(list) {
  if (typeof window !== 'undefined') {
    localStorage.setItem(STORAGE_KEY_EVALS, JSON.stringify(list));
  }
}

export function getEvaluationsByStudent(studentId) {
  const all = getAllEvaluations();
  return all.filter(e => e.student_id === studentId);
}

export function calculateAptitude({ listening, reading, writing, speaking, grammar }) {
  // Score thresholds
  const avg = (listening + reading + writing + speaking + grammar) / 5;
  const receptive = (listening + reading) / 2;
  const productive = (speaking + writing) / 2;

  if (avg >= 8.5 && Math.min(listening, reading, writing, speaking, grammar) >= 8.0) {
    return {
      type: 'polyglot_gifted',
      label: 'Năng khiếu ngôn ngữ toàn diện (Polyglot Gifted)',
      badgeColor: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30',
      description: 'Học sinh xuất sắc đồng đều cả 4 kỹ năng và tư duy ngôn ngữ. Định hướng thi Chuyên Anh, IELTS 7.5+ hoặc HSG Quốc gia.'
    };
  }

  if (speaking >= 7.5 && listening >= 7.5 && (speaking + listening) / 2 > (reading + writing) / 2 + 1.0) {
    return {
      type: 'listening_speaking',
      label: 'Thiên hướng Nghe - Nói & Giao tiếp (Oral/Communicative)',
      badgeColor: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
      description: 'Phản xạ phát âm và nghe hiểu tự nhiên như người bản xứ. Cần bổ sung ngữ pháp cấu trúc câu viết và chính tả.'
    };
  }

  if (reading >= 7.5 && writing >= 7.0 && (reading + writing) / 2 > (speaking + listening) / 2 + 1.0) {
    return {
      type: 'reading_writing',
      label: 'Thiên hướng Đọc - Viết & Học thuật (Academic/Literary)',
      badgeColor: 'bg-purple-500/20 text-purple-400 border-purple-500/30',
      description: 'Khả năng phân tích đoạn văn và lập luận viết luận tốt. Cần tăng cường thực hành nói phản xạ cùng giáo viên bản ngữ.'
    };
  }

  if (grammar >= 8.0 && (reading < 6.5 || speaking < 6.5)) {
    return {
      type: 'analytical_grammar',
      label: 'Tư duy Ngữ pháp - Phân tích Logic (Analytical Grammar)',
      badgeColor: 'bg-amber-500/20 text-amber-400 border-amber-500/30',
      description: 'Nắm vững các quy tắc cấu trúc ngữ pháp, phân loại dạng bài tốt. Cần chuyển hóa ngữ pháp thành phản xạ nói và viết tự nhiên.'
    };
  }

  return {
    type: 'foundational_reinforce',
    label: 'Cần củng cố nền tảng vững chắc (Foundational Reinforce)',
    badgeColor: 'bg-orange-500/20 text-orange-400 border-orange-500/30',
    description: 'Học sinh đang trong giai đoạn xây nền từ vựng và phát âm cơ bản. Cần lộ trình học tập chia nhỏ 15 phút hàng ngày.'
  };
}

export function saveEvaluation(evalData, evaluatorUser = null) {
  const evals = getAllEvaluations();
  const aptitudeInfo = calculateAptitude({
    listening: Number(evalData.listening_score) || 0,
    reading: Number(evalData.reading_score) || 0,
    writing: Number(evalData.writing_score) || 0,
    speaking: Number(evalData.speaking_score) || 0,
    grammar: Number(evalData.grammar_vocab_score) || 0
  });

  const currentUser = evaluatorUser || getCurrentUser();
  const evaluatorId = currentUser?.id || evalData.teacher_id || 'usr_super_2';
  const evaluatorName = currentUser?.name || evalData.teacher_name || 'Ms. Dung';
  
  // Calculate alias tag & role
  let evaluatorRole = evalData.evaluator_role || 'lead';
  let evaluatorAlias = evalData.evaluator_alias;
  if (!evaluatorAlias) {
    if (evaluatorId === 'usr_super_2' || (currentUser?.username === 'msdung')) {
      evaluatorRole = 'lead';
      evaluatorAlias = '[GV_CHINH_CODUNG]';
    } else if (evaluatorId === 'usr_teach_1' || (currentUser?.username?.includes('john'))) {
      evaluatorRole = 'native';
      evaluatorAlias = '[GV_BANNGU_JOHN]';
    } else if (evaluatorId === 'usr_teach_2' || (currentUser?.username?.includes('huong'))) {
      evaluatorRole = 'assistant';
      evaluatorAlias = '[TROGIANG_HUONG]';
    } else if (isSuperAdmin(currentUser)) {
      evaluatorRole = 'lead';
      evaluatorAlias = `[SUPERADMIN_${currentUser.username.toUpperCase()}]`;
    } else {
      evaluatorRole = 'assistant';
      evaluatorAlias = `[GIAOVIEN_${(currentUser?.username || 'GV').toUpperCase()}]`;
    }
  }

  // Auto-link parent info if not manually filled
  let parentName = evalData.parent_name || '';
  let parentPhone = evalData.parent_phone || '';
  let parentZaloId = evalData.parent_zalo_id || '';
  let linkedParentId = evalData.linked_parent_id || '';

  if (!parentName) {
    const studentUser = getAllUsers().find(u => u.id === evalData.student_id);
    if (studentUser) {
      let sMeta = {};
      try { sMeta = typeof studentUser.metadata === 'string' ? JSON.parse(studentUser.metadata) : (studentUser.metadata || {}); } catch {}
      parentName = sMeta.parent_name || '';
      parentPhone = sMeta.parent_phone || '';
      parentZaloId = sMeta.parent_zalo_id || '';
    }
    // Check if any registered parent has linked_student_id
    const parentUser = getAllUsers().find(u => {
      if (u.role !== 'parent') return false;
      let pMeta = {};
      try { pMeta = typeof u.metadata === 'string' ? JSON.parse(u.metadata) : (u.metadata || {}); } catch {}
      return pMeta.linked_student_id === evalData.student_id || pMeta.linked_student_name === evalData.student_name;
    });
    if (parentUser) {
      linkedParentId = parentUser.id;
      if (!parentName) parentName = parentUser.name;
      if (!parentPhone) parentPhone = parentUser.phone || '';
    }
  }

  // Attendance stats aggregation
  const attStats = getAttendanceStatsForStudent(evalData.student_id);
  const attendanceRate = evalData.attendance_rate !== undefined ? Number(evalData.attendance_rate) : attStats.attendance_rate;
  const attendanceSummary = evalData.attendance_summary || `Chuyên cần: ${attendanceRate}% (${attStats.attended_sessions}/${attStats.total_sessions} buổi)`;
  const inClassAttitudeSummary = evalData.in_class_attitude_summary || (attStats.in_class_attitude_notes.slice(-2).join(' • ') || 'Thái độ học tập chuyên cần, tập trung');

  const newEval = {
    id: evalData.id || `eval_${Date.now()}`,
    student_id: evalData.student_id,
    student_name: evalData.student_name,
    teacher_id: evaluatorId,
    teacher_name: evaluatorName,
    evaluator_role: evaluatorRole,
    evaluator_alias: evaluatorAlias,
    evaluator_tag: evaluatorRole === 'lead' ? 'Giáo Viên Chính Thức' : (evaluatorRole === 'native' ? 'Giáo Viên Bản Ngữ' : 'Giáo Viên Hỗ Trợ'),
    grade_level: evalData.grade_level || 'Lớp 7',
    listening_score: Number(evalData.listening_score) || 0,
    reading_score: Number(evalData.reading_score) || 0,
    writing_score: Number(evalData.writing_score) || 0,
    speaking_score: Number(evalData.speaking_score) || 0,
    grammar_vocab_score: Number(evalData.grammar_vocab_score) || 0,
    primary_aptitude: aptitudeInfo.type,
    aptitude_description: evalData.aptitude_description || aptitudeInfo.description,
    strengths: evalData.strengths || '',
    weaknesses: evalData.weaknesses || '',
    teacher_feedback: evalData.teacher_feedback || '',
    teacher_direct_feedback: evalData.teacher_direct_feedback || evalData.teacher_feedback || 'Giáo viên bộ môn đánh giá tiến độ bài tập và khả năng tương tác tích cực.',
    leader_codung_feedback: evalData.leader_codung_feedback || (evaluatorRole === 'lead' ? (evalData.teacher_feedback || '') : 'Cô Dung duyệt lộ trình: Tiếp tục phát huy năng lực phản xạ, bổ trợ đề luyện thi định kỳ.'),
    attendance_rate: attendanceRate,
    attendance_summary: attendanceSummary,
    in_class_attitude_summary: inClassAttitudeSummary,
    action_plan: evalData.action_plan || '',
    recommended_materials: evalData.recommended_materials || '',
    parent_name: parentName,
    parent_phone: parentPhone,
    parent_zalo_id: parentZaloId,
    linked_parent_id: linkedParentId,
    report_status: evalData.report_status || 'ready_to_send',
    created_at: evalData.created_at || new Date().toISOString(),
    updated_at: new Date().toISOString()
  };

  const existingIdx = evals.findIndex(e => e.id === newEval.id);
  const before = existingIdx >= 0 ? evals[existingIdx] : null;

  if (existingIdx >= 0) {
    evals[existingIdx] = newEval;
  } else {
    evals.unshift(newEval);
  }
  saveAllEvaluations(evals);

  logSnapshot(existingIdx >= 0 ? 'UPDATE_STUDENT_EVALUATION' : 'CREATE_STUDENT_EVALUATION', 'student_evaluation', newEval.id, before, newEval);
  return newEval;
}

export function formatParentReportCard(evaluation) {
  const dateStr = new Date(evaluation.created_at).toLocaleDateString('vi-VN');
  const avg = ((evaluation.listening_score + evaluation.reading_score + evaluation.writing_score + evaluation.speaking_score + evaluation.grammar_vocab_score) / 5).toFixed(1);

  return `📊 TIẾNG ANH CÔ DUNG - PHIẾU BÁO CÁO TIẾN ĐỘ & NĂNG LỰC HỌC VIÊN
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
👤 Học sinh: ${evaluation.student_name} (${evaluation.grade_level})
👩‍🏫 Phụ trách chuyên môn: Cô Dung Leader & ${evaluation.teacher_name}
📅 Ngày đánh giá: ${dateStr}
🏫 Phụ huynh liên kết: ${evaluation.parent_name || 'Gia đình'} (${evaluation.parent_phone || 'Chưa cập nhật'})

⏱️ CHUYÊN CẦN & SỔ ĐẦU BÀI TỨC THỜI:
• Điểm danh & Chuyên cần: ${evaluation.attendance_summary || '100% chuyên cần (12/12 buổi)'}
• Thái độ học tập từng buổi (Sổ đầu bài): ${evaluation.in_class_attitude_summary || 'Hăng hái phát biểu, chuẩn bị bài tốt, tương tác phản xạ tự nhiên'}

🎯 KẾT QUẢ ĐIỂM SỐ KỸ NĂNG:
• Kỹ năng Nghe (Listening): ${evaluation.listening_score}/10
• Kỹ năng Đọc (Reading): ${evaluation.reading_score}/10
• Kỹ năng Viết (Writing): ${evaluation.writing_score}/10
• Kỹ năng Nói (Speaking): ${evaluation.speaking_score}/10
• Ngữ pháp & Từ vựng (Grammar & Vocab): ${evaluation.grammar_vocab_score}/10
➡️ Điểm trung bình toàn diện: ${avg}/10

🌟 THIÊN HƯỚNG NĂNG KHIẾU NỔI BẬT:
${evaluation.aptitude_description}

💪 ĐIỂM MẠNH:
${evaluation.strengths}

⚠️ KHÍA CẠNH CẦN KHẮC PHỤC:
${evaluation.weaknesses}

👩‍🏫 NHẬN XÉT TRỰC TIẾP TỪ GIÁO VIÊN PHỤ TRÁCH:
${evaluation.teacher_direct_feedback || evaluation.teacher_feedback}

👑 CHỈ ĐẠO & ĐỊNH HƯỚNG TỪ CÔ DUNG LEADER:
${evaluation.leader_codung_feedback || 'Cô Dung duyệt kế hoạch: Tiếp tục phát huy thế mạnh giao tiếp phản xạ, bổ trợ chuyên sâu đề kiểm tra 15p & 45p.'}

🚀 KẾ HOẠCH HÀNH ĐỘNG CỤ THỂ (DÀNH CHO PHỤ HUYNH & HỌC SINH):
${evaluation.action_plan}

📚 TÀI LIỆU KHUYẾN NGHỊ:
${evaluation.recommended_materials}

💬 THẢO LUẬN & PHẢN BIỆN ĐÁNH GIÁ:
Học sinh và phụ huynh có thể vào hệ thống để trao đổi, phản biện hoặc đặt câu hỏi trực tiếp cho Cô Dung và các thầy cô!
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Học Viện Tiếng Anh Cô Dung • Đào Tạo K12 & Khảo Thí Quốc Tế 2026`;
}

// 4. Curricula & Exams
export function getCurricula() {
  return [...curriculaData];
}

export function getExams({ curriculumId, formatType, grade } = {}) {
  let list = [...examsData];
  if (curriculumId && curriculumId !== 'all') {
    list = list.filter(e => e.curriculum_id === curriculumId);
  }
  if (formatType && formatType !== 'all') {
    list = list.filter(e => e.format_type === formatType);
  }
  if (grade && Number(grade) > 0) {
    list = list.filter(e => e.grade === Number(grade));
  }
  return list;
}

export function getExamById(id) {
  return examsData.find(e => e.id === id) || examsData[0];
}

export function getQuestionsByExam(examId) {
  return questionsData.filter(q => q.exam_id === examId).sort((a, b) => a.question_index - b.question_index);
}

// 5. Exam Attempts & Scoring
export function getAllExamAttempts() {
  if (typeof window === 'undefined') return [];
  try {
    const stored = localStorage.getItem(STORAGE_KEY_EXAM_ATTEMPTS);
    if (stored) return JSON.parse(stored);
  } catch {}
  return [];
}

export function saveExamAttempt(attempt) {
  const attempts = getAllExamAttempts();
  const newAttempt = {
    id: attempt.id || `att_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
    user_id: attempt.user_id,
    user_name: attempt.user_name || attempt.student_name || '',
    user_email: attempt.user_email || '',
    exam_id: attempt.exam_id,
    exam_title: attempt.exam_title,
    score: Number(attempt.score) || 0,
    max_score: Number(attempt.max_score) || 10,
    percentage: Math.round(((Number(attempt.score) || 0) / (Number(attempt.max_score) || 10)) * 100),
    answers: attempt.answers || {},
    duration_seconds: attempt.duration_seconds || 0,
    session_id: attempt.session_id || '',
    class_id: attempt.class_id || '',
    created_at: attempt.created_at || new Date().toISOString()
  };
  attempts.unshift(newAttempt);
  if (typeof window !== 'undefined') {
    localStorage.setItem(STORAGE_KEY_EXAM_ATTEMPTS, JSON.stringify(attempts));
  }

  // Bonus star rewards on high score
  if (newAttempt.user_id && newAttempt.score >= 7.0) {
    const starsReward = newAttempt.score >= 9.0 ? 20 : (newAttempt.score >= 8.0 ? 15 : 10);
    const currentStars = getStudentStars(newAttempt.user_id);
    saveStudentStars({
      ...currentStars,
      student_id: newAttempt.user_id,
      student_name: newAttempt.user_name || currentStars.student_name,
      stars_balance: (currentStars.stars_balance || 0) + starsReward,
      total_earned_stars: (currentStars.total_earned_stars || 0) + starsReward
    });
  }

  logSnapshot('SUBMIT_EXAM_ATTEMPT', 'exam_attempt', newAttempt.id, null, newAttempt);

  addLeaderNotification({
    type: 'test_completed',
    priority: newAttempt.score >= 8.0 ? 'normal' : (newAttempt.score < 5.0 ? 'high' : 'normal'),
    title: `📝 Bài thi hoàn thành: ${newAttempt.user_name || 'Học sinh'}`,
    message: `Học sinh ${newAttempt.user_name} vừa nộp bài "${newAttempt.exam_title || 'Bài kiểm tra'}" - Đạt ${newAttempt.score}/${newAttempt.max_score} điểm (${newAttempt.percentage}%).`,
    link_url: '/evaluations',
    action_type: 'view_test',
    meta: {
      studentId: newAttempt.user_id,
      studentName: newAttempt.user_name,
      score: newAttempt.score,
      maxScore: newAttempt.max_score,
      examTitle: newAttempt.exam_title
    }
  });

  return newAttempt;
}

export function saveBatchExamAttempts(sessionId, classId, examId, examTitle, studentScores, teacherUser = null) {
  const savedList = [];
  for (const s of studentScores) {
    const saved = saveExamAttempt({
      user_id: s.student_id,
      user_name: s.student_name,
      user_email: s.student_email || '',
      exam_id: examId,
      exam_title: examTitle,
      score: Number(s.score) || 0,
      max_score: Number(s.max_score) || 10,
      answers: s.answers || { note: s.note || 'Giáo viên chấm điểm trực tiếp tại lớp' },
      duration_seconds: s.duration_seconds || 900,
      session_id: sessionId,
      class_id: classId
    });
    savedList.push(saved);
  }

  // Dispatch bot alert on batch score graded
  dispatchBotReport('BATCH_EXAM_SCORED', {
    session_id: sessionId,
    exam_title: examTitle,
    total_graded: studentScores.length,
    teacher: teacherUser?.name || 'Giáo viên Tiếng Anh Cô Dung',
    average_score: (studentScores.reduce((acc, cur) => acc + (Number(cur.score) || 0), 0) / (studentScores.length || 1)).toFixed(1)
  });

  return savedList;
}

// 6. Fast Interpolation Search & Pedagogy Resources
export function searchPedagogyResources(keyword = '') {
  let list = [...pedagogyData];
  if (!keyword || !keyword.trim()) return list;

  const q = keyword.trim().toLowerCase();
  return list.filter(r => {
    return (
      r.title.toLowerCase().includes(q) ||
      (r.keywords && r.keywords.toLowerCase().includes(q)) ||
      r.content_markdown.toLowerCase().includes(q) ||
      (r.native_teacher_tips && r.native_teacher_tips.toLowerCase().includes(q))
    );
  });
}

export function searchCambridgeVocabulary(keyword = '', level = 'all') {
  let list = [...cambridgeVocabData];
  if (level && level !== 'all') {
    list = list.filter(v => v.cefr_level === level || v.cambridge_tier === level);
  }
  if (!keyword || !keyword.trim()) return list;

  const q = keyword.trim().toLowerCase();
  return list.filter(v => {
    return (
      v.word.toLowerCase().includes(q) ||
      v.meaning_vi.toLowerCase().includes(q) ||
      (v.collocations && v.collocations.toLowerCase().includes(q)) ||
      (v.example_en && v.example_en.toLowerCase().includes(q))
    );
  });
}

// 7. Audit Snapshots
export function getAllSnapshots() {
  if (typeof window === 'undefined') return [...snapshotsData];
  try {
    const stored = localStorage.getItem(STORAGE_KEY_SNAPSHOTS);
    if (stored) return JSON.parse(stored);
  } catch {}
  return [...snapshotsData];
}

export function logSnapshot(action, entityType, entityId, beforeData, afterData) {
  const snapshots = getAllSnapshots();
  const currentUser = getCurrentUser();
  const newSnapshot = {
    id: `snap_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
    actor_email: currentUser ? currentUser.email : 'system@timbk.io.vn',
    actor_role: currentUser ? currentUser.role : 'system',
    action,
    entity_type: entityType,
    entity_id: entityId,
    data_before: beforeData ? JSON.stringify(beforeData) : null,
    data_after: afterData ? JSON.stringify(afterData) : null,
    ip_address: '127.0.0.1 (WebEdge)',
    created_at: new Date().toISOString()
  };
  snapshots.unshift(newSnapshot);
  if (typeof window !== 'undefined') {
    localStorage.setItem(STORAGE_KEY_SNAPSHOTS, JSON.stringify(snapshots.slice(0, 100)));
  }
  return newSnapshot;
}

// 8. Webhooks & Bot Notifications
export function getAllWebhooks() {
  if (typeof window === 'undefined') return [...webhooksData];
  try {
    const stored = localStorage.getItem(STORAGE_KEY_WEBHOOKS);
    if (stored) return JSON.parse(stored);
  } catch {}
  return [...webhooksData];
}

export function saveWebhook(webhook) {
  const webhooks = getAllWebhooks();
  const newWebhook = {
    id: webhook.id || `wh_${Date.now()}`,
    name: webhook.name.trim(),
    url: webhook.url.trim(),
    secret: webhook.secret || 'wh_sec_' + Date.now(),
    event_types: webhook.event_types || 'student_evaluated, test_submitted, daily_report',
    is_active: webhook.is_active !== undefined ? webhook.is_active : 1,
    last_status: 200,
    last_triggered_at: new Date().toISOString(),
    created_at: webhook.created_at || new Date().toISOString()
  };

  const existingIdx = webhooks.findIndex(w => w.id === newWebhook.id);
  if (existingIdx >= 0) {
    webhooks[existingIdx] = newWebhook;
  } else {
    webhooks.push(newWebhook);
  }

  if (typeof window !== 'undefined') {
    localStorage.setItem(STORAGE_KEY_WEBHOOKS, JSON.stringify(webhooks));
  }
  logSnapshot('CONFIG_WEBHOOK', 'webhook', newWebhook.id, null, newWebhook);
  return newWebhook;
}

export async function dispatchBotReport(eventType, payload) {
  const webhooks = getAllWebhooks().filter(w => w.is_active);
  const results = [];

  for (const wh of webhooks) {
    const packet = {
      event: eventType,
      timestamp: new Date().toISOString(),
      webhook_id: wh.id,
      data: payload
    };

    try {
      if (typeof window !== 'undefined' && wh.url.startsWith('http')) {
        // Fire and forget or simulate
        console.log(`[Bot Webhook] Dispatched event ${eventType} to ${wh.url}:`, packet);
      }
      results.push({ webhook: wh.name, status: 'success', sent_at: new Date().toISOString() });
    } catch (err) {
      results.push({ webhook: wh.name, status: 'error', error: err.message });
    }
  }

  logSnapshot('BOT_WEBHOOK_DISPATCHED', 'webhook', eventType, null, { eventType, resultsCount: results.length });
  return results;
}

// 9. Reward Star & Tuition Fee Billing Engine (SUPERADMIN ONLY)
export const REWARD_RATE = {
  STARS_PER_1000_VND: 100, // 100 stars = 1.000 VND -> 1 star = 10 VND
  VND_PER_STAR: 10
};

export const TUITION_TEMPLATES = [
  {
    id: 1,
    key: 'sprout_mint',
    name: 'Mầm Xanh Tươi Sáng (Cute Sprout & Mint)',
    accentColor: 'emerald',
    badge: 'Mầm Non & Tiểu Học',
    headerBg: 'bg-emerald-600',
    borderColor: 'border-emerald-400',
    tagColor: 'bg-emerald-100 text-emerald-800'
  },
  {
    id: 2,
    key: 'emerald_academic',
    name: 'Ngôi Sao Tri Thức (Emerald Academic)',
    accentColor: 'teal',
    badge: 'Học Thuật THCS',
    headerBg: 'bg-teal-700',
    borderColor: 'border-teal-500',
    tagColor: 'bg-teal-100 text-teal-800'
  },
  {
    id: 3,
    key: 'modern_mint',
    name: 'Chiến Binh IELTS / Cambridge (Modern Mint)',
    accentColor: 'cyan',
    badge: 'IELTS & THPT QG',
    headerBg: 'bg-slate-900',
    borderColor: 'border-cyan-500',
    tagColor: 'bg-cyan-100 text-cyan-800'
  },
  {
    id: 4,
    key: 'playful_pastel',
    name: 'Khu Vườn Cầu Vồng (Playful Pastel Garden)',
    accentColor: 'green',
    badge: 'Dễ Thương & Trẻ Trung',
    headerBg: 'bg-green-500',
    borderColor: 'border-green-300',
    tagColor: 'bg-green-100 text-green-800'
  },
  {
    id: 5,
    key: 'forest_gold',
    name: 'Bảng Vàng Danh Dự & Học Phí (Honor Forest Gold)',
    accentColor: 'amber',
    badge: 'Vinh Danh Xuất Sắc',
    headerBg: 'bg-emerald-900',
    borderColor: 'border-amber-400',
    tagColor: 'bg-amber-100 text-amber-900'
  }
];

export function getStudentStars(studentId) {
  if (typeof window === 'undefined') {
    return studentStarsData.find(s => s.student_id === studentId) || { student_id: studentId, stars_balance: 5000, total_earned_stars: 8000, stars_redeemed: 3000 };
  }
  try {
    const list = JSON.parse(localStorage.getItem(STORAGE_KEY_STARS) || 'null');
    if (list) {
      const found = list.find(s => s.student_id === studentId);
      if (found) return found;
    }
  } catch {}
  return studentStarsData.find(s => s.student_id === studentId) || { student_id: studentId, stars_balance: 5000, total_earned_stars: 8000, stars_redeemed: 3000 };
}

export function saveStudentStars(starsObj) {
  if (typeof window === 'undefined') return;
  try {
    let list = JSON.parse(localStorage.getItem(STORAGE_KEY_STARS) || 'null') || [...studentStarsData];
    const idx = list.findIndex(s => s.student_id === starsObj.student_id);
    if (idx >= 0) list[idx] = starsObj;
    else list.push(starsObj);
    localStorage.setItem(STORAGE_KEY_STARS, JSON.stringify(list));
  } catch {}
}

export function getAllTuitionBills() {
  if (typeof window === 'undefined') return [...tuitionBillsData];
  try {
    const stored = localStorage.getItem(STORAGE_KEY_BILLS);
    if (stored) return JSON.parse(stored);
  } catch {}
  return [...tuitionBillsData];
}

export function saveTuitionBill(bill) {
  const bills = getAllTuitionBills();
  const starsDeducted = Number(bill.stars_deducted) || 0;
  // 100 stars = 1.000 VND
  const discountVnd = Math.floor(starsDeducted / 100) * 1000;
  const baseTuition = Number(bill.base_tuition_vnd) || 0;
  const finalAmount = Math.max(0, baseTuition - discountVnd);

  const bankAcc = bill.bank_account || '0901234567';
  const holder = bill.account_holder || 'NGUYEN MINH VU';
  const qrUrl = `https://img.vietqr.io/image/970422-${bankAcc}-compact2.png?amount=${finalAmount}&addInfo=HP_${bill.student_id}_T10&accountName=${encodeURIComponent(holder)}`;

  const newBill = {
    id: bill.id || `bill_${Date.now()}`,
    student_id: bill.student_id,
    student_name: bill.student_name,
    age: Number(bill.age) || 13,
    grade_level: bill.grade_level || 'Lớp 7',
    program_name: bill.program_name || 'Tiếng Anh K12 Toàn Diện',
    billing_period: bill.billing_period || 'Tháng 10/2026',
    base_tuition_vnd: baseTuition,
    attendance_total_sessions: Number(bill.attendance_total_sessions) || 12,
    attendance_attended_sessions: Number(bill.attendance_attended_sessions) || 12,
    attendance_rate: Math.round(((Number(bill.attendance_attended_sessions) || 12) / (Number(bill.attendance_total_sessions) || 12)) * 100),
    stars_available: Number(bill.stars_available) || 0,
    stars_deducted: starsDeducted,
    discount_vnd: discountVnd,
    final_amount_vnd: finalAmount,
    template_id: Number(bill.template_id) || 1,
    bank_name: bill.bank_name || 'MBBank (Ngân Hàng Quân Đội)',
    bank_account: bankAcc,
    account_holder: holder,
    vietqr_url: qrUrl,
    growth_status: bill.growth_status || 'breakthrough_growth',
    growth_percentage: Number(bill.growth_percentage) || 15,
    growth_notes: bill.growth_notes || 'Tăng trưởng tốt so với kỳ trước',
    eval_listening: Number(bill.eval_listening) || 8.0,
    eval_reading: Number(bill.eval_reading) || 8.0,
    eval_writing: Number(bill.eval_writing) || 8.0,
    eval_speaking: Number(bill.eval_speaking) || 8.0,
    eval_grammar: Number(bill.eval_grammar) || 8.0,
    test_score_15m: Number(bill.test_score_15m) || 8.5,
    test_score_45m: Number(bill.test_score_45m) || 9.0,
    superadmin_notes: bill.superadmin_notes || '',
    status: bill.status || 'approved_by_superadmin',
    parent_name: bill.parent_name || '',
    parent_phone: bill.parent_phone || '',
    parent_zalo_id: bill.parent_zalo_id || '',
    created_at: bill.created_at || new Date().toISOString(),
    updated_at: new Date().toISOString()
  };

  const existingIdx = bills.findIndex(b => b.id === newBill.id);
  const before = existingIdx >= 0 ? bills[existingIdx] : null;

  if (existingIdx >= 0) bills[existingIdx] = newBill;
  else bills.unshift(newBill);

  if (typeof window !== 'undefined') {
    localStorage.setItem(STORAGE_KEY_BILLS, JSON.stringify(bills));
  }

  // Deduct stars from student profile if new bill
  if (starsDeducted > 0) {
    const curStars = getStudentStars(newBill.student_id);
    curStars.stars_balance = Math.max(0, curStars.stars_balance - starsDeducted);
    curStars.stars_redeemed = (curStars.stars_redeemed || 0) + starsDeducted;
    saveStudentStars(curStars);
  }

  logSnapshot(existingIdx >= 0 ? 'UPDATE_TUITION_BILL' : 'CREATE_TUITION_BILL', 'tuition_bill', newBill.id, before, newBill);
  return newBill;
}

export function exportTuitionToCSV() {
  const bills = getAllTuitionBills();
  const headers = ['Mã HĐ', 'Học Sinh', 'Tuổi', 'Lớp', 'Chương Trình', 'Kỳ Thu', 'Học Phí Gốc', 'Sao Đổi', 'Giảm Giá', 'Thực Thu', 'Chuyên Cần', 'Tăng Trưởng %', 'Trạng Thái'];
  const rows = bills.map(b => [
    b.id,
    `"${b.student_name}"`,
    b.age,
    `"${b.grade_level}"`,
    `"${b.program_name}"`,
    `"${b.billing_period}"`,
    b.base_tuition_vnd,
    b.stars_deducted,
    b.discount_vnd,
    b.final_amount_vnd,
    `"${b.attendance_attended_sessions}/${b.attendance_total_sessions}"`,
    `"+${b.growth_percentage}%"`,
    `"${b.status}"`
  ]);

  return [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
}

// =========================================================================
// 8. PROFILE MANAGEMENT & POPULAR SCHOOLS
// =========================================================================
export const POPULAR_SCHOOLS = [
  { name: 'Tiểu Học Vinschool (Hà Nội / TP.HCM)', gradeLevel: 'Tiểu Học' },
  { name: 'Tiểu Học Chu Văn An (Hà Nội)', gradeLevel: 'Tiểu Học' },
  { name: 'Tiểu Học Đoàn Thị Điểm (Hà Nội)', gradeLevel: 'Tiểu Học' },
  { name: 'Tiểu Học Kim Đồng (Hà Nội)', gradeLevel: 'Tiểu Học' },
  { name: 'Tiểu Học Nguyễn Bỉnh Khiêm (TP.HCM)', gradeLevel: 'Tiểu Học' },
  { name: 'THCS Giảng Võ (Hà Nội)', gradeLevel: 'THCS' },
  { name: 'THCS Cầu Giấy (Hà Nội)', gradeLevel: 'THCS' },
  { name: 'THCS Archimedes Academy (Hà Nội)', gradeLevel: 'THCS' },
  { name: 'THCS Nguyễn Siêu (Hà Nội)', gradeLevel: 'THCS' },
  { name: 'THCS Lê Quý Đôn (TP.HCM)', gradeLevel: 'THCS' },
  { name: 'THCS Trần Đại Nghĩa (TP.HCM)', gradeLevel: 'THCS' },
  { name: 'THPT Chuyên Hà Nội - Amsterdam', gradeLevel: 'THPT' },
  { name: 'THPT Chuyên Ngoại Ngữ - ĐHQGHN', gradeLevel: 'THPT' },
  { name: 'THPT Chuyên Sư Phạm Hà Nội', gradeLevel: 'THPT' },
  { name: 'THPT Chu Văn An (Hà Nội)', gradeLevel: 'THPT' },
  { name: 'THPT Kim Liên (Hà Nội)', gradeLevel: 'THPT' },
  { name: 'THPT Yên Hòa (Hà Nội)', gradeLevel: 'THPT' },
  { name: 'THPT Chuyên Lê Hồng Phong (TP.HCM)', gradeLevel: 'THPT' },
  { name: 'THPT Marie Curie (TP.HCM)', gradeLevel: 'THPT' },
  { name: 'Đại Học Ngoại Thương (FTU)', gradeLevel: 'Đại Học' },
  { name: 'Đại Học Kinh Tế Quốc Dân (NEU)', gradeLevel: 'Đại Học' },
  { name: 'Đại Học Bách Khoa Hà Nội (HUST)', gradeLevel: 'Đại Học' },
  { name: 'Đại Học Quốc Gia (Hà Nội / TP.HCM)', gradeLevel: 'Đại Học' }
];

export function updateUserProfile(userId, updates) {
  const users = getAllUsers();
  const idx = users.findIndex(u => u.id === userId || u.username === userId);
  if (idx < 0) return { success: false, error: 'Không tìm thấy người dùng!' };

  const current = users[idx];
  let meta = {};
  try {
    meta = typeof current.metadata === 'string' ? JSON.parse(current.metadata) : (current.metadata || {});
  } catch {}

  const newMeta = {
    ...meta,
    grade: updates.grade !== undefined ? updates.grade : meta.grade,
    school: updates.school !== undefined ? updates.school : meta.school,
    target: updates.target !== undefined ? updates.target : meta.target,
    zalo_id: updates.zalo_id !== undefined ? updates.zalo_id : meta.zalo_id,
    zalo_phone: updates.zalo_phone !== undefined ? updates.zalo_phone : meta.zalo_phone,
    parent_name: updates.parent_name !== undefined ? updates.parent_name : meta.parent_name,
    parent_phone: updates.parent_phone !== undefined ? updates.parent_phone : meta.parent_phone,
    linked_student_id: updates.linked_student_id !== undefined ? updates.linked_student_id : meta.linked_student_id,
    linked_student_name: updates.linked_student_name !== undefined ? updates.linked_student_name : meta.linked_student_name
  };

  const updatedUser = {
    ...current,
    name: updates.name ? updates.name.trim() : current.name,
    phone: updates.phone ? updates.phone.trim() : current.phone,
    email: updates.email ? updates.email.trim() : current.email,
    avatar: updates.avatar || current.avatar,
    metadata: JSON.stringify(newMeta),
    updated_at: new Date().toISOString()
  };

  users[idx] = updatedUser;
  saveAllUsers(users);

  // If this is active user, sync currentUser
  const active = getCurrentUser();
  if (active && (active.id === userId || active.username === userId)) {
    setCurrentUser(updatedUser);
  }

  logSnapshot('UPDATE_USER_PROFILE', 'user', updatedUser.id, current, updatedUser);
  return { success: true, user: updatedUser };
}

// =========================================================================
// 9. PARENT TEST RECORDS & SMART OCR SIMULATOR
// =========================================================================
export const STORAGE_KEY_PARENT_TEST_RECORDS = 'tienganh_parent_test_records_v2';

const SEED_PARENT_TEST_RECORDS = [
  {
    id: 'ptr_1',
    student_id: 'usr_student_primary',
    student_name: 'Đỗ Bảo Nhi (Lớp 1)',
    test_name: 'Khảo Sát Giữa Kỳ 1 - Phát Âm Phonics & Màu Sắc',
    test_type: 'midterm_test',
    score: 9.5,
    max_score: 10,
    test_date: '2026-09-18',
    teacher_feedback: 'Bảo Nhi phát âm các âm /s/ và /k/ rất tròn vành rõ chữ, làm bài cẩn thận đạt điểm tối đa.',
    ocr_status: 'ocr_verified',
    ocr_raw_text: 'Trường Tiểu Học Vinschool - Bài Kiểm Tra Giữa Kỳ I - Môn: Tiếng Anh. Điểm: 9.5/10. Lời phê: Con phát âm rất tốt, tự tin.',
    image_url: 'https://images.unsplash.com/photo-1580582932707-520aed937b7b?w=400',
    created_at: '2026-09-18T08:30:00.000Z'
  },
  {
    id: 'ptr_2',
    student_id: 'usr_student_1',
    student_name: 'Lê Bảo Anh',
    test_name: 'Đề Thi 1 Tiết 45 Phút - Khảo Sát Chuyên Đề Mệnh Đề Quan Hệ',
    test_type: 'standard_45m',
    score: 9.0,
    max_score: 10,
    test_date: '2026-09-20',
    teacher_feedback: 'Nắm chắc đại từ quan hệ which/who/whose. Cần chú ý dấu phẩy trong mệnh đề không xác định.',
    ocr_status: 'ocr_verified',
    ocr_raw_text: 'THPT Chu Văn An - Bài Khảo Sát 45 Phút. Học sinh: Lê Bảo Anh. Điểm số: 9.0/10. Giáo viên chấm: Cô Nguyễn Hương.',
    image_url: 'https://images.unsplash.com/photo-1546410531-bb4caa6b424d?w=400',
    created_at: '2026-09-20T10:15:00.000Z'
  }
];

export function getParentTestRecords(studentId = null) {
  if (typeof window === 'undefined') {
    return studentId ? SEED_PARENT_TEST_RECORDS.filter(r => r.student_id === studentId) : [...SEED_PARENT_TEST_RECORDS];
  }
  try {
    const raw = localStorage.getItem(STORAGE_KEY_PARENT_TEST_RECORDS);
    let list = raw ? JSON.parse(raw) : [...SEED_PARENT_TEST_RECORDS];
    if (studentId) {
      return list.filter(r => r.student_id === studentId);
    }
    return list;
  } catch {
    return [...SEED_PARENT_TEST_RECORDS];
  }
}

export function saveParentTestRecord(record) {
  const records = getParentTestRecords();
  const newRecord = {
    id: record.id || `ptr_${Date.now()}`,
    student_id: record.student_id,
    student_name: record.student_name,
    test_name: record.test_name || 'Bài Kiểm Tra Định Kỳ',
    test_type: record.test_type || 'quick_test',
    score: Number(record.score) || 0,
    max_score: Number(record.max_score) || 10,
    test_date: record.test_date || new Date().toISOString().split('T')[0],
    teacher_feedback: record.teacher_feedback || '',
    ocr_status: record.ocr_status || 'manual_entry',
    ocr_raw_text: record.ocr_raw_text || '',
    image_url: record.image_url || '',
    created_at: record.created_at || new Date().toISOString(),
    updated_at: new Date().toISOString()
  };

  const existingIdx = records.findIndex(r => r.id === newRecord.id);
  if (existingIdx >= 0) {
    records[existingIdx] = newRecord;
  } else {
    records.unshift(newRecord);
  }

  if (typeof window !== 'undefined') {
    localStorage.setItem(STORAGE_KEY_PARENT_TEST_RECORDS, JSON.stringify(records));
    window.dispatchEvent(new CustomEvent('tienganh:parent-records-change', { detail: newRecord }));
  }

  logSnapshot('SAVE_PARENT_TEST_RECORD', 'parent_test_record', newRecord.id, null, newRecord);
  return newRecord;
}

export function deleteParentTestRecord(recordId) {
  const records = getParentTestRecords().filter(r => r.id !== recordId);
  if (typeof window !== 'undefined') {
    localStorage.setItem(STORAGE_KEY_PARENT_TEST_RECORDS, JSON.stringify(records));
    window.dispatchEvent(new CustomEvent('tienganh:parent-records-change', { detail: null }));
  }
  return true;
}

export async function simulateOcrFromImage(fileOrDataUrl) {
  return new Promise((resolve) => {
    setTimeout(() => {
      const sampleScores = [9.5, 9.0, 8.5, 10, 8.0, 9.2];
      const randomScore = sampleScores[Math.floor(Math.random() * sampleScores.length)];
      const sampleNames = [
        'Bài Kiểm Tra 15 Phút - Unit 3: Community Service',
        'Đề Thi 1 Tiết 45 Phút - Giữa Học Kỳ 1',
        'Phiếu Khảo Sát Từ Vựng & Nghe Cambridge',
        'Bài Đánh Giá Phonics & Giao Tiếp Định Kỳ'
      ];
      const randomTitle = sampleNames[Math.floor(Math.random() * sampleNames.length)];
      const sampleFeedbacks = [
        'Làm bài cẩn thận, từ vựng phong phú, nắm vững thì hiện tại hoàn thành.',
        'Phát âm tròn vành, tự tin khi thuyết trình, ngữ pháp chính xác.',
        'Bài làm rất tốt, chữ viết rõ ràng, phân tích câu chuẩn xác.',
        'Kỹ năng đọc hiểu tiến bộ vượt bậc, hoàn thành 100% câu trắc nghiệm.'
      ];
      const randomFeedback = sampleFeedbacks[Math.floor(Math.random() * sampleFeedbacks.length)];

      resolve({
        success: true,
        detected_score: randomScore,
        max_score: 10,
        detected_title: randomTitle,
        detected_feedback: randomFeedback,
        detected_date: new Date().toISOString().split('T')[0],
        raw_ocr_text: `[OCR SCAN RESULT]\nBỘ GIÁO DỤC VÀ ĐÀO TẠO\nBÀI KIỂM TRA ĐỊNH KỲ TIẾNG ANH\nĐiểm: ${randomScore} / 10\nLời phê của giáo viên: ${randomFeedback}\nNgày kiểm tra: ${new Date().toLocaleDateString('vi-VN')}`
      });
    }, 1200);
  });
}

// =========================================================================
// 10. MULTI-TEACHER ASSIGNMENT & ROLES
// =========================================================================
export const TEACHER_ROLES = [
  { id: 'lead', name: 'Giáo Viên Chính Thức (Lead Teacher)', icon: '👑', alias: 'GV_CHINH' },
  { id: 'native', name: 'Giáo Viên Bản Ngữ (Native Trainer)', icon: '🗣️', alias: 'GV_BANNGU' },
  { id: 'assistant', name: 'Giáo Viên Hỗ Trợ / Trợ Giảng', icon: '🤝', alias: 'TROGIANG' }
];

export function getAssignedTeachersForStudent(student) {
  if (!student) return [];
  let meta = {};
  try {
    meta = typeof student.metadata === 'string' ? JSON.parse(student.metadata) : (student.metadata || {});
  } catch {}

  if (meta.assigned_teachers && Array.isArray(meta.assigned_teachers) && meta.assigned_teachers.length > 0) {
    return meta.assigned_teachers;
  }

  // Default multi-teacher assignment if not explicitly specified:
  // 1 Lead (Ms. Dung), 1 Native (Mr. John), 1 Assistant (Cô Nguyễn Hương)
  return [
    {
      teacher_id: 'usr_super_2',
      teacher_name: 'Ms. Dung',
      teacher_role: 'lead',
      role_title: 'Giáo Viên Chính Thức (Lead)',
      alias: '[GV_CHINH_CODUNG]',
      assigned_at: student.created_at || '2026-09-25'
    },
    {
      teacher_id: 'usr_teach_1',
      teacher_name: 'Mr. Johnathan Miller',
      teacher_role: 'native',
      role_title: 'Giáo Viên Bản Ngữ (Native Trainer)',
      alias: '[GV_BANNGU_JOHN]',
      assigned_at: student.created_at || '2026-09-25'
    },
    {
      teacher_id: 'usr_teach_2',
      teacher_name: 'Cô Nguyễn Hương',
      teacher_role: 'assistant',
      role_title: 'Giáo Viên Hỗ Trợ / Trợ Giảng',
      alias: '[TROGIANG_HUONG]',
      assigned_at: student.created_at || '2026-09-25'
    }
  ];
}

export function assignTeachersToStudent(studentId, assignments) {
  const users = getAllUsers();
  const idx = users.findIndex(u => u.id === studentId);
  if (idx < 0) return { success: false, error: 'Không tìm thấy học sinh!' };

  const student = users[idx];
  let meta = {};
  try {
    meta = typeof student.metadata === 'string' ? JSON.parse(student.metadata) : (student.metadata || {});
  } catch {}

  meta.assigned_teachers = assignments;
  student.metadata = JSON.stringify(meta);
  student.updated_at = new Date().toISOString();

  users[idx] = student;
  saveAllUsers(users);

  logSnapshot('ASSIGN_TEACHERS_TO_STUDENT', 'student_assignment', studentId, null, {
    student_id: studentId,
    student_name: student.name,
    assignments
  });

  return { success: true, student };
}

export function getStudentsForTeacher(teacherId, roleFilter = 'all') {
  const users = getAllUsers();
  const students = users.filter(u => u.role === 'student');

  return students.filter(st => {
    const assigned = getAssignedTeachersForStudent(st);
    if (roleFilter === 'all') {
      return assigned.some(a => a.teacher_id === teacherId);
    }
    return assigned.some(a => a.teacher_id === teacherId && a.teacher_role === roleFilter);
  });
}

// =========================================================================
// 12. Lịch Học & Thời Khóa Biểu (Class Sessions & Timetable)
// =========================================================================
export function getAllClassSessions() {
  if (typeof window === 'undefined') return [...classSessionsData];
  try {
    const stored = localStorage.getItem(STORAGE_KEY_SESSIONS);
    if (stored) return JSON.parse(stored);
  } catch {}
  return [...classSessionsData];
}

export function saveAllClassSessions(sessions) {
  if (typeof window !== 'undefined') {
    localStorage.setItem(STORAGE_KEY_SESSIONS, JSON.stringify(sessions));
  }
}

export function saveClassSession(session, user = null) {
  const sessions = getAllClassSessions();
  const operator = user || getCurrentUser();
  const newSession = {
    id: session.id || `sess_${Date.now()}`,
    class_id: session.class_id || 'L7_GLOBAL_SUCCESS_A1',
    class_name: session.class_name || 'Lớp Tiếng Anh Cô Dung',
    grade_level: session.grade_level || 'Lớp 7',
    subject_topic: session.subject_topic || 'Chuyên đề Ngữ pháp & Giao tiếp',
    teacher_id: session.teacher_id || 'usr_super_2',
    teacher_name: session.teacher_name || 'Ms. Dung',
    teacher_role: session.teacher_role || 'lead',
    assistant_teacher_id: session.assistant_teacher_id || 'usr_teach_1',
    assistant_teacher_name: session.assistant_teacher_name || 'Mr. Johnathan Miller',
    location: session.location || 'Tại nhà Cô Dung (123 Phố Vọng, Hai Bà Trưng, Hà Nội)',
    day_of_week: Number(session.day_of_week) ?? 1,
    day_name: session.day_name || 'Thứ Hai',
    start_time: session.start_time || '18:00',
    end_time: session.end_time || '19:30',
    notify_minutes_before: Number(session.notify_minutes_before) || 10,
    room_notes: session.room_notes || 'Phòng học chuẩn bị sẵn sàng',
    status: session.status || 'active',
    student_ids: session.student_ids || [],
    created_at: session.created_at || new Date().toISOString(),
    updated_at: new Date().toISOString()
  };

  const idx = sessions.findIndex(s => s.id === newSession.id);
  const before = idx >= 0 ? sessions[idx] : null;
  if (idx >= 0) sessions[idx] = newSession;
  else sessions.push(newSession);

  saveAllClassSessions(sessions);
  logSnapshot(idx >= 0 ? 'UPDATE_CLASS_SESSION' : 'CREATE_CLASS_SESSION', 'class_session', newSession.id, before, newSession);
  return newSession;
}

export function deleteClassSession(id, user = null) {
  const sessions = getAllClassSessions();
  const target = sessions.find(s => s.id === id);
  const updated = sessions.filter(s => s.id !== id);
  saveAllClassSessions(updated);
  logSnapshot('DELETE_CLASS_SESSION', 'class_session', id, target, { id });
  return true;
}

export function assignStudentsToClassSession(sessionId, studentIds) {
  const sessions = getAllClassSessions();
  const idx = sessions.findIndex(s => s.id === sessionId);
  if (idx < 0) return { success: false, error: 'Không tìm thấy buổi học!' };

  sessions[idx].student_ids = studentIds;
  sessions[idx].updated_at = new Date().toISOString();
  saveAllClassSessions(sessions);

  logSnapshot('ASSIGN_STUDENTS_TO_SESSION', 'class_session', sessionId, null, {
    session_id: sessionId,
    student_ids: studentIds
  });

  return { success: true, session: sessions[idx] };
}

export function getSessionsForUser(user) {
  const allSessions = getAllClassSessions();
  if (!user || isSuperAdmin(user)) return allSessions;

  if (user.role === 'teacher') {
    return allSessions.filter(s => s.teacher_id === user.id || s.assistant_teacher_id === user.id || s.teacher_name === user.name);
  }

  if (user.role === 'parent') {
    const linkedChild = getLinkedChildForParent(user);
    if (!linkedChild) return allSessions;
    let meta = {};
    try { meta = typeof linkedChild.metadata === 'string' ? JSON.parse(linkedChild.metadata) : (linkedChild.metadata || {}); } catch {}
    const studentClassId = meta.class_id;
    return allSessions.filter(s => (s.student_ids && s.student_ids.includes(linkedChild.id)) || (studentClassId && s.class_id === studentClassId));
  }

  if (user.role === 'student') {
    let meta = {};
    try { meta = typeof user.metadata === 'string' ? JSON.parse(user.metadata) : (user.metadata || {}); } catch {}
    const studentClassId = meta.class_id;
    return allSessions.filter(s => (s.student_ids && s.student_ids.includes(user.id)) || (studentClassId && s.class_id === studentClassId));
  }

  return allSessions;
}

// 13. Schedule Notification Reminders for Parents & Students
export async function triggerScheduleNotification(sessionId, customMinutes = null) {
  const sessions = getAllClassSessions();
  const session = sessions.find(s => s.id === sessionId);
  if (!session) return { success: false, error: 'Không tìm thấy buổi học' };

  const minutesBefore = customMinutes || session.notify_minutes_before || 10;
  
  // Calculate notification time preview
  const [startH, startM] = session.start_time.split(':').map(Number);
  const notifyTotalMin = startH * 60 + startM - minutesBefore;
  const notifyH = Math.floor(notifyTotalMin / 60);
  const notifyM = notifyTotalMin % 60;
  const notifyTimeStr = `${String(notifyH).padStart(2, '0')}:${String(notifyM).padStart(2, '0')}`;

  const messageText = `⏰ [NHẮC LỊCH HỌC TIẾNG ANH CÔ DUNG]
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Buổi học: ${session.class_name} (${session.day_name})
Chủ đề: ${session.subject_topic}
⏰ Thời gian: ${session.start_time} - ${session.end_time} (Bắt đầu sau ${minutesBefore} phút nữa - Lúc ${notifyTimeStr} thông báo phụ huynh)
📍 Địa điểm: ${session.location}
👩‍🏫 Giáo viên phụ trách: ${session.teacher_name} & ${session.assistant_teacher_name || 'Trợ giảng'}
🚗 Lưu ý phụ huynh: Bố mẹ vui lòng chuẩn bị đưa đón các con đúng giờ để lớp bắt đầu đúng tiến độ!`;

  // Dispatch Bot Report
  const dispatchResult = await dispatchBotReport('SCHEDULE_PICKUP_REMINDER', {
    session_id: session.id,
    class_name: session.class_name,
    start_time: session.start_time,
    notify_time: notifyTimeStr,
    location: session.location,
    teacher: session.teacher_name,
    message: messageText
  });

  logSnapshot('SCHEDULE_REMINDER_TRIGGERED', 'schedule_notification', session.id, null, {
    sessionId: session.id,
    notifyTime: notifyTimeStr,
    minutesBefore
  });

  return {
    success: true,
    session,
    notifyTime: notifyTimeStr,
    message: messageText,
    dispatchResult
  };
}

// =========================================================================
// 14. Điểm Danh Buổi Học & Sổ Đầu Bài Tức Thời (Attendance & Instant In-Class Log)
// =========================================================================
export function getAllAttendanceRecords() {
  if (typeof window === 'undefined') return [...attendanceRecordsData];
  try {
    const stored = localStorage.getItem(STORAGE_KEY_ATTENDANCE);
    if (stored) return JSON.parse(stored);
  } catch {}
  return [...attendanceRecordsData];
}

export function saveAllAttendanceRecords(records) {
  if (typeof window !== 'undefined') {
    localStorage.setItem(STORAGE_KEY_ATTENDANCE, JSON.stringify(records));
  }
}

export function getAttendanceForSession(sessionId, date) {
  const records = getAllAttendanceRecords();
  return records.filter(r => r.session_id === sessionId && (!date || r.session_date === date));
}

export function saveAttendanceRecord(record) {
  const records = getAllAttendanceRecords();
  const newRecord = {
    id: record.id || `att_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
    session_id: record.session_id,
    session_date: record.session_date || new Date().toISOString().slice(0, 10),
    student_id: record.student_id,
    student_name: record.student_name,
    class_id: record.class_id || '',
    status: record.status || 'present', // 'present' | 'absent_excused' | 'absent_unexcused' | 'late'
    notes: record.notes || '',
    in_class_attitude: record.in_class_attitude || 'Tập trung học tập tốt',
    instant_stars_rewarded: Number(record.instant_stars_rewarded) || 0,
    marked_by_teacher_id: record.marked_by_teacher_id || 'usr_super_2',
    marked_by_teacher_name: record.marked_by_teacher_name || 'Ms. Dung',
    created_at: record.created_at || new Date().toISOString()
  };

  const idx = records.findIndex(r => r.id === newRecord.id || (r.session_id === newRecord.session_id && r.session_date === newRecord.session_date && r.student_id === newRecord.student_id));
  if (idx >= 0) records[idx] = newRecord;
  else records.unshift(newRecord);

  saveAllAttendanceRecords(records);

  // If stars rewarded, update student star balance
  if (newRecord.instant_stars_rewarded > 0) {
    const currentStars = getStudentStars(newRecord.student_id);
    saveStudentStars({
      ...currentStars,
      stars_balance: (currentStars.stars_balance || 0) + newRecord.instant_stars_rewarded,
      total_earned_stars: (currentStars.total_earned_stars || 0) + newRecord.instant_stars_rewarded
    });
  }

  logSnapshot('SAVE_ATTENDANCE_RECORD', 'attendance_record', newRecord.id, null, newRecord);
  return newRecord;
}

export function saveSessionAttendanceBatch(sessionId, sessionDate, studentAttendanceList, teacherUser) {
  const savedRecords = [];
  for (const item of studentAttendanceList) {
    const saved = saveAttendanceRecord({
      session_id: sessionId,
      session_date: sessionDate,
      student_id: item.student_id,
      student_name: item.student_name,
      class_id: item.class_id,
      status: item.status,
      notes: item.notes,
      in_class_attitude: item.in_class_attitude,
      instant_stars_rewarded: item.instant_stars_rewarded || (item.status === 'present' ? 5 : 0),
      marked_by_teacher_id: teacherUser?.id || 'usr_super_2',
      marked_by_teacher_name: teacherUser?.name || 'Ms. Dung'
    });
    savedRecords.push(saved);
  }

  // Dispatch bot alert on attendance completed
  const presentCount = studentAttendanceList.filter(s => s.status === 'present').length;
  const absentRecords = studentAttendanceList.filter(s => s.status === 'absent');
  const session = getAllClassSessions().find(s => s.id === sessionId);
  const className = session?.class_name || 'Lớp học';
  const absentNames = absentRecords.map(r => r.student_name).join(', ');

  dispatchBotReport('ATTENDANCE_ROLL_CALL_COMPLETED', {
    session_id: sessionId,
    session_date: sessionDate,
    total_students: studentAttendanceList.length,
    present_count: presentCount,
    absent_count: absentRecords.length,
    absent_names: absentNames,
    teacher: teacherUser?.name
  });

  addLeaderNotification({
    type: 'attendance_summary',
    priority: absentRecords.length > 0 ? 'high' : 'normal',
    title: `📋 Báo cáo Điểm Danh: ${className} (${sessionDate})`,
    message: absentRecords.length === 0
      ? `Lớp "${className}" đã điểm danh ĐỦ: ${presentCount}/${studentAttendanceList.length} học viên có mặt đầy đủ.`
      : `Lớp "${className}" có ${presentCount}/${studentAttendanceList.length} có mặt. THIẾU/VẮNG ${absentRecords.length} em: ${absentNames}.`,
    link_url: '/schedule?tab=attendance',
    action_type: 'view_attendance',
    meta: {
      sessionId,
      sessionDate,
      presentCount,
      totalCount: studentAttendanceList.length,
      absentNames,
      className
    }
  });

  return savedRecords;
}

export function getAttendanceStatsForStudent(studentId) {
  const records = getAllAttendanceRecords().filter(r => r.student_id === studentId);
  if (records.length === 0) {
    return {
      total_sessions: 12,
      attended_sessions: 12,
      excused_absent: 0,
      unexcused_absent: 0,
      late_count: 0,
      attendance_rate: 100,
      in_class_attitude_notes: ['Luôn tích cực phát biểu và chuẩn bị bài chu đáo'],
      total_instant_stars: 50
    };
  }

  const total = records.length;
  const present = records.filter(r => r.status === 'present').length;
  const late = records.filter(r => r.status === 'late').length;
  const excused = records.filter(r => r.status === 'absent_excused').length;
  const unexcused = records.filter(r => r.status === 'absent_unexcused').length;
  const rate = Math.round(((present + late * 0.8) / total) * 100);
  const notes = records.map(r => r.in_class_attitude).filter(Boolean);
  const stars = records.reduce((sum, r) => sum + (r.instant_stars_rewarded || 0), 0);

  return {
    total_sessions: total,
    attended_sessions: present + late,
    excused_absent: excused,
    unexcused_absent: unexcused,
    late_count: late,
    attendance_rate: rate,
    in_class_attitude_notes: notes,
    total_instant_stars: stars
  };
}

// Helper to filter attended students for test creation
export function getAttendedStudentsForSession(sessionId, sessionDate) {
  const records = getAttendanceForSession(sessionId, sessionDate);
  const presentRecords = records.filter(r => r.status === 'present' || r.status === 'late');
  const users = getAllUsers();
  
  if (presentRecords.length === 0) {
    // If not rolled call yet, return all students assigned to session
    const session = getAllClassSessions().find(s => s.id === sessionId);
    if (!session || !session.student_ids || session.student_ids.length === 0) {
      return users.filter(u => u.role === 'student');
    }
    return users.filter(u => session.student_ids.includes(u.id));
  }

  const presentStudentIds = presentRecords.map(r => r.student_id);
  return users.filter(u => presentStudentIds.includes(u.id));
}

// =========================================================================
// 15. Thảo Luận & Phản Biện Đánh Giá (Evaluation Discussions & Rebuttals)
// =========================================================================
export function getAllEvaluationDiscussions() {
  if (typeof window === 'undefined') return [...evaluationDiscussionsData];
  try {
    const stored = localStorage.getItem(STORAGE_KEY_DISCUSSIONS);
    if (stored) return JSON.parse(stored);
  } catch {}
  return [...evaluationDiscussionsData];
}

export function saveAllEvaluationDiscussions(discussions) {
  if (typeof window !== 'undefined') {
    localStorage.setItem(STORAGE_KEY_DISCUSSIONS, JSON.stringify(discussions));
  }
}

export function getDiscussionsForEvaluation(evaluationId) {
  const all = getAllEvaluationDiscussions();
  return all.filter(d => d.evaluation_id === evaluationId);
}

export function addEvaluationComment(commentData, authorUser) {
  const discussions = getAllEvaluationDiscussions();
  const author = authorUser || getCurrentUser();
  const authorId = author?.id || commentData.author_id || 'usr_guest';
  const authorName = author?.name || commentData.author_name || 'Thành viên';
  const authorRole = author?.role || commentData.author_role || 'student';
  const authorAvatar = author?.avatar || commentData.author_avatar || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=80';

  let authorBadge = '[HOC_VIEN]';
  if (isSuperAdmin(author)) authorBadge = author.username === 'msdung' ? '[GV_CHINH_CODUNG]' : '[SUPERADMIN]';
  else if (authorRole === 'teacher') {
    if (author.username?.includes('john')) authorBadge = '[GV_BANNGU_JOHN]';
    else if (author.username?.includes('huong')) authorBadge = '[TROGIANG_HUONG]';
    else authorBadge = '[GIAO_VIEN]';
  } else if (authorRole === 'parent') authorBadge = '[PHU_HUYNH]';

  const newComment = {
    id: commentData.id || `disc_${Date.now()}`,
    evaluation_id: commentData.evaluation_id,
    author_id: authorId,
    author_name: authorName,
    author_role: authorRole,
    author_avatar: authorAvatar,
    author_badge: authorBadge,
    comment_type: commentData.comment_type || 'comment', // 'comment' | 'rebuttal' | 'inquiry' | 'leader_conclusion'
    content: commentData.content || '',
    created_at: new Date().toISOString()
  };

  discussions.push(newComment);
  saveAllEvaluationDiscussions(discussions);

  logSnapshot('ADD_EVALUATION_COMMENT', 'evaluation_discussion', newComment.id, null, newComment);

  // Bot dispatch
  dispatchBotReport('EVALUATION_COMMENT_POSTED', {
    evaluation_id: newComment.evaluation_id,
    author_name: newComment.author_name,
    author_badge: newComment.author_badge,
    content_snippet: newComment.content.substring(0, 100)
  });

  return newComment;
}

export function deleteEvaluationComment(commentId) {
  const discussions = getAllEvaluationDiscussions().filter(d => d.id !== commentId);
  saveAllEvaluationDiscussions(discussions);
  logSnapshot('DELETE_EVALUATION_COMMENT', 'evaluation_discussion', commentId, null, { commentId });
  return true;
}

// =========================================================================
// 16. Phân Quyền Giáo Viên Từ Leader, Lương & Đánh Giá/Nhắc Nhở Riêng
// =========================================================================
export const TEACHER_ROLE_TYPES = [
  { key: 'lead', title: 'Giáo Viên Chính Thức (Lead)', badgeColor: 'bg-emerald-100 text-emerald-800 border-emerald-300' },
  { key: 'native', title: 'Giáo Viên Bản Ngữ (Native ESL Trainer)', badgeColor: 'bg-teal-100 text-teal-800 border-teal-300' },
  { key: 'assistant_fixed', title: 'Trợ Giảng Cố Định (Permanent)', badgeColor: 'bg-indigo-100 text-indigo-800 border-indigo-300' },
  { key: 'assistant_temp', title: 'Trợ Giảng Tạm Thời (Temporary)', badgeColor: 'bg-amber-100 text-amber-800 border-amber-300' }
];

export function getAllTeacherProfiles() {
  if (typeof window === 'undefined') return [...teacherProfilesData];
  try {
    const stored = localStorage.getItem(STORAGE_KEY_TEACHER_PROFILES);
    if (stored) return JSON.parse(stored);
  } catch {}
  return [...teacherProfilesData];
}

export function saveAllTeacherProfiles(profiles) {
  if (typeof window !== 'undefined') {
    localStorage.setItem(STORAGE_KEY_TEACHER_PROFILES, JSON.stringify(profiles));
  }
}

export function getTeacherProfile(teacherId) {
  const profiles = getAllTeacherProfiles();
  return profiles.find(p => p.teacher_id === teacherId);
}

export function updateTeacherRoleAndSalary(teacherId, updates, leaderUser = null) {
  const profiles = getAllTeacherProfiles();
  const idx = profiles.findIndex(p => p.teacher_id === teacherId);
  if (idx < 0) return { success: false, error: 'Không tìm thấy hồ sơ giáo viên!' };

  const current = profiles[idx];
  const updated = {
    ...current,
    ...updates,
    updated_at: new Date().toISOString()
  };

  profiles[idx] = updated;
  saveAllTeacherProfiles(profiles);

  logSnapshot('UPDATE_TEACHER_ROLE_SALARY', 'teacher_profile', teacherId, current, updated);

  return { success: true, profile: updated };
}

export function addTeacherAppraisalAndRating(teacherId, appraisalText, rating, leaderUser = null) {
  const profiles = getAllTeacherProfiles();
  const idx = profiles.findIndex(p => p.teacher_id === teacherId);
  if (idx < 0) return { success: false, error: 'Không tìm thấy giáo viên' };

  profiles[idx].leader_appraisal = appraisalText;
  profiles[idx].leader_rating = Number(rating) || 5.0;
  profiles[idx].updated_at = new Date().toISOString();
  saveAllTeacherProfiles(profiles);

  logSnapshot('TEACHER_APPRAISAL_ADDED', 'teacher_profile', teacherId, null, {
    teacherId, appraisalText, rating, leader: leaderUser?.name || 'Cô Dung'
  });

  return { success: true, profile: profiles[idx] };
}

export function addTeacherBonus(teacherId, bonusObj, leaderUser = null) {
  const profiles = getAllTeacherProfiles();
  const idx = profiles.findIndex(p => p.teacher_id === teacherId);
  if (idx < 0) return { success: false, error: 'Không tìm thấy giáo viên' };

  const newBonus = {
    id: `bon_${Date.now()}`,
    date: new Date().toISOString().slice(0, 10),
    amount_vnd: Number(bonusObj.amount_vnd) || 1000000,
    reason: bonusObj.reason || 'Khen thưởng hoàn thành xuất sắc nhiệm vụ',
    awarded_by: leaderUser?.name || 'Ms. Dung (Leader)'
  };

  if (!profiles[idx].bonuses) profiles[idx].bonuses = [];
  profiles[idx].bonuses.unshift(newBonus);
  saveAllTeacherProfiles(profiles);

  logSnapshot('TEACHER_BONUS_AWARDED', 'teacher_profile', teacherId, null, newBonus);

  // Dispatch alert to bot
  dispatchBotReport('TEACHER_BONUS_AWARDED', {
    teacher_name: profiles[idx].teacher_name,
    amount: newBonus.amount_vnd,
    reason: newBonus.reason,
    awarded_by: newBonus.awarded_by
  });

  return { success: true, bonus: newBonus, profile: profiles[idx] };
}

export function addTeacherPrivateReminder(teacherId, reminderObj, leaderUser = null) {
  const profiles = getAllTeacherProfiles();
  const idx = profiles.findIndex(p => p.teacher_id === teacherId);
  if (idx < 0) return { success: false, error: 'Không tìm thấy giáo viên' };

  const newReminder = {
    id: `rem_${Date.now()}`,
    date: new Date().toISOString().slice(0, 10),
    content: reminderObj.content || '',
    urgency: reminderObj.urgency || 'medium', // 'low' | 'medium' | 'high'
    status: 'pending',
    sent_by: leaderUser?.name || 'Ms. Dung (Leader)'
  };

  if (!profiles[idx].private_reminders) profiles[idx].private_reminders = [];
  profiles[idx].private_reminders.unshift(newReminder);
  saveAllTeacherProfiles(profiles);

  logSnapshot('TEACHER_REMINDER_SENT', 'teacher_profile', teacherId, null, newReminder);

  return { success: true, reminder: newReminder, profile: profiles[idx] };
}

export function acknowledgeTeacherReminder(teacherId, reminderId) {
  const profiles = getAllTeacherProfiles();
  const idx = profiles.findIndex(p => p.teacher_id === teacherId);
  if (idx < 0) return false;

  const rem = profiles[idx].private_reminders?.find(r => r.id === reminderId);
  if (rem) {
    rem.status = 'acknowledged';
    saveAllTeacherProfiles(profiles);
    return true;
  }
  return false;
}

// =========================================================================
// 17. TRUNG TÂM BÁO CÁO & THÔNG BÁO PWA CHO LEADER (CÔ DUNG)
// =========================================================================
export const STORAGE_KEY_LEADER_NOTIFICATIONS = 'tienganh_leader_notifications_v2';

export const DEFAULT_LEADER_NOTIFICATIONS = [
  {
    id: 'notif_seed_att_1',
    dedup_key: 'miss_att_sess_mon_l7_1_seed',
    type: 'teacher_missing_attendance',
    priority: 'urgent',
    title: '⚠️ Cảnh báo: Giáo viên chưa điểm danh!',
    message: 'Buổi học "Lớp 7 - Tiếng Anh Căn Bản & Giao Tiếp" (18:00 - 19:30) đã bắt đầu hơn 15 phút nhưng Mr. Johnathan Miller CHƯA nộp danh sách điểm danh!',
    timestamp: new Date(Date.now() - 18 * 60 * 1000).toISOString(),
    is_read: false,
    link_url: '/schedule',
    action_type: 'remind_teacher',
    meta: {
      sessionId: 'sess_mon_l7_1',
      className: 'Lớp 7 - Tiếng Anh Căn Bản & Giao Tiếp',
      teacherName: 'Mr. Johnathan Miller',
      teacherId: 'usr_teach_1'
    }
  },
  {
    id: 'notif_seed_sched_10m',
    dedup_key: 'sched_10m_sess_mon_l7_1_seed',
    type: 'schedule_reminder_10m',
    priority: 'high',
    title: '🚨 Lịch học gấp (Còn 10 phút): Lớp Chuyên Anh K12',
    message: 'Lớp học sắp bắt đầu lúc 18:00 tại Phòng học Cô Dung (123 Phố Vọng). Nhắc phụ huynh đưa đón học sinh!',
    timestamp: new Date(Date.now() - 45 * 60 * 1000).toISOString(),
    is_read: false,
    link_url: '/schedule',
    action_type: 'view_schedule',
    meta: {
      sessionId: 'sess_mon_l7_1',
      className: 'Lớp Chuyên Anh K12'
    }
  },
  {
    id: 'notif_seed_sched_1h',
    dedup_key: 'sched_1h_sess_mon_l7_1_seed',
    type: 'schedule_reminder_1h',
    priority: 'normal',
    title: '⏰ Lịch học sắp tới (Còn 1h): Lớp 7 Chuyên Anh',
    message: 'Lớp "Lớp 7 Chuyên Anh Cô Dung" bắt đầu lúc 18:00 tại Phòng 201. Giáo viên phụ trách: Ms. Dung.',
    timestamp: new Date(Date.now() - 85 * 60 * 1000).toISOString(),
    is_read: true,
    link_url: '/schedule',
    action_type: 'view_schedule',
    meta: {
      sessionId: 'sess_mon_l7_1',
      className: 'Lớp 7 Chuyên Anh Cô Dung'
    }
  },
  {
    id: 'notif_seed_rollcall_1',
    dedup_key: 'att_summary_sess_wed_l9_1_seed',
    type: 'attendance_summary',
    priority: 'high',
    title: '📋 Báo cáo Điểm Danh: Lớp 9 - Ôn Thi Vào 10',
    message: 'Sĩ số: 15/16 có mặt. THIẾU 1 học viên: Trần Minh Anh (Nghỉ ốm có phép). Giáo viên đã cập nhật sổ đầu bài.',
    timestamp: new Date(Date.now() - 2 * 3600 * 1000).toISOString(),
    is_read: false,
    link_url: '/schedule?tab=attendance',
    action_type: 'view_attendance',
    meta: {
      sessionId: 'sess_wed_l9_1',
      presentCount: 15,
      totalCount: 16,
      absentNames: 'Trần Minh Anh (Nghỉ ốm)'
    }
  },
  {
    id: 'notif_seed_reg_1',
    dedup_key: 'new_reg_baokhiem_seed',
    type: 'new_registration',
    priority: 'high',
    title: '🔔 Đăng ký mới: Nguyễn Bảo Khiêm (Lớp 7)',
    message: 'Học sinh Nguyễn Bảo Khiêm (@baokhiem, SĐT: 0912345678) vừa đăng ký tài khoản Lớp 7. Trạng thái: Dùng thử (Trial) - Chờ Cô Dung duyệt!',
    timestamp: new Date(Date.now() - 3 * 3600 * 1000).toISOString(),
    is_read: false,
    link_url: '/admin?tab=students',
    action_type: 'approve_user',
    meta: {
      userId: 'usr_student_baokhiem',
      username: 'baokhiem',
      role: 'student',
      grade: 'Lớp 7'
    }
  },
  {
    id: 'notif_seed_test_1',
    dedup_key: 'test_comp_hoangnam_seed',
    type: 'test_completed',
    priority: 'normal',
    title: '📝 Bài thi hoàn thành: Lê Hoàng Nam (Lớp 7)',
    message: 'Học sinh Lê Hoàng Nam vừa hoàn thành bài "Kiểm Tra 15 Phút Unit 7: Traffic" đạt 9.5/10 điểm (+20 ⭐ Sao thưởng).',
    timestamp: new Date(Date.now() - 4 * 3600 * 1000).toISOString(),
    is_read: true,
    link_url: '/evaluations',
    action_type: 'view_test',
    meta: {
      studentId: 'usr_student_hoangnam',
      score: 9.5,
      examTitle: 'Kiểm Tra 15 Phút Unit 7: Traffic'
    }
  },
  {
    id: 'notif_seed_tui_1',
    dedup_key: 'tuition_due_bill_2_seed',
    type: 'tuition_due',
    priority: 'urgent',
    title: '💰 Đến hạn học phí: Phạm Thảo My (Lớp 8)',
    message: 'Học phí kỳ Tháng 10/2026 số tiền 1.800.000 VNĐ đến hạn ngày 28/09/2026 (còn 3 ngày). Học sinh có 5,000 ⭐ tích lũy.',
    timestamp: new Date(Date.now() - 5 * 3600 * 1000).toISOString(),
    is_read: false,
    link_url: '/admin?tab=tuition',
    action_type: 'view_tuition',
    meta: {
      billId: 'bill_2',
      studentName: 'Phạm Thảo My',
      dueDate: '2026-09-28'
    }
  }
];

export function playNotificationChime(priority = 'normal') {
  if (typeof window === 'undefined') return;
  try {
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (!AudioContext) return;
    const ctx = new AudioContext();
    const now = ctx.currentTime;

    const tones = priority === 'urgent'
      ? [{ f: 880, t: 0, d: 0.15 }, { f: 659, t: 0.16, d: 0.15 }, { f: 1046, t: 0.32, d: 0.25 }]
      : [{ f: 587.33, t: 0, d: 0.2 }, { f: 880, t: 0.18, d: 0.35 }];

    for (const tone of tones) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(tone.f, now + tone.t);
      gain.gain.setValueAtTime(0.25, now + tone.t);
      gain.gain.exponentialRampToValueAtTime(0.001, now + tone.t + tone.d);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now + tone.t);
      osc.stop(now + tone.t + tone.d);
    }
  } catch {}
}

export async function requestPwaNotificationPermission() {
  if (typeof window === 'undefined' || !('Notification' in window)) {
    return { supported: false, granted: false, status: 'unsupported' };
  }
  if (Notification.permission === 'granted') {
    return { supported: true, granted: true, status: 'granted' };
  }
  try {
    const permission = await Notification.requestPermission();
    return { supported: true, granted: permission === 'granted', status: permission };
  } catch (err) {
    return { supported: true, granted: false, status: 'denied', error: err.message };
  }
}

export function getAllLeaderNotifications() {
  if (typeof window === 'undefined') return [...DEFAULT_LEADER_NOTIFICATIONS];
  try {
    const raw = localStorage.getItem(STORAGE_KEY_LEADER_NOTIFICATIONS);
    if (raw) {
      const list = JSON.parse(raw);
      if (Array.isArray(list) && list.length > 0) return list;
    }
  } catch {}
  return [...DEFAULT_LEADER_NOTIFICATIONS];
}

export function saveAllLeaderNotifications(notifications) {
  if (typeof window !== 'undefined') {
    localStorage.setItem(STORAGE_KEY_LEADER_NOTIFICATIONS, JSON.stringify(notifications));
    window.dispatchEvent(new CustomEvent('tienganh:leader-notifications-change', { detail: notifications }));
  }
}

export function addLeaderNotification(notif) {
  const notifications = getAllLeaderNotifications();

  // Deduplication check
  if (notif.dedup_key) {
    const existing = notifications.find(n => n.dedup_key === notif.dedup_key);
    if (existing) {
      return null;
    }
  }

  const newNotif = {
    id: notif.id || `notif_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
    dedup_key: notif.dedup_key || null,
    type: notif.type || 'system',
    priority: notif.priority || 'normal', // 'normal' | 'high' | 'urgent'
    title: notif.title || 'Thông Báo Mới',
    message: notif.message || '',
    timestamp: notif.timestamp || new Date().toISOString(),
    is_read: false,
    link_url: notif.link_url || '/admin?tab=leader_notifications',
    action_type: notif.action_type || '',
    meta: notif.meta || {}
  };

  notifications.unshift(newNotif);
  saveAllLeaderNotifications(notifications.slice(0, 100));

  // Audio Chime
  playNotificationChime(newNotif.priority);

  // Dispatch PWA Event & Browser / SW Notification
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('tienganh:leader-notification-new', { detail: newNotif }));

    if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
      navigator.serviceWorker.controller.postMessage({
        type: 'SHOW_LEADER_NOTIFICATION',
        title: newNotif.title,
        body: newNotif.message,
        tag: newNotif.dedup_key || newNotif.id,
        url: newNotif.link_url,
        priority: newNotif.priority
      });
    } else if ('Notification' in window && Notification.permission === 'granted') {
      try {
        new Notification(newNotif.title, {
          body: newNotif.message,
          icon: '/icon.svg',
          badge: '/icon.svg',
          tag: newNotif.dedup_key || newNotif.id
        });
      } catch {}
    }
  }

  return newNotif;
}

export function markNotificationAsRead(notifId) {
  const list = getAllLeaderNotifications();
  const idx = list.findIndex(n => n.id === notifId);
  if (idx >= 0) {
    list[idx].is_read = true;
    saveAllLeaderNotifications(list);
    return true;
  }
  return false;
}

export function markAllNotificationsAsRead() {
  const list = getAllLeaderNotifications().map(n => ({ ...n, is_read: true }));
  saveAllLeaderNotifications(list);
  return list;
}

export function deleteLeaderNotification(notifId) {
  const list = getAllLeaderNotifications().filter(n => n.id !== notifId);
  saveAllLeaderNotifications(list);
  return true;
}

export function clearAllLeaderNotifications() {
  saveAllLeaderNotifications([]);
  return true;
}

export function getUnreadLeaderNotificationCount() {
  const list = getAllLeaderNotifications();
  return list.filter(n => !n.is_read).length;
}

export function scanScheduleAndAttendanceForLeader(overrideDate = null) {
  const now = overrideDate instanceof Date ? overrideDate : new Date();
  const currentDayOfWeek = now.getDay();
  const currentMinutes = now.getHours() * 60 + now.getMinutes();
  const todayStr = now.toISOString().slice(0, 10);

  const sessions = getAllClassSessions().filter(s => Number(s.day_of_week) === currentDayOfWeek && s.status !== 'inactive');
  const attendanceRecords = getAllAttendanceRecords();
  const generatedNotifs = [];

  for (const sess of sessions) {
    if (!sess.start_time) continue;
    const [startH, startM] = sess.start_time.split(':').map(Number);
    const startMinutes = startH * 60 + startM;
    const diff = startMinutes - currentMinutes;

    // 1. Remind 1 hour before (between 60 and 45 mins before class)
    if (diff <= 60 && diff >= 45) {
      const dedupKey = `sched_1h_${sess.id}_${todayStr}`;
      const notif = addLeaderNotification({
        dedup_key: dedupKey,
        type: 'schedule_reminder_1h',
        priority: 'normal',
        title: `⏰ Lịch học sắp tới (Còn 1h): ${sess.class_name}`,
        message: `Lớp "${sess.class_name}" bắt đầu lúc ${sess.start_time} tại ${sess.location || 'Nhà Cô Dung'}. Giáo viên phụ trách: ${sess.teacher_name}.`,
        link_url: '/schedule',
        action_type: 'view_schedule',
        meta: { sessionId: sess.id, startTime: sess.start_time, teacherName: sess.teacher_name }
      });
      if (notif) generatedNotifs.push(notif);
    }

    // 2. Remind 10 minutes before (between 15 and 0 mins before class)
    if (diff <= 15 && diff >= 0) {
      const dedupKey = `sched_10m_${sess.id}_${todayStr}`;
      const notif = addLeaderNotification({
        dedup_key: dedupKey,
        type: 'schedule_reminder_10m',
        priority: 'high',
        title: `🚨 Lịch học gấp (Còn 10 phút): ${sess.class_name}`,
        message: `Lớp "${sess.class_name}" bắt đầu lúc ${sess.start_time}! Nhắc nhở phụ huynh đưa đón học sinh, phòng học đã sẵn sàng.`,
        link_url: '/schedule',
        action_type: 'view_schedule',
        meta: { sessionId: sess.id, startTime: sess.start_time }
      });
      if (notif) generatedNotifs.push(notif);
    }

    // 3. Teacher missing attendance (class started >= 15 mins ago, but within 2 hours of start)
    if (diff <= -15 && diff >= -120) {
      const attended = attendanceRecords.filter(r => r.session_id === sess.id && r.session_date === todayStr);
      if (attended.length === 0) {
        const dedupKey = `miss_att_${sess.id}_${todayStr}`;
        const notif = addLeaderNotification({
          dedup_key: dedupKey,
          type: 'teacher_missing_attendance',
          priority: 'urgent',
          title: `⚠️ Cảnh báo: Giáo viên chưa điểm danh!`,
          message: `Lớp "${sess.class_name}" đã bắt đầu lúc ${sess.start_time} (đã qua hơn 15 phút) nhưng Giáo viên ${sess.teacher_name} CHƯA nộp sổ điểm danh!`,
          link_url: '/schedule',
          action_type: 'remind_teacher',
          meta: { sessionId: sess.id, teacherName: sess.teacher_name, teacherId: sess.teacher_id, startTime: sess.start_time }
        });
        if (notif) generatedNotifs.push(notif);
      }
    }
  }

  return generatedNotifs;
}

export function scanTuitionDueAlerts(overrideDate = null) {
  const now = overrideDate instanceof Date ? overrideDate : new Date();
  const bills = getAllTuitionBills().filter(b => b.status !== 'paid');
  const generatedNotifs = [];

  for (const bill of bills) {
    const dueDateStr = bill.due_date || (bill.billing_period?.includes('10/2026') ? '2026-09-28' : '2026-09-30');
    const dueDate = new Date(dueDateStr);
    const diffDays = Math.ceil((dueDate - now) / (1000 * 60 * 60 * 24));
    const amount = Number(bill.final_amount_vnd || bill.final_fee_vnd || 1800000);
    const period = bill.billing_period || bill.billing_cycle || 'Tháng 10/2026';
    const grade = bill.grade_level || bill.grade || 'K12';

    if (diffDays <= 5 && diffDays >= 0) {
      const dedupKey = `tuition_due_${bill.id}_${dueDateStr}`;
      const notif = addLeaderNotification({
        dedup_key: dedupKey,
        type: 'tuition_due',
        priority: 'high',
        title: `💰 Tới hạn học phí: ${bill.student_name} (${grade})`,
        message: `Học phí kỳ ${period} số tiền ${amount.toLocaleString('vi-VN')}đ của em ${bill.student_name} đến hạn ngày ${dueDateStr} (còn ${diffDays} ngày). Chưa thanh toán!`,
        link_url: '/admin?tab=tuition',
        action_type: 'view_tuition',
        meta: { billId: bill.id, studentId: bill.student_id, dueDate: dueDateStr }
      });
      if (notif) generatedNotifs.push(notif);
    } else if (diffDays < 0) {
      const dedupKey = `tuition_overdue_${bill.id}_${dueDateStr}`;
      const notif = addLeaderNotification({
        dedup_key: dedupKey,
        type: 'tuition_due',
        priority: 'urgent',
        title: `🚨 Quá hạn học phí: ${bill.student_name} (${grade})`,
        message: `Học phí kỳ ${period} số tiền ${amount.toLocaleString('vi-VN')}đ đã QUÁ HẠN ${Math.abs(diffDays)} ngày (Hạn: ${dueDateStr})! Cần liên hệ phụ huynh.`,
        link_url: '/admin?tab=tuition',
        action_type: 'view_tuition',
        meta: { billId: bill.id, studentId: bill.student_id, dueDate: dueDateStr }
      });
      if (notif) generatedNotifs.push(notif);
    }
  }

  return generatedNotifs;
}

export function simulateLeaderNotification(eventType) {
  const now = new Date();
  switch (eventType) {
    case 'new_registration':
      return addLeaderNotification({
        type: 'new_registration',
        priority: 'high',
        title: '🔔 Đăng ký mới: Trần Hải Đăng (Lớp 8)',
        message: 'Học sinh Trần Hải Đăng (@haidang_k8, SĐT: 0987654321) vừa đăng ký tài khoản Lớp 8. Cần Cô Dung duyệt chính thức!',
        link_url: '/admin?tab=students',
        action_type: 'approve_user',
        meta: { username: 'haidang_k8', role: 'student', grade: 'Lớp 8' }
      });

    case 'schedule_reminder_1h':
      return addLeaderNotification({
        type: 'schedule_reminder_1h',
        priority: 'normal',
        title: '⏰ Lịch học sắp tới (Còn 1h): Lớp 7 Chuyên Anh',
        message: 'Lớp "Lớp 7 Chuyên Anh Cô Dung" bắt đầu lúc 18:00 tại Phòng 201 - Nhà Cô Dung. Giáo viên: Ms. Dung.',
        link_url: '/schedule',
        action_type: 'view_schedule'
      });

    case 'schedule_reminder_10m':
      return addLeaderNotification({
        type: 'schedule_reminder_10m',
        priority: 'high',
        title: '🚨 Lịch học gấp (Còn 10 phút): Lớp 7 Chuyên Anh',
        message: 'Lớp học sắp bắt đầu lúc 18:00! Nhắc phụ huynh đưa đón học sinh kịp giờ.',
        link_url: '/schedule',
        action_type: 'view_schedule'
      });

    case 'attendance_summary_full':
      return addLeaderNotification({
        type: 'attendance_summary',
        priority: 'normal',
        title: '📋 Báo cáo Điểm Danh: Lớp 7 - Tiếng Anh Căn Bản',
        message: 'Sĩ số: 18/18 học viên CÓ MẶT ĐẦY ĐỦ. Tinh thần học tập sôi nổi, đạt 100% sao rèn luyện!',
        link_url: '/schedule?tab=attendance',
        action_type: 'view_attendance'
      });

    case 'attendance_summary_absent':
      return addLeaderNotification({
        type: 'attendance_summary',
        priority: 'high',
        title: '📋 Báo cáo Điểm Danh: Lớp 8 - Bứt Phá Ngữ Pháp',
        message: 'Sĩ số 16/18 có mặt. THIẾU 2 học viên: Vũ Minh Châu (Có phép), Đỗ Bảo Nam (Không phép).',
        link_url: '/schedule?tab=attendance',
        action_type: 'view_attendance'
      });

    case 'teacher_missing_attendance':
      return addLeaderNotification({
        type: 'teacher_missing_attendance',
        priority: 'urgent',
        title: '⚠️ Cảnh báo: Giáo viên chưa điểm danh!',
        message: 'Buổi học "Lớp 9 - Ôn Thi Chuyên" đã diễn ra hơn 15 phút nhưng Giáo viên Trợ giảng CHƯA nộp sổ điểm danh!',
        link_url: '/schedule',
        action_type: 'remind_teacher'
      });

    case 'test_completed':
      return addLeaderNotification({
        type: 'test_completed',
        priority: 'normal',
        title: '📝 Bài thi hoàn thành: Nguyễn Bảo Khiêm',
        message: 'Học sinh Nguyễn Bảo Khiêm vừa nộp bài "Đề Thi Khảo Sát Giữa Kỳ I" đạt 10/10 điểm (+25 ⭐ Sao thưởng)!',
        link_url: '/evaluations',
        action_type: 'view_test'
      });

    case 'tuition_due':
      return addLeaderNotification({
        type: 'tuition_due',
        priority: 'urgent',
        title: '💰 Đến hạn học phí: Hoàng Tuấn Kiệt (Lớp 10)',
        message: 'Học phí kỳ Tháng 10/2026 số tiền 2.200.000 VNĐ đến hạn ngày mai. Chưa thanh toán!',
        link_url: '/admin?tab=tuition',
        action_type: 'view_tuition'
      });

    default:
      return null;
  }
}




