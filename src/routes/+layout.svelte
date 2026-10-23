<script>
 import '../app.css';
 import { page } from '$app/stores';
 import { onMount } from 'svelte';
 import {
 getAllUsers,
 getCurrentUser,
 setCurrentUser,
 logoutUser,
 isLoggedIn,
 isSuperAdmin,
 isTeacherOrAdmin,
 getTheme,
 setTheme,
 getStudentStars,
 getUnreadLeaderNotificationCount,
 scanScheduleAndAttendanceForLeader,
 scanTuitionDueAlerts,
 verifySessionWithServer,
 hasPersistedToken
 } from '$lib/unifiedStore';
 import AuthModal from '$lib/components/AuthModal.svelte';
 import ProfileEditModal from '$lib/components/ProfileEditModal.svelte';
 import ApkOtaUpdater from '$lib/components/ApkOtaUpdater.svelte';
 import { appUpdateState, checkForUpdate } from '$lib/stores/appUpdate.js';
 import LeaderNotificationDrawer from '$lib/components/LeaderNotificationDrawer.svelte';
 import NotificationCenterModal from '$lib/components/NotificationCenterModal.svelte';
 import OnboardingTourModal from '$lib/components/OnboardingTourModal.svelte';
 import EducationNavigation from '$lib/components/EducationNavigation.svelte';
 import ThemeSwitcher from '$lib/components/ui/ThemeSwitcher.svelte';
 import BottomNav from '$lib/components/ui/BottomNav.svelte';
 import DockBar from '$lib/components/ui/DockBar.svelte';
 import ZaloCta from '$lib/components/ui/ZaloCta.svelte';
 import ThemeStudio from '$lib/components/ThemeStudio.svelte';
 import PersonalThemeModal from '$lib/components/PersonalThemeModal.svelte';
 import HalloweenMarketingPopup from '$lib/components/HalloweenMarketingPopup.svelte';
 import { loadLocal } from '$lib/themeStudio.js';

 let { children } = $props();

 let apkUpdaterRef = $state(null);

 let currentUser = $state(null);
 let allUsers = $state([]);
 let currentTheme = $state('sky');
 let showUserDropdown = $state(false);
 let activeDropdown = $state(null); // 'courses' | 'exams' | 'tools' | 'admin' | null
 let mobileMenuOpen = $state(false);
 let showAuthModal = $state(false);
 let showProfileModal = $state(false);
 let showLeaderDrawer = $state(false);
 let showNotificationModal = $state(false);
 let showTourModal = $state(false);
 let showPersonalThemeModal = $state(false);
 let hasPersonalTheme = $state(false);
 let leaderUnreadCount = $state(0);
 let userUnreadCount = $state(0);
 let canDismiss = $state(false);
 let studentStars = $state(null);
 let globalSearchQuery = $state('');
 let showSearchDropdown = $state(false);
 let searchInputRef = $state(null);

 const globalSearchCatalog = [
   { title: 'Trang Chủ & Tổng Quan Lộ Trình', desc: 'Cổng chính hệ thống đào tạo K12 & Quốc Tế', href: '/', icon: '🏠', category: 'Điều Hướng', keywords: 'trang chu home tong quan', roles: ['all'] },
   { title: 'Thời Khóa Biểu & Điểm Danh Ca Học', desc: 'Lịch học tuần, điểm danh đi muộn/đúng giờ, gắn đề BTVN', href: '/schedule', icon: '📅', category: 'Học Vụ', keywords: 'thoi khoa bieu lich hoc diem danh schedule ca hoc', roles: ['all'] },
   { title: 'Langflow CRAG Studio — Bộ Não Bot Zalo 7-Node & Role D1', desc: 'Quản trị luồng CRAG đọc 81 bảng D1, phân quyền Role & bắn thông báo tự động', href: '/langflow', icon: '🕸️', category: 'Quản Trị AI', keywords: 'langflow crag rag bot zalo ai role database d1', roles: ['leader', 'superadmin'] },
    { title: 'Đối Soát Chất Lượng Ca Dạy & Zalo Bot', desc: 'Hồi quy Kho Tri Thức, Drive, BTVN, xuất hồ sơ 5 phần', href: '/session-audit', icon: '📊', category: 'Quản Trị', keywords: 'doi soat ca day session audit zalo bot bao cao', roles: ['teacher', 'leader', 'superadmin'] },
   { title: 'Phòng Thi Số Hóa (15p • 45p • Học Kỳ)', desc: 'Luyện đề chuẩn Bộ GD&ĐT 2026 & IELTS 4 kỹ năng', href: '/exam', icon: '⏱️', category: 'Phòng Thi', keywords: 'phong thi de thi 15p 45p ielts placement test', roles: ['all'] },
   { title: 'Quiz Menu — Kho Đề & Làm Bài Trắc Nghiệm', desc: 'Ngân hàng câu hỏi D1 theo khối lớp 1-12', href: '/quiz-menu', icon: '🧩', category: 'Quiz Menu', keywords: 'quiz trac nghiem bai tap kho de', roles: ['all'] },
   { title: 'Toàn Bộ 19 Khóa Học K12 & Quốc Tế', desc: 'Tiểu học, THCS, THPT, IELTS, TOEIC, VSTEP', href: '/courses', icon: '📚', category: 'Khóa Học', keywords: 'khoa hoc lo trinh k12 ielts toeic vstep lop 1 2 3 4 5 6 7 8 9 10 11 12', roles: ['all'] },
   { title: 'Từ Điển Cambridge & Phát Âm IPA', desc: 'Tra từ vựng, phiên âm chuẩn bản ngữ & Phonics', href: '/dictionary', icon: '📖', category: 'Công Cụ', keywords: 'tu dien dictionary ipa phat am tu vung', roles: ['all'] },
   { title: 'Flashcard Ngữ Âm 3D Đa Giác Quan', desc: 'Ôn tập từ vựng theo Unit SGK Global Success', href: '/flashcards', icon: '🗂️', category: 'Công Cụ', keywords: 'flashcard the tu vung 3d on tap', roles: ['all'] },
   { title: 'Đấu Trường Trò Chơi Từ Vựng', desc: 'Speed Match, Meteor Rush & Memory Flip tích sao', href: '/games', icon: '🎮', category: 'Công Cụ', keywords: 'game tro choi speed match meteor rush', roles: ['all'] },
   { title: '14 Chuyên Đề Ngữ Pháp & Công Thức K12', desc: 'Các thì tiếng Anh, câu điều kiện, bị động, mệnh đề', href: '/grammar', icon: '📐', category: 'Công Cụ', keywords: 'ngu phap grammar cong thuc thi cau dieu kien', roles: ['all'] },
   { title: 'Sổ Giáo Viên & Giao Bài Tập Về Nhà', desc: 'Giao BTVN, chấm bài, nhận xét & tính lương', href: '/cpanel/teacher', icon: '👩‍🏫', category: 'Cổng Nội Bộ', keywords: 'so giao vien teacher btvn bai tap ve nha cham bai', roles: ['teacher', 'leader', 'superadmin'] },
   { title: 'Bàn Điều Hành Leader (Cô Dung)', desc: 'Kiểm soát chất lượng, duyệt lương & cảnh báo sớm', href: '/cpanel/leader', icon: '👑', category: 'Quản Trị', keywords: 'ban dieu hanh leader co dung luong giao vien', roles: ['leader', 'superadmin'] },
   { title: 'Sổ Phụ Huynh Theo Dõi Việc Học', desc: 'Xem chuyên cần, điểm số, học phí VietQR của con', href: '/cpanel/parent', icon: '👨‍👩‍👧', category: 'Cổng Nội Bộ', keywords: 'so phu huynh parent hoc phi diem danh con', roles: ['parent', 'leader', 'superadmin'] },
   { title: 'Sổ Học Sinh & Đổi Sao Học Phí', desc: 'Làm BTVN được giao, tích lũy 100 sao = 1.000đ', href: '/cpanel/student', icon: '🎒', category: 'Cổng Nội Bộ', keywords: 'so hoc sinh student sao btvn', roles: ['student', 'leader', 'superadmin'] },
   { title: 'Kho Tri Thức Obsidian Second Brain', desc: '220+ chuyên đề sư phạm, giáo án 5512 & tài liệu', href: '/second-brain', icon: '🧠', category: 'Học Liệu', keywords: 'second brain kho tri thuc obsidian giao an', roles: ['teacher', 'leader', 'superadmin'] },
   { title: 'Kho Tài Liệu Google Drive Đồng Bộ', desc: 'Đề cương, Audio, PDF phân loại theo khối lớp', href: '/drive', icon: '📁', category: 'Học Liệu', keywords: 'google drive kho tai lieu pdf audio de cuong', roles: ['teacher', 'leader', 'superadmin'] },
   { title: 'Đánh Giá Năng Lực 5 Kỹ Năng Học Viên', desc: 'Biểu đồ tiến bộ Nghe-Nói-Đọc-Viết-Ngữ pháp', href: '/evaluations', icon: '📈', category: 'Học Vụ', keywords: 'danh gia nang luc evaluations bieu do', roles: ['student', 'parent', 'teacher', 'leader', 'superadmin'] },
   { title: 'Admin CP — Báo Học Phí, Đổi Sao & Zalo Bot', desc: 'Quản lý hóa đơn học phí VietQR & Bot @bot.ynKabJAc', href: '/admin', icon: '💰', category: 'Quản Trị', keywords: 'admin hoc phi vietqr zalo bot webhook', roles: ['leader', 'superadmin'] },
   { title: 'Admin CP — Quản Trị Tài Khoản & Phân Quyền Role', desc: 'Tạo/sửa tài khoản Học sinh, Phụ huynh, Giáo viên', href: '/admincp', icon: '⚡', category: 'Quản Trị', keywords: 'admincp tai khoan user role mat khau', roles: ['leader', 'superadmin'] },
   { title: 'Bảng Vàng Vinh Danh Học Viên CEFR', desc: 'Top học viên tích sao & đạt chứng chỉ xuất sắc', href: '/hall-of-fame', icon: '🏆', category: 'Trường Học', keywords: 'bang vang hall of fame vinh danh', roles: ['all'] },
   { title: 'Về Trường Học Cô Dung & Tuyển Dụng', desc: 'Mô hình Co-Teaching bản ngữ & ứng tuyển giáo viên', href: '/truong-hoc', icon: '🏫', category: 'Trường Học', keywords: 'truong hoc tuyen dung co teaching', roles: ['all'] }
 ];

 let filteredSearchItems = $derived.by(() => {
   const roleKey = !currentUser ? 'guest' : (isSuperAdmin(currentUser) ? 'superadmin' : (currentUser.role || 'student'));
   const allowedCatalog = globalSearchCatalog.filter(item => item.roles.includes('all') || item.roles.includes(roleKey));
   const q = globalSearchQuery.trim().toLowerCase();
   if (!q) return allowedCatalog.slice(0, 8);
   return allowedCatalog.filter(item =>
     item.title.toLowerCase().includes(q) ||
     item.desc.toLowerCase().includes(q) ||
     item.category.toLowerCase().includes(q) ||
     item.keywords.includes(q)
   ).slice(0, 10);
 });

 let currentUserGrade = $derived.by(() => {
 if (!currentUser) return '';
 if (currentUser.grade) return currentUser.grade;
 try {
 const meta = typeof currentUser.metadata === 'string' ? JSON.parse(currentUser.metadata) : (currentUser.metadata || {});
 return meta.grade || '';
 } catch {
 return '';
 }
 });

 let currentUserRoleLabel = $derived.by(() => {
 if (!currentUser) return '';
 if (isSuperAdmin(currentUser)) return 'SuperAdmin';
 if (currentUser.role === 'teacher') return 'Giáo Viên';
 if (currentUser.role === 'parent') return 'Phụ Huynh';
 if (currentUser.role === 'student') return currentUserGrade ? `Học Sinh • ${currentUserGrade}` : 'Học Sinh';
 return 'Học Sinh';
 });

 async function loadUserNotificationsCount() {
 if (typeof window === 'undefined') return;
 const token = localStorage.getItem('tienganh_token');
 if (!token) {
 userUnreadCount = 0;
 return;
 }
 try {
 const res = await fetch('/api/notifications', {
 headers: { 'Authorization': `Bearer ${token}` }
 });
 const data = await res.json();
 if (data.success) {
 userUnreadCount = data.unread_count || 0;
 }
 } catch {}
 }

 async function sendGlobalHeartbeat() {
 if (typeof window === 'undefined') return;
 try {
 const ua = navigator.userAgent || '';
 const isAndroidApk = Boolean(
 (window.AndroidApp && typeof window.AndroidApp.isAndroidApp === 'function' && window.AndroidApp.isAndroidApp()) ||
 /TiengAnhCoDungApp/i.test(ua)
 );
 let deviceId = localStorage.getItem('tienganh_device_id');
 if (!deviceId) {
 const prefix = /R10|DOOGEE/i.test(ua) ? 'r10' : (isAndroidApk ? 'apk' : 'dev');
 deviceId = `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
 localStorage.setItem('tienganh_device_id', deviceId);
 }
 const token = localStorage.getItem('tienganh_token') || localStorage.getItem('tienganh_auth_token') || '';
 const user = currentUser || getCurrentUser();
 await fetch('/api/devices/heartbeat', {
 method: 'POST',
 headers: {
 'Content-Type': 'application/json',
 ...(token ? { 'Authorization': `Bearer ${token}` } : {})
 },
 body: JSON.stringify({
 device_id: deviceId,
 user_id: user?.id || null,
 username: user?.username || 'guest',
 user_role: user?.role || 'guest',
 device_model: /R10|DOOGEE/i.test(ua) ? 'DOOGEE R10 Tablet' : (isAndroidApk ? 'Android APK' : ''),
 app_mode: isAndroidApk ? 'android_apk' : (window.matchMedia('(display-mode: standalone)').matches ? 'pwa_standalone' : 'web'),
 is_android_apk: isAndroidApk,
 screen_size: `${window.innerWidth}x${window.innerHeight}`,
 current_path: window.location.pathname + window.location.search
 })
 });
 } catch {}
 }

 onMount(() => {
 const requestedLogin = new URLSearchParams(window.location.search).get('login') === '1';
 // PWA: Register Service Worker for app-like experience (offline, installable)
 if ('serviceWorker' in navigator) {
 navigator.serviceWorker.register('/sw.js').then((reg) => {
 console.log('[PWA] SW registered:', reg.scope);
 // Notify SW of auth token for authenticated caching if needed
 }).catch((err) => {
 console.warn('[PWA] SW registration failed:', err);
 });
 }

 // RB-C1 (2026-09-30): server-side admin guards redirect here with ?login=1
 // when the session is missing/insufficient. The repo has no dedicated /login
 // route — login happens via the global AuthModal, so open it automatically.
 try {
 const loginParams = new URLSearchParams(window.location.search);
 if (loginParams.get('login') === '1') {
 showAuthModal = true;
 canDismiss = true;
 loginParams.delete('login');
 const qs = loginParams.toString();
 window.history.replaceState({}, '', window.location.pathname + (qs ? `?${qs}` : ''));
 }
 } catch {}

 allUsers = getAllUsers();
 currentUser = getCurrentUser();
 currentTheme = getTheme();
 setTheme(currentTheme);
 try { hasPersonalTheme = !!loadLocal(); } catch {}

 if (currentUser?.role === 'student') {
 studentStars = getStudentStars(currentUser.id);
 }

 // Initialize Leader unread notifications count
 leaderUnreadCount = getUnreadLeaderNotificationCount();

 // Send immediate device/R10 heartbeat and repeat every 30s
 sendGlobalHeartbeat();
 const heartbeatTimer = setInterval(sendGlobalHeartbeat, 30000);

 // Background scanner every 60s for schedule 1h/10m, teacher missing attendance, and tuition dues
 const scanTimer = setInterval(() => {
 scanScheduleAndAttendanceForLeader();
 scanTuitionDueAlerts();
 leaderUnreadCount = getUnreadLeaderNotificationCount();
 }, 60000);

 // Initial background scan on mount
 setTimeout(() => {
 scanScheduleAndAttendanceForLeader();
 scanTuitionDueAlerts();
 leaderUnreadCount = getUnreadLeaderNotificationCount();
 loadUserNotificationsCount();
 }, 2000);

 // Verify session integrity with server on startup / reload
 if (hasPersistedToken()) {
 verifySessionWithServer().then(res => {
 if (!res.valid) {
 currentUser = null;
 showAuthModal = requestedLogin;
 canDismiss = true;
 } else {
 currentUser = res.user;
 showAuthModal = false;
 loadUserNotificationsCount();
 sendGlobalHeartbeat();
 }
 });
 } else {
 currentUser = null;
 showAuthModal = requestedLogin;
 canDismiss = true;
 }

 const handleAuthEvent = (e) => {
 currentUser = e.detail;
 if (!currentUser) {
 showAuthModal = false;
 canDismiss = true;
 studentStars = null;
 userUnreadCount = 0;
 } else {
 if (currentUser.role === 'student') {
 studentStars = getStudentStars(currentUser.id);
 }
 loadUserNotificationsCount();
 }
 leaderUnreadCount = getUnreadLeaderNotificationCount();
 sendGlobalHeartbeat();
 };

 const handleThemeEvent = (e) => {
 currentTheme = e.detail;
 };

 const handleLeaderNotifEvent = () => {
 leaderUnreadCount = getUnreadLeaderNotificationCount();
 };

 const handlePersonalThemeEvent = () => {
 try { hasPersonalTheme = !!loadLocal(); } catch {}
 };

 const handleGlobalKeydown = (e) => {
 if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
 e.preventDefault();
 showSearchDropdown = true;
 searchInputRef?.focus();
 } else if (e.key === 'Escape') {
 showSearchDropdown = false;
 showUserDropdown = false;
 activeDropdown = null;
 }
 };

 window.addEventListener('keydown', handleGlobalKeydown);
 window.addEventListener('tienganh:auth-change', handleAuthEvent);
 window.addEventListener('tienganh:theme-change', handleThemeEvent);
 window.addEventListener('tienganh:personal-theme-change', handlePersonalThemeEvent);
 window.addEventListener('tienganh:leader-notifications-change', handleLeaderNotifEvent);
 window.addEventListener('tienganh:leader-notification-new', handleLeaderNotifEvent);

 return () => {
 clearInterval(scanTimer);
 clearInterval(heartbeatTimer);
 window.removeEventListener('keydown', handleGlobalKeydown);
 window.removeEventListener('tienganh:auth-change', handleAuthEvent);
 window.removeEventListener('tienganh:theme-change', handleThemeEvent);
 window.removeEventListener('tienganh:personal-theme-change', handlePersonalThemeEvent);
 window.removeEventListener('tienganh:leader-notifications-change', handleLeaderNotifEvent);
 window.removeEventListener('tienganh:leader-notification-new', handleLeaderNotifEvent);
 };
 });

 async function handleLogout() {
 showUserDropdown = false;
 const token = typeof window !== 'undefined' ? (localStorage.getItem('tienganh_token') || localStorage.getItem('tienganh_auth_token')) : null;
 if (token) {
 try {
 await fetch('/api/auth/logout', {
 method: 'POST',
 headers: { 'Authorization': `Bearer ${token}` }
 });
 } catch (e) {
 console.warn('Logout API failed:', e);
 }
 }
 logoutUser();
 currentUser = null;
 showAuthModal = false;
 canDismiss = true;
 }

 function openAuthModal() {
 showUserDropdown = false;
 showAuthModal = true;
 canDismiss = true;
 }

 function toggleSubmenu(menu) {
 if (activeDropdown === menu) {
 activeDropdown = null;
 } else {
 activeDropdown = menu;
 showUserDropdown = false;
 }
 }

 function closeAllDropdowns() {
 activeDropdown = null;
 showUserDropdown = false;
 showSearchDropdown = false;
 }

 // ===== KIẾN TRÚC PHÂN TÁCH NGHIỆP VỤ (BUSINESS DOMAIN MENU + SUB-MENU + HUB CARDS) =====
 let showBusinessHubCards = $state(false);
 let selectedHubDomainId = $state(null);

 let businessDomains = $derived([
 {
 id: 'curriculum',
 label: 'Lộ Trình & Lớp Học',
 shortLabel: 'Lộ Trình',
 icon: '🏠',
 href: '/',
 matchPaths: ['/', '/courses', '/truong-hoc', '/hall-of-fame', '/bang-gia', '/recruitment'],
 badge: 'K12 & IELTS',
 desc: 'Chương trình học Tiểu học, THCS, THPT, IELTS & Bảng vàng học viên',
 subMenus: [
 { label: '🌟 Tổng Quan Lộ Trình', href: '/', icon: '🌟', desc: 'Trang chủ & Chọn vai trò học tập' },
 { label: '🎒 Tiểu Học (Lớp 1–5)', href: '/?tab=primary', icon: '🎒', desc: 'Phonics, Starters, Movers, Flyers' },
 { label: '🌱 THCS (Lớp 6–9)', href: '/?tab=secondary', icon: '🌱', desc: 'Global Success, KET/PET & Vào 10' },
 { label: '🏢 THPT & Ôn Đại Học', href: '/?tab=high_school', icon: '🏢', desc: 'Lớp 10–12 & Tốt nghiệp THPT QG' },
 { label: '🌍 IELTS & Quốc Tế', href: '/?tab=certificate', icon: '🌍', desc: 'IELTS Academic 4 Kỹ Năng & TOEIC' },
 { label: '📚 19 Khóa Học Chi Tiết', href: '/courses', icon: '📚', desc: 'Danh mục toàn bộ giáo trình học' },
 { label: '🏆 Bảng Vàng Thành Tích', href: '/hall-of-fame', icon: '🏆', desc: 'Vinh danh học viên xuất sắc' },
 { label: '💰 Bảng Giá & Ưu Đãi Sao', href: '/bang-gia', icon: '💰', desc: 'Học phí minh bạch & Quy đổi Sao' }
 ]
 },
 {
 id: 'quiz',
 label: 'Quiz & Ngân Hàng Đề',
 shortLabel: 'Quiz Menu',
 icon: '🧩',
 href: '/quiz-menu',
 matchPaths: ['/quiz-menu'],
 badge: '1,375+ Câu',
 desc: 'Menu chuyên biệt cho làm bài Quiz, tạo đề AI tự động, kho D1 và giao BTVN',
 subMenus: [
 { label: '▶ Làm Bài Quiz Công Khai', href: '/quiz-menu?tab=take', icon: '▶', desc: 'Chọn thử thách 8 dạng bài tương tác' },
 { label: '📘 Quiz Tiểu Học (L1–5)', href: '/quiz-menu?tab=take&grade=tieu_hoc', icon: '📘', desc: 'Bộ bài tập từ vựng & phản xạ cấp 1' },
 { label: '📗 Quiz THCS (L6–9)', href: '/quiz-menu?tab=take&grade=thcs', icon: '📗', desc: 'Global Success & Ngữ pháp cấp 2' },
 { label: '📙 Quiz THPT & IELTS', href: '/quiz-menu?tab=take&grade=thpt', icon: '📙', desc: 'Luyện đề nâng cao cấp 3 & IELTS' },
 ...(isTeacherOrAdmin(currentUser) ? [
 { label: '⚡ Tạo Đề Quiz Tự Động (AI)', href: '/quiz-menu?tab=create&mode=auto', icon: '⚡', desc: 'Sinh đề từ File/OCR, Drive, D1 & Kho Tri Thức' },
 { label: '📚 Chọn Từ Kho Câu Hỏi D1', href: '/quiz-menu?tab=create&mode=auto&source=question_bank', icon: '📚', desc: 'Lọc & nhập trực tiếp từ 1,375+ câu hỏi D1' },
 { label: '✍️ Soạn Câu Hỏi Thủ Công', href: '/quiz-menu?tab=create&mode=manual', icon: '✍️', desc: 'Tự biên tập 8 dạng câu hỏi chi tiết' },
 { label: '▤ Kho Quiz Của Tôi & Giao BTVN', href: '/quiz-menu?tab=mine', icon: '▤', desc: 'Quản lý đề, đồng bộ DOCX & giao bài theo ca' }
 ] : []),
 ...(currentUser?.role === 'parent' ? [
 { label: '📊 Kết Quả Quiz Của Con', href: '/quiz-menu?tab=results', icon: '📊', desc: 'Theo dõi lịch sử & điểm số bài tập của con' }
 ] : [])
 ]
 },
 {
 id: 'exam',
 label: 'Phòng Thi Số',
 shortLabel: 'Phòng Thi',
 icon: '⏱️',
 href: '/exam',
 matchPaths: ['/exam'],
 badge: 'Chuẩn 2026',
 desc: 'Phòng thi kiểm tra 15p, 45p, IELTS 4 kỹ năng, tạo đề ngẫu nhiên & chấm điểm theo ca',
 subMenus: [
 { label: '🎒 Đề Thi Phổ Thông K12', href: '/exam?group=k12', icon: '🎒', desc: 'Đề kiểm tra từ Lớp 1 đến Lớp 12' },
 { label: '⚡ Kiểm Tra Nhanh 15 Phút', href: '/exam?group=periodic&cat=quick_15m', icon: '⚡', desc: 'Đề kiểm tra thường xuyên 15 phút' },
 { label: '📝 Kiểm Tra 1 Tiết 45 Phút', href: '/exam?group=periodic&cat=standard_45m', icon: '📝', desc: 'Đề kiểm tra định kỳ 45 phút chuẩn' },
 { label: '🌍 Thi Thử IELTS / TOEIC', href: '/exam?group=intl&cat=ielts', icon: '🌍', desc: 'Phòng thi chứng chỉ quốc tế 4 kỹ năng' },
 { label: '🎲 Tạo Đề Ngẫu Nhiên D1', href: '/exam?group=random_builder', icon: '🎲', desc: 'Sinh đề mới 5p • 15p • 45p không trùng lặp' },
 { label: '🧭 Test Xếp Lớp 3 Phút', href: '/exam#placement', icon: '🧭', desc: 'Đánh giá nhanh trình độ CEFR miễn phí' },
 ...(isTeacherOrAdmin(currentUser) ? [
 { label: '👩‍🏫 Điều Phối & Chấm Theo Ca', href: '/exam?panel=attendance_grading', icon: '👩‍🏫', desc: 'Gán thí sinh có mặt & chấm nhanh cả lớp' }
 ] : [])
 ]
 },
 {
 id: 'schedule',
 label: 'Điểm Danh & Lịch Học',
 shortLabel: 'Điểm Danh',
 icon: '📋',
 href: '/schedule',
 matchPaths: ['/schedule'],
 badge: 'Zalo 10p',
 desc: 'Sổ điểm danh trực tiếp, thời khóa biểu 7 ngày × 3 ca, tự động nhắc phụ huynh đưa đón',
 subMenus: [
 { label: '📋 Bảng Điểm Danh Nhanh', href: '/schedule?view=rollcall', icon: '📋', desc: 'Điểm danh 1 chạm các ca học & gửi Zalo tức thời' },
 { label: '📅 Lịch Học Tuần (7 Ngày × 3 Ca)', href: '/schedule?view=calendar', icon: '📅', desc: 'Thời khóa biểu trực quan Sáng / Chiều / Tối' },
 { label: '📚 Danh Sách Ca & Giao BTVN', href: '/schedule?view=sessions', icon: '📚', desc: 'Chi tiết sĩ số, gắn BTVN & đối soát từng buổi' },
 ...(isTeacherOrAdmin(currentUser) ? [
 { label: '🔔 Cảnh Báo Leader & Nhắc Lịch', href: '/schedule?view=alerts', icon: '🔔', desc: 'Gom toàn bộ thẻ cảnh báo lịch học, điểm danh & học phí' },
 { label: '📊 Đối Soát Chất Lượng Ca Dạy', href: '/session-audit', icon: '📊', desc: 'Kiểm tra giáo án, Drive & tỷ lệ hoàn thành BTVN' }
 ] : [])
 ]
 },
 {
 id: 'tools',
 label: 'Học Liệu & Công Cụ',
 shortLabel: 'Học Liệu',
 icon: '🛠️',
 href: '/tools',
 matchPaths: ['/tools', '/dictionary', '/flashcards', '/games', '/grammar', '/second-brain', '/drive', '/pedagogy'],
 badge: 'SRS & AI',
 desc: 'Từ điển Cambridge, Flashcards 3D, Game từ vựng, Ngữ pháp 12 thì & Kho Tri Thức',
 subMenus: [
 { label: '🧰 Trung Tâm Công Cụ Học Tập', href: '/tools', icon: '🧰', desc: 'Tổng hợp toàn bộ công cụ luyện tập đa giác quan' },
 { label: '📖 Từ Điển Cambridge & IPA', href: '/dictionary', icon: '📖', desc: 'Tra từ vựng, phát âm chuẩn bản ngữ & ví dụ' },
 { label: '🃏 Flashcards 3D (SRS)', href: '/flashcards', icon: '🃏', desc: 'Ôn tập ngắt quãng nhớ lâu theo chủ đề' },
 { label: '🎮 Đấu Trường Game Từ Vựng', href: '/games', icon: '🎮', desc: 'Speed Match, Word Scramble & tích Sao đổi quà' },
 { label: '📐 Ngữ Pháp 12 Thì & Cú Pháp', href: '/grammar', icon: '📐', desc: 'Công thức, dấu hiệu nhận biết & sơ đồ tư duy' },
 ...(isTeacherOrAdmin(currentUser) ? [
 { label: '🧠 Kho Tri Thức (Second Brain)', href: '/second-brain', icon: '🧠', desc: 'Học liệu Obsidian & Giáo án chuyên đề' },
 { label: '📁 Kho Tài Liệu Google Drive', href: '/drive', icon: '📁', desc: 'Đồng bộ tài liệu DOCX/PDF chuẩn hóa Tiếng Việt' },
 { label: '👨‍🏫 Sư Phạm & Giáo Án 5512', href: '/pedagogy', icon: '👨‍🏫', desc: 'Quy chuẩn sư phạm & phương pháp Co-Teaching' }
 ] : [])
 ]
 },
 {
 id: 'admin_ai',
 label: isTeacherOrAdmin(currentUser) ? 'Đối Soát AI & Quản Trị' : 'Đánh Giá & Hồ Sơ',
 shortLabel: isTeacherOrAdmin(currentUser) ? 'Quản Trị & AI' : 'Báo Cáo',
 icon: isTeacherOrAdmin(currentUser) ? '🤖' : '📈',
 href: isTeacherOrAdmin(currentUser) ? '/langflow' : '/evaluations',
 matchPaths: ['/langflow', '/session-audit', '/evaluations', '/admincp', '/admin', '/cpanel', '/app', '/install'],
 badge: isTeacherOrAdmin(currentUser) ? 'CRAG D1' : 'CEFR',
 desc: isTeacherOrAdmin(currentUser)
 ? 'Đối soát AI Langflow CRAG, Zalo Bot, Chất lượng buổi dạy, Học phí VietQR & AdminCP'
 : 'Báo cáo đánh giá năng lực 5 kỹ năng chuẩn CEFR, Sổ liên lạc & Ứng dụng Mobile R10',
 subMenus: isTeacherOrAdmin(currentUser)
 ? [
 { label: '🔬 Langflow CRAG & Zalo Bot', href: '/langflow', icon: '🔬', desc: 'Kiểm thử AI Agent, Auto-Notify & Đối soát D1' },
 { label: '📊 Đối Soát Chất Lượng Buổi Học', href: '/session-audit', icon: '📊', desc: 'Audit 100% ca dạy, tài liệu & mức độ phù hợp' },
 { label: '👑 AdminCP Quản Trị Nhân Sự', href: '/admincp', icon: '👑', desc: 'Duyệt tài khoản, phân quyền & cấu hình hệ thống' },
 { label: '💰 Học Phí VietQR & SePay', href: '/admin', icon: '💰', desc: 'Quản lý hóa đơn học phí, đổi Sao & Webhook Zalo' },
 { label: '🏫 Bàn Điều Hành CPanel', href: '/cpanel', icon: '🏫', desc: 'Không gian làm việc chuyên biệt theo vai trò' },
 { label: '📈 Đánh Giá Năng Lực CEFR', href: '/evaluations', icon: '📈', desc: 'Hồ sơ năng lực 5 kỹ năng của toàn bộ học viên' },
 { label: '📱 App Mobile & APK DOOGEE R10', href: '/app', icon: '📱', desc: 'Giao diện máy tính bảng R10 & bộ cài APK' }
 ]
 : [
 { label: '📈 Đánh Giá Năng Lực CEFR', href: '/evaluations', icon: '📈', desc: 'Biểu đồ tiến bộ 5 kỹ năng & nhận xét của Cô Dung' },
 { label: '🏫 Bàn Học Tập / Sổ Liên Lạc', href: currentUser?.role === 'parent' ? '/cpanel/parent' : '/cpanel/student', icon: '🏫', desc: 'Theo dõi lịch học, bài tập, điểm thi & học phí' },
 { label: '📱 Mở Giao Diện App Mobile', href: '/app', icon: '📱', desc: 'Trải nghiệm ứng dụng LingoNest trên điện thoại/tablet' },
 { label: '⬇️ Cài Đặt APK (DOOGEE R10)', href: '/install', icon: '⬇️', desc: 'Tải file APK chính thức & kiểm tra chữ ký SHA-256' }
 ]
 }
 ]);

 let activeBusinessDomain = $derived.by(() => {
 const path = $page.url.pathname;
 for (const dom of businessDomains) {
 if (dom.id === 'curriculum' && path === '/') return dom;
 if (dom.id !== 'curriculum' && dom.matchPaths.some((p) => path === p || path.startsWith(p + '/'))) {
 return dom;
 }
 if (dom.id === 'curriculum' && dom.matchPaths.some((p) => p !== '/' && (path === p || path.startsWith(p + '/')))) {
 return dom;
 }
 }
 return businessDomains[0];
 });

 let displayedHubDomain = $derived(
 businessDomains.find((d) => d.id === selectedHubDomainId) || activeBusinessDomain
 );

 function isSubMenuItemActive(itemHref) {
 const currentPath = $page.url.pathname;
 const currentSearch = typeof window !== 'undefined' ? window.location.search : '';
 const fullCurrent = currentPath + currentSearch;
 if (itemHref === fullCurrent) return true;
 const [itemPath, itemQuery] = itemHref.split('?');
 if (itemPath !== currentPath) return false;
 if (!itemQuery) return currentSearch === '';
 if (typeof window === 'undefined') return false;
 const itemParams = new URLSearchParams(itemQuery);
 const pageParams = new URLSearchParams(currentSearch);
 for (const [k, v] of itemParams.entries()) {
 if (pageParams.get(k) !== v) return false;
 }
 return true;
 }
</script>

<svelte:head>
 {#if $page.data?.seo?.title}
 <title>{$page.data.seo.title}</title>
 <meta name="description" content={$page.data.seo.description} />
 <meta property="og:title" content={$page.data.seo.title} />
 <meta property="og:description" content={$page.data.seo.description} />
 <meta name="twitter:title" content={$page.data.seo.title} />
 <meta name="twitter:description" content={$page.data.seo.description} />
 {:else}
 <title>Tiếng Anh Cô Dung - Hệ Thống Đào Tạo K12 &amp; Lộ Trình Quốc Tế</title>
 <meta name="description" content="Hệ thống đào tạo tiếng Anh chuẩn K12 và lộ trình quốc tế Cambridge, IELTS cùng học liệu Obsidian Second Brain và phòng thi số hóa." />
 <meta property="og:title" content="Tiếng Anh Cô Dung - Hệ Thống Đào Tạo K12 & Lộ Trình Quốc Tế" />
 <meta property="og:description" content="Đào tạo Tiếng Anh chuẩn K12 & Lộ trình quốc tế - Hệ thống học vụ, bài giảng số hóa và kho tri thức Obsidian." />
 <meta name="twitter:title" content="Tiếng Anh Cô Dung" />
 <meta name="twitter:description" content="Hệ thống đào tạo K12 & Lộ trình quốc tế" />
 {/if}
 <link rel="canonical" href={`https://timbk.io.vn${$page.url.pathname}`} />
 <meta property="og:url" content={`https://timbk.io.vn${$page.url.pathname}`} />
 <meta property="og:type" content="website" />
 <meta property="og:site_name" content="Tiếng Anh Cô Dung" />
 <meta property="og:locale" content="vi_VN" />
 <meta property="og:image" content="https://timbk.io.vn/og-image.png" />
 <meta property="og:image:width" content="1200" />
 <meta property="og:image:height" content="630" />
 <meta property="og:image:alt" content="Tiếng Anh Cô Dung — Trung Tâm Tiếng Anh K12 & IELTS" />
 <meta name="twitter:card" content="summary_large_image" />
 <meta name="twitter:image" content="https://timbk.io.vn/og-image.png" />
 {#if $page.url.pathname.startsWith('/cpanel') || $page.url.pathname.startsWith('/admin') || $page.url.pathname.startsWith('/langflow') || $page.url.pathname.startsWith('/session-audit') || $page.url.pathname.startsWith('/teacher') || $page.url.pathname.startsWith('/second-brain') || $page.url.pathname.startsWith('/schedule') || $page.url.pathname.startsWith('/evaluations') || $page.url.pathname.startsWith('/quiz-menu') || $page.url.pathname.startsWith('/drive') || $page.url.pathname.startsWith('/offline')}
 <meta name="robots" content="noindex, nofollow" />
 {:else}
 <meta name="robots" content="index, follow" />
 {/if}
 {@html `<script type="application/ld+json">${JSON.stringify({
 "@context": "https://schema.org",
 "@graph": [
 {
 "@type": "EducationalOrganization",
 "@id": "https://timbk.io.vn/#org",
 "name": "Tiếng Anh Cô Dung",
 "url": "https://timbk.io.vn",
 "logo": "https://timbk.io.vn/og-image.png",
 "description": "Hệ thống đào tạo tiếng Anh chuẩn K12 và lộ trình quốc tế Cambridge, IELTS tại Việt Nam."
 },
 {
 "@type": "WebSite",
 "@id": "https://timbk.io.vn/#website",
 "url": "https://timbk.io.vn",
 "name": "Tiếng Anh Cô Dung",
 "publisher": { "@id": "https://timbk.io.vn/#org" },
 "inLanguage": "vi-VN"
 },
 ...($page.url.pathname !== '/' ? [{
 "@type": "BreadcrumbList",
 "itemListElement": [
 { "@type": "ListItem", "position": 1, "name": "Trang chủ", "item": "https://timbk.io.vn/" },
 { "@type": "ListItem", "position": 2, "name": $page.data?.seo?.title?.split('|')[0]?.trim() || $page.url.pathname, "item": `https://timbk.io.vn${$page.url.pathname}` }
 ]
 }] : [])
 ]
})}</script>`}
</svelte:head>

<!-- Global Click Backdrop for Dropdowns -->
{#if activeDropdown || showUserDropdown || showSearchDropdown}
 <button
 type="button"
 class="fixed inset-0 z-30 bg-transparent cursor-default"
 onclick={closeAllDropdowns}
 aria-label="Close menu"
 ></button>
{/if}

<div class="min-h-screen flex flex-col bg-transparent text-ink-900 font-sans transition-colors duration-250">
 <!-- Global Sticky Topbar: Brand Identity (Left) + Global Search Bar (Center) + Status & Profile Group (Right) -->
 <header
 data-testid="global-topbar"
 class="sticky top-0 z-50 bg-surface-0/95 backdrop-blur-xl border-b border-line shadow-2xs transition-colors duration-250 w-full"
 style="padding-top: env(safe-area-inset-top);"
 >
 <div class="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8">
 <div class="flex items-center justify-between h-15 gap-2 sm:gap-4 min-w-0">

 <!-- 1. Left: Brand Logo -->
 <a href="/" onclick={closeAllDropdowns} class="flex items-center gap-2.5 group shrink-0">
 <div class="w-9 h-9 rounded-xl bg-brand-600 flex items-center justify-center text-white text-lg border-2 border-brand-700 shadow-2xs group-hover:scale-105 transition-transform duration-200 shrink-0">
 👩‍🏫
 </div>
 <div class="hidden sm:block">
 <div class="flex items-center gap-1.5">
 <span class="font-extrabold text-sm tracking-tight text-ink-900 whitespace-nowrap">
 Tiếng Anh Cô Dung
 </span>
 <span class="hidden lg:inline-block text-[10px] font-extrabold px-2 py-0.5 rounded-md bg-brand-50 text-brand-700 border border-brand-200 whitespace-nowrap">
 2026 CTGDPT
 </span>
 </div>
 <span class="hidden lg:block text-[11px] text-ink-500 font-medium -mt-0.5 whitespace-nowrap">Hệ thống K12 &amp; Lộ trình Quốc tế</span>
 </div>
 </a>

 <!-- 2. Center: Global Search Box (Ô Tìm Kiếm Nhanh) -->
 <div class="relative flex-1 max-w-md xl:max-w-lg mx-1 sm:mx-2 z-40" data-testid="global-search-container">
 <div class="relative flex items-center">
 <span class="absolute left-3 text-ink-500 text-xs pointer-events-none">🔍</span>
 <input
 bind:this={searchInputRef}
 id="global-search-input"
 data-testid="global-search-input"
 type="search"
 bind:value={globalSearchQuery}
 onfocus={() => { showSearchDropdown = true; showUserDropdown = false; }}
 onkeydown={(e) => {
 if (e.key === 'Enter' && filteredSearchItems.length > 0) {
 e.preventDefault();
 const targetHref = filteredSearchItems[0].href;
 showSearchDropdown = false;
 window.location.href = targetHref;
 }
 }}
 placeholder="Tìm nhanh khóa học, đề thi, ngữ pháp, lịch học... (Ctrl+K)"
 class="w-full pl-8 pr-16 py-1.5 rounded-xl bg-surface-1 hover:bg-surface-0 focus:bg-surface-0 border-2 border-stone-200/90 focus:border-brand-600 text-xs font-medium text-ink-900 placeholder:text-ink-500 transition-all shadow-2xs"
 />
 {#if globalSearchQuery}
 <button
 type="button"
 onclick={() => { globalSearchQuery = ''; searchInputRef?.focus(); }}
 class="absolute right-2.5 px-1.5 py-0.5 rounded-md bg-stone-200/80 hover:bg-stone-300 text-ink-900 text-[10px] font-bold"
 aria-label="Xóa tìm kiếm"
 >
 ✕
 </button>
 {:else}
 <kbd class="hidden sm:inline-flex absolute right-2.5 px-1.5 py-0.5 rounded-md bg-surface-0 border border-stone-300 text-[10px] font-mono text-ink-500 pointer-events-none">
 Ctrl K
 </kbd>
 {/if}
 </div>

 {#if showSearchDropdown}
 <div
 data-testid="global-search-dropdown"
 class="absolute left-0 right-0 mt-2 rounded-2xl bg-surface-0 border-2 border-brand-600/80 shadow-2xl p-2.5 z-50 max-h-[72vh] overflow-y-auto animate-in fade-in zoom-in-95 duration-150"
 >
 <div class="flex items-center justify-between px-2 pb-2 mb-1.5 border-b border-line text-[11px] font-bold text-ink-500">
 <span>{globalSearchQuery.trim() ? `Kết quả cho "${globalSearchQuery}"` : '⚡ Truy cập nhanh các phân hệ'}</span>
 <span class="text-[10px] text-brand-700 font-semibold">{filteredSearchItems.length} mục</span>
 </div>

 {#if filteredSearchItems.length === 0}
 <div class="py-6 text-center text-xs text-ink-500">
 Không tìm thấy mục phù hợp. Thử tìm <a href="/dictionary" onclick={() => showSearchDropdown = false} class="text-brand-700 font-bold underline">Từ điển</a> hoặc <a href="/courses" onclick={() => showSearchDropdown = false} class="text-brand-700 font-bold underline">Khóa học</a>.
 </div>
 {:else}
 <div class="space-y-1">
 {#each filteredSearchItems as item}
 <a
 href={item.href}
 onclick={() => { showSearchDropdown = false; globalSearchQuery = ''; }}
 class="flex items-center justify-between gap-3 p-2 rounded-xl hover:bg-brand-50/80 border border-transparent hover:border-brand-300 transition-all group"
 >
 <div class="flex items-center gap-2.5 min-w-0">
 <span class="w-8 h-8 rounded-xl bg-surface-1 group-hover:bg-surface-0 border border-line group-hover:border-brand-400 flex items-center justify-center text-base shrink-0">
 {item.icon}
 </span>
 <div class="min-w-0">
 <div class="text-xs font-extrabold text-ink-900 group-hover:text-brand-700 truncate">{item.title}</div>
 <div class="text-[11px] text-ink-500 truncate">{item.desc}</div>
 </div>
 </div>
 <span class="px-2 py-0.5 rounded-md bg-surface-1 group-hover:bg-brand-100 text-[10px] font-bold text-ink-500 group-hover:text-brand-800 shrink-0">
 {item.category}
 </span>
 </a>
 {/each}
 </div>
 {/if}
 </div>
 {/if}
 </div>

 <!-- 3. Right: Group Trạng Thái & Hồ Sơ (Status Group) -->
 <div data-testid="topbar-status-group" class="flex items-center gap-1.5 sm:gap-2 shrink-0 relative z-40">
 <!-- Theme Switcher -->
 <ThemeSwitcher />

 <!-- Universal Notification Bell -->
 {#if currentUser}
 <button
 type="button"
 onclick={() => showNotificationModal = true}
 class="relative w-8 h-8 sm:w-9 sm:h-9 rounded-xl border border-line bg-surface-1 text-ink-500 hover:text-brand-600 hover:border-brand-600 flex items-center justify-center text-sm transition-all"
 title="Thông Báo Học Vụ &amp; Hoạt Động"
 aria-label="Thông Báo Học Vụ"
 >
 <span>🔔</span>
 {#if userUnreadCount > 0}
 <span class="absolute -top-1 -right-1 px-1.5 py-0.2 rounded-full bg-rose-600 text-[10px] font-extrabold text-white shadow-xs ring-1 ring-white">
 {userUnreadCount > 9 ? '9+' : userUnreadCount}
 </span>
 {/if}
 </button>
 {/if}

 <!-- Student Star Badge -->
 {#if currentUser?.role === 'student'}
 <div class="hidden sm:flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-amber-50 border border-amber-200 text-amber-800 text-xs font-extrabold shadow-2xs">
 <span>⭐</span>
 <span class="tabular-nums">{(studentStars?.stars_balance || 5000).toLocaleString('vi-VN')}</span>
 </div>
 {/if}

 <!-- User Profile / Login Button -->
 <div class="relative">
 {#if currentUser}
 <button
 type="button"
 id="user-profile-btn"
 data-testid="user-profile-btn"
 onclick={() => { showUserDropdown = !showUserDropdown; activeDropdown = null; showSearchDropdown = false; }}
 class="flex items-center gap-1.5 p-1 sm:px-2.5 sm:py-1 rounded-xl bg-surface-1 border-2 border-brand-600/70 hover:border-brand-600 transition-all text-left text-xs shadow-2xs"
 >
 <img
 src={currentUser.avatar && !currentUser.avatar.includes('photo-1534528741775-53994a69daeb') ? currentUser.avatar : '/icon.svg'}
 onerror={(e) => { e.currentTarget.onerror = null; e.currentTarget.src = '/icon.svg'; }}
 alt="avatar"
 class="w-6 h-6 sm:w-7 sm:h-7 rounded-full object-cover ring-2 {isSuperAdmin(currentUser) ? 'ring-amber-400' : currentUser.role === 'teacher' ? 'ring-emerald-400' : currentUser.role === 'parent' ? 'ring-purple-400' : 'ring-brand-600'}"
 />
 <div class="hidden md:block">
 <div class="font-extrabold text-ink-900 truncate max-w-[125px] leading-tight flex items-center gap-1">
 {#if isSuperAdmin(currentUser)}
 <span title="SuperAdmin Tối Cao">👑</span>
 {:else if currentUser.role === 'teacher'}
 <span>👨‍🏫</span>
 {:else if currentUser.role === 'parent'}
 <span>👨‍👩‍👧</span>
 {:else}
 <span>🎒</span>
 {/if}
 {currentUser.name}
 </div>
 <div class="text-[10px] uppercase font-extrabold tracking-wider truncate max-w-[125px] {isSuperAdmin(currentUser) ? 'text-amber-700' : currentUser.role === 'teacher' ? 'text-teal-700' : currentUser.role === 'parent' ? 'text-purple-700' : 'text-brand-700'}">
 {currentUserRoleLabel}
 </div>
 </div>
 <span class="text-ink-500 text-[10px] hidden sm:inline">▼</span>
 </button>
 {:else}
 <button
 type="button"
 id="login-btn"
 data-testid="login-btn"
 onclick={openAuthModal}
 class="flex items-center justify-center px-3.5 py-1.5 rounded-xl bg-brand-600 hover:bg-brand-700 border border-brand-700 text-white font-extrabold text-xs shadow-xs transition-all whitespace-nowrap"
 >
 <span>Đăng nhập</span>
 </button>
 {/if}

 <!-- User Info & Action Menu -->
 {#if showUserDropdown && currentUser}
 <div class="absolute right-0 mt-2 w-72 rounded-2xl bg-surface-0 border-2 border-brand-600/80 shadow-2xl p-3 z-50 animate-in fade-in zoom-in-95 duration-150">
 <div class="flex items-center gap-3 pb-3 border-b border-line">
 <img
 src={currentUser.avatar && !currentUser.avatar.includes('photo-1534528741775-53994a69daeb') ? currentUser.avatar : '/icon.svg'}
 onerror={(e) => { e.currentTarget.onerror = null; e.currentTarget.src = '/icon.svg'; }}
 alt=""
 class="w-11 h-11 rounded-full object-cover ring-2 ring-brand-600 flex-shrink-0"
 />
 <div class="flex-1 min-w-0">
 <div class="font-extrabold text-sm text-ink-900 truncate flex items-center gap-1">
 {#if isSuperAdmin(currentUser)}👑{/if} {currentUser.name}
 </div>
 <div class="text-[11px] text-brand-600 font-mono">@{currentUser.username || 'user'}</div>
 <div class="mt-1 flex flex-wrap items-center gap-1 text-[11px]">
 <span class="px-2 py-0.5 rounded font-semibold {isSuperAdmin(currentUser) ? 'bg-amber-100 text-amber-800' : currentUser.role === 'teacher' ? 'bg-teal-100 text-teal-800' : currentUser.role === 'parent' ? 'bg-purple-100 text-purple-800' : 'bg-brand-50 text-brand-700'}">
 {currentUserRoleLabel}
 </span>
 {#if currentUser.status === 'trial' || currentUser.approval_status === 'trial'}
 <span class="px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-700 font-semibold uppercase text-[11px]">
 Trial
 </span>
 {/if}
 </div>
 {#if currentUser.phone}
 <div class="text-[11px] text-ink-500 font-medium flex items-center gap-1 mt-1">
 <span>📞</span> <span>{currentUser.phone}</span>
 </div>
 {/if}
 </div>
 </div>

 <div class="py-2 space-y-1">
 {#if isSuperAdmin(currentUser) || currentUser.role === 'leader'}
 <a
 href="/admincp"
 onclick={() => showUserDropdown = false}
 class="w-full flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-extrabold bg-amber-50 text-amber-800 hover:bg-amber-100 transition-all border border-amber-200"
 >
 <span>⚡</span>
 <span>Admin CP Quản Trị User &amp; Role (/admincp)</span>
 </a>
 <a
 href="/cpanel/leader"
 onclick={() => showUserDropdown = false}
 class="w-full flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-extrabold bg-emerald-50 text-emerald-800 hover:bg-emerald-100 transition-all border border-emerald-200"
 >
 <span>👑</span>
 <span>Bàn Điều Hành Leader (/cpanel/leader)</span>
 </a>
 <a
 href="/admin"
 onclick={() => showUserDropdown = false}
 class="w-full flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-extrabold bg-cyan-50 text-cyan-800 hover:bg-cyan-100 transition-all border border-cyan-200"
 >
 <span>💰</span>
 <span>Báo Học Phí, Đổi Sao &amp; Zalo Bot (/admin)</span>
 </a>
 {:else if currentUser.role === 'teacher'}
 <a
 href="/cpanel/teacher"
 onclick={() => showUserDropdown = false}
 class="w-full flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-extrabold bg-teal-50 text-teal-800 hover:bg-teal-100 transition-all border border-teal-200"
 >
 <span>👩‍🏫</span>
 <span>CPanel Giáo Viên &amp; Giao BTVN (/cpanel/teacher)</span>
 </a>
 <a
 href="/session-audit"
 onclick={() => showUserDropdown = false}
 class="w-full flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-extrabold bg-emerald-50 text-emerald-800 hover:bg-emerald-100 transition-all border border-emerald-200"
 >
 <span>📊</span>
 <span>Đối Soát Chất Lượng Ca Dạy (/session-audit)</span>
 </a>
 {:else if currentUser.role === 'parent'}
 <a
 href="/cpanel/parent"
 onclick={() => showUserDropdown = false}
 class="w-full flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-extrabold bg-purple-50 text-purple-800 hover:bg-purple-100 transition-all border border-purple-200"
 >
 <span>👨‍👩‍👧</span>
 <span>CPanel Sổ Liên Lạc Phụ Huynh (/cpanel/parent)</span>
 </a>
 {:else}
 <a
 href="/cpanel/student"
 onclick={() => showUserDropdown = false}
 class="w-full flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-extrabold bg-cyan-50 text-cyan-800 hover:bg-cyan-100 transition-all border border-cyan-200"
 >
 <span>🎒</span>
 <span>CPanel Bàn Học Tập Học Sinh (/cpanel/student)</span>
 </a>
 {/if}

 <button
 type="button"
 onclick={() => { showUserDropdown = false; showProfileModal = true; }}
 class="w-full flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-semibold text-brand-700 hover:bg-surface-1 transition-all text-left"
 >
 <span>✏️</span>
 <span>Chỉnh Sửa Hồ Sơ &amp; Zalo</span>
 </button>

 <button
 type="button"
 onclick={openAuthModal}
 class="w-full flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-semibold text-ink-500 hover:text-ink-900 hover:bg-surface-1 transition-all text-left"
 >
 <span>🔄</span>
 <span>Đổi Tài Khoản / Đăng Nhập Khác</span>
 </button>

 <button
 type="button"
 id="logout-btn"
 data-testid="logout-btn"
 onclick={handleLogout}
 class="w-full flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-extrabold text-rose-600 hover:bg-rose-50 transition-all text-left"
 >
 <span>🚪</span>
 <span>Đăng Xuất Khỏi Thiết Bị</span>
 </button>
 </div>

 <div class="pt-2 border-t border-line px-1 text-[11px] text-ink-500 font-medium flex justify-between items-center">
 <span>Hệ Thống Tiếng Anh Cô Dung</span>
 <span class="text-brand-600 font-semibold">timbk.io.vn</span>
 </div>
 </div>
 {/if}
 </div>

 <!-- Mobile Menu Toggle Button -->
 <button
 type="button"
 id="mobile-menu-btn"
 data-testid="mobile-menu-btn"
 onclick={() => mobileMenuOpen = !mobileMenuOpen}
 class="md:hidden p-1.5 sm:p-2 rounded-xl bg-surface-1 border border-line text-ink-500 hover:text-ink-900 transition-colors"
 aria-label="Toggle Menu"
 >
 <span class="text-base">{mobileMenuOpen ? '✕' : '☰'}</span>
 </button>
 </div>
 </div>

 <!-- Mobile Navigation Drawer -->
 {#if mobileMenuOpen}
 <div id="mobile-drawer" data-testid="mobile-drawer" class="lg:hidden py-4 border-t border-line space-y-4 animate-in slide-in-from-top-2 duration-150 max-h-[82vh] overflow-y-auto">
 <!-- Section 1: Khóa Học & Lộ Trình -->
 <div class="space-y-1.5">
 <div class="text-xs font-bold uppercase tracking-wider text-ink-500 px-1">
 📚 Lộ Trình &amp; Khóa Học
 </div>
 {#if currentUser?.role === 'student'}
 <a
 href="/"
 onclick={() => mobileMenuOpen = false}
 class="flex items-center justify-between p-3 rounded-lg bg-emerald-50 text-emerald-800 text-xs font-semibold border border-emerald-300/60"
 >
 <div class="flex items-center gap-2">
 <span class="text-base">🎓</span>
 <span>Khóa Học Của Tôi: {currentUserGrade || 'Chưa có lớp'}</span>
 </div>
 <span class="text-[11px] px-2 py-0.5 rounded bg-emerald-200 uppercase font-semibold">Đang Học</span>
 </a>
 {:else}
 <div class="grid grid-cols-2 gap-2">
 <a
 href="/?tab=primary"
 onclick={() => mobileMenuOpen = false}
 class="flex items-center gap-2 p-2.5 rounded-md bg-surface-1 text-ink-900 text-xs font-semibold"
 >
 <span>🎒</span> <span>Tiểu Học (L1-5)</span>
 </a>
 <a
 href="/?tab=secondary"
 onclick={() => mobileMenuOpen = false}
 class="flex items-center gap-2 p-2.5 rounded-md bg-surface-1 text-ink-900 text-xs font-semibold"
 >
 <span>🌱</span> <span>THCS (L6-9)</span>
 </a>
 <a
 href="/?tab=high_school"
 onclick={() => mobileMenuOpen = false}
 class="flex items-center gap-2 p-2.5 rounded-md bg-surface-1 text-ink-900 text-xs font-semibold"
 >
 <span>🏢</span> <span>THPT &amp; ĐH</span>
 </a>
 <a
 href="/?tab=certificate"
 onclick={() => mobileMenuOpen = false}
 class="flex items-center gap-2 p-2.5 rounded-md bg-surface-1 text-ink-900 text-xs font-semibold"
 >
 <span>🌍</span> <span>IELTS / TOEIC</span>
 </a>
 </div>

 <div class="pt-1 space-y-1.5">
 <a
 href="/courses"
 onclick={() => mobileMenuOpen = false}
 class="flex items-center justify-between p-2 rounded-md bg-brand-50 text-brand-700 text-xs font-bold hover:bg-brand-50 transition-colors"
 >
 <span>📚 Xem Toàn Bộ 19 Khóa Học K12</span>
 <span>➔</span>
 </a>
 <div class="grid grid-cols-3 gap-1.5">
 <a
 href="/truong-hoc"
 onclick={() => mobileMenuOpen = false}
 class="flex items-center justify-center gap-1 p-2 rounded-md bg-surface-1 text-ink-900 text-[11px] font-semibold"
 >
 <span>🏫</span> <span>Trường Học</span>
 </a>
 <a
 href="/hall-of-fame"
 onclick={() => mobileMenuOpen = false}
 class="flex items-center justify-center gap-1 p-2 rounded-md bg-surface-1 text-ink-900 text-[11px] font-semibold"
 >
 <span>🏆</span> <span>Bảng Vàng</span>
 </a>
 <a
 href="/recruitment"
 onclick={() => mobileMenuOpen = false}
 class="flex items-center justify-center gap-1 p-2 rounded-md bg-surface-1 text-ink-900 text-[11px] font-semibold"
 >
 <span>🤝</span> <span>Tuyển Dụng</span>
 </a>
 </div>
 </div>
 {/if}
 </div>

 <!-- Section 2: Lộ Trình & Học Tập -->
 <div class="space-y-1.5">
 <div class="text-xs font-bold uppercase tracking-wider text-ink-500 px-1">
 ⏱️ Phòng Thi &amp; Học Tập Đa Giác Quan
 </div>
 <div class="grid grid-cols-2 gap-2">
 <a
 href="/exam"
 onclick={() => mobileMenuOpen = false}
 class="flex items-center gap-2 p-2.5 rounded-md bg-surface-1 text-ink-900 text-xs font-semibold"
 >
 <span>⏱️</span> <span>Phòng Thi &amp; 15p</span>
 </a>
 <a
 href="/dictionary"
 onclick={() => mobileMenuOpen = false}
 class="flex items-center gap-2 p-2.5 rounded-md bg-surface-1 text-ink-900 text-xs font-semibold"
 >
 <span>📖</span> <span>Từ Điển Phonics</span>
 </a>
 <a
 href="/grammar"
 onclick={() => mobileMenuOpen = false}
 class="flex items-center gap-2 p-2.5 rounded-md bg-teal-50 text-teal-800 text-xs font-semibold"
 >
 <span>📐</span> <span>Ngữ Pháp Cốt Lõi</span>
 </a>
 <a
 href="/flashcards"
 onclick={() => mobileMenuOpen = false}
 class="flex items-center gap-2 p-2.5 rounded-md bg-surface-1 text-ink-900 text-xs font-semibold"
 >
 <span>🗂️</span> <span>Flashcard 3D</span>
 </a>
 <a
 href="/games"
 onclick={() => mobileMenuOpen = false}
 class="col-span-2 flex items-center justify-between p-2.5 rounded-md bg-purple-50 text-purple-800 text-xs font-semibold border border-purple-200/50"
 >
 <div class="flex items-center gap-2">
 <span>🎮</span> <span>Đấu Trường Game Từ Vựng</span>
 </div>
 <span class="text-[11px] px-2 py-0.5 rounded bg-purple-200 uppercase font-semibold">Speed Match</span>
 </a>
 <a
 href="/quiz-menu"
 onclick={() => mobileMenuOpen = false}
 class="col-span-2 flex items-center justify-between p-2.5 rounded-md bg-rose-50 text-rose-800 text-xs font-semibold border border-rose-200/50"
 >
 <div class="flex items-center gap-2">
 <span>📝</span> <span>Quiz - Làm Bài & Ôn Tập</span>
 </div>
 <span class="text-[11px] px-2 py-0.5 rounded bg-rose-200 uppercase font-semibold">Public</span>
 </a>
 </div>

 <div class="pt-1">
 <a
 href="/tools"
 onclick={() => mobileMenuOpen = false}
 class="flex items-center justify-between p-2 rounded-md bg-brand-50 text-brand-700 text-xs font-bold hover:bg-brand-50 transition-colors"
 >
 <span>🛠️ Xem Tất Cả Công Cụ Học Tập</span>
 <span>➔</span>
 </a>
 </div>
 </div>

 <!-- Section 3: Tiện Ích & Liên Lạc -->
 <div class="space-y-1.5">
 <div class="text-xs font-bold uppercase tracking-wider text-ink-500 px-1">
 📅 Lịch Học &amp; Gia Đình
 </div>
 <div class="grid grid-cols-2 gap-2">
 <a
 href="/schedule"
 onclick={() => mobileMenuOpen = false}
 class="flex items-center gap-2 p-2.5 rounded-md bg-indigo-50 text-indigo-800 text-xs font-semibold"
 >
 <span>📅</span> <span>Thời Khóa Biểu</span>
 </a>
 {#if currentUser?.role === 'parent' || isSuperAdmin(currentUser)}
 <a
 href="/?tab=parent"
 onclick={() => mobileMenuOpen = false}
 class="flex items-center gap-2 p-2.5 rounded-md bg-purple-50 text-purple-800 text-xs font-semibold"
 >
 <span>👨‍👩‍👧</span> <span>Sổ Phụ Huynh</span>
 </a>
 {:else if currentUser?.role === 'teacher'}
 <a
 href="/schedule"
 onclick={() => mobileMenuOpen = false}
 class="flex items-center gap-2 p-2.5 rounded-md bg-teal-50 text-teal-800 text-xs font-semibold"
 >
 <span>👨‍🏫</span> <span>Sổ Giáo Viên</span>
 </a>
 {/if}
 </div>
 </div>

 <!-- Section 4: Dành Riêng Cho Leader & Giáo Viên (Chỉ Admin / Teacher mới thấy) -->
 {#if isTeacherOrAdmin(currentUser)}
 <div class="pt-3 border-t border-line space-y-2">
 <div class="text-xs font-semibold uppercase tracking-wider text-amber-700 px-1 flex items-center gap-1">
 <span>👑</span> <span>Khu Vực Quản Trị &amp; Sư Phạm</span>
 </div>

 <button
 onclick={() => { mobileMenuOpen = false; showLeaderDrawer = true; }}
 class="w-full flex items-center justify-between p-3 rounded-lg bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-semibold shadow-xs"
 >
 <div class="flex items-center gap-2">
 <span>🔔</span>
 <span>Trung Tâm Báo Cáo Leader (Cô Dung)</span>
 </div>
 {#if leaderUnreadCount > 0}
 <span class="px-2 py-0.5 rounded bg-rose-600 text-xs font-semibold">
 {leaderUnreadCount} mới
 </span>
 {/if}
 </button>

 <div class="grid grid-cols-2 gap-2">
 <a
 href="/admin"
 onclick={() => mobileMenuOpen = false}
 class="flex items-center gap-2 p-2.5 rounded-md bg-amber-500/15 text-amber-800 text-xs font-semibold border border-amber-500/30"
 >
 <span>⚙️</span> <span>Admin CP</span>
 </a>
 <a
 href="/second-brain"
 onclick={() => mobileMenuOpen = false}
 class="flex items-center gap-2 p-2.5 rounded-md bg-teal-500/15 text-teal-800 text-xs font-semibold border border-teal-500/30"
 >
 <span>🧠</span> <span>Second Brain</span>
 </a>
 <a
 href="/evaluations"
 onclick={() => mobileMenuOpen = false}
 class="flex items-center gap-2 p-2.5 rounded-md bg-surface-1 text-ink-900 text-xs font-semibold"
 >
 <span>📊</span> <span>Đánh Giá Năng Lực</span>
 </a>
 <a
 href="/pedagogy"
 onclick={() => mobileMenuOpen = false}
 class="flex items-center gap-2 p-2.5 rounded-md bg-surface-1 text-ink-900 text-xs font-semibold"
 >
 <span>👨‍🏫</span> <span>Giáo Án 5512</span>
 </a>
 </div>
 </div>
 {/if}

 <!-- Section 5: Ứng Dụng & Cập Nhật Mạng (OTA) -->
 <div class="pt-3 border-t border-line space-y-2">
 <div class="text-xs font-semibold uppercase tracking-wider text-ink-500 px-1 flex items-center justify-between">
 <span class="flex items-center gap-1">
 <span>📶</span> <span>Ứng Dụng &amp; Cập Nhật Mạng</span>
 </span>
 <span class="text-[10px] font-mono text-ink-400">v{$appUpdateState.currentVersion}</span>
 </div>

 <button
 id="mobile-update-btn"
 data-testid="mobile-update-btn"
 onclick={() => { mobileMenuOpen = false; checkForUpdate(true); }}
 class="w-full min-h-[44px] flex items-center justify-between p-3 rounded-lg bg-surface-1 hover:bg-surface-2 border border-line text-ink-900 text-xs font-semibold shadow-xs transition-colors"
 >
 <div class="flex items-center gap-2">
 {#if $appUpdateState.status === 'checking'}
 <span class="animate-spin text-emerald-600">⏳</span>
 <span>Đang kiểm tra cập nhật...</span>
 {:else if $appUpdateState.status === 'latest'}
 <span class="text-emerald-600">✅</span>
 <span>Đã ở phiên bản mới nhất</span>
 {:else if $appUpdateState.status === 'available'}
 <span class="text-emerald-600">⚡</span>
 <span class="font-bold text-emerald-800">Có bản cập nhật mới!</span>
 {:else if $appUpdateState.status === 'offline'}
 <span class="text-rose-600">⚠️</span>
 <span>Ngoại tuyến (chạm để thử lại)</span>
 {:else if $appUpdateState.status === 'updating'}
 <span class="animate-spin text-emerald-600">🔄</span>
 <span>Đang cập nhật hệ thống...</span>
 {:else if $appUpdateState.status === 'restart_needed'}
 <span class="text-emerald-600">🔄</span>
 <span class="font-bold text-emerald-800">Cần mở lại ứng dụng</span>
 {:else}
 <span>📶</span>
 <span>Kiểm tra cập nhật qua mạng</span>
 {/if}
 </div>

 <div class="flex items-center gap-1.5">
 {#if $appUpdateState.status === 'available'}
 <span class="px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 text-[10px] font-bold">Mới</span>
 {:else if $appUpdateState.status === 'restart_needed'}
 <span class="px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 text-[10px] font-bold">Mở lại</span>
 {/if}
 <span class="text-ink-400">➔</span>
 </div>
 </button>

 <div class="grid grid-cols-2 gap-2 pt-1">
 <a
 href="/downloads/tienganhcodung-latest.apk"
 download="tienganhcodung-latest.apk"
 onclick={() => mobileMenuOpen = false}
 class="min-h-[44px] flex items-center justify-center gap-1.5 p-2.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-extrabold shadow-xs"
 >
 <span>⬇️</span> <span>Tải APK v2.2.0 (R10)</span>
 </a>
 <a
 href="/install"
 onclick={() => mobileMenuOpen = false}
 class="min-h-[44px] flex items-center justify-center gap-1.5 p-2.5 rounded-lg bg-surface-1 hover:bg-surface-2 border border-line text-ink-900 text-xs font-bold"
 >
 <span>🔐</span> <span>Trang Cài Đặt R10</span>
 </a>
 </div>
 </div>
 </div>
 {/if}
 </div>
 </header>

 <!-- Main Content Body -->
 <main class="flex-1 w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
 {#if currentUser?.status === 'trial' || currentUser?.approval_status === 'trial'}
 <div class="mb-5 p-4 rounded-lg bg-amber-50 border border-amber-300 text-amber-900 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-xs animate-in slide-in-from-top-1 duration-200">
 <div class="flex items-center gap-3">
 <div class="w-9 h-9 rounded-md bg-amber-500/20 border border-amber-500/40 text-amber-700 flex items-center justify-center text-lg font-semibold">
 ⏳
 </div>
 <div>
 <div class="text-xs font-semibold flex items-center gap-2">
 <span>Tài Khoản Đang Ở Chế Độ Dùng Thử (Trial)</span>
 <span class="px-2 py-0.5 rounded bg-amber-500/20 text-amber-800 text-[11px] font-semibold uppercase border border-amber-500/30">Chờ duyệt chính thức</span>
 </div>
 <div class="text-[11px] text-ink-500 mt-0.5">
 Bạn có thể làm bài luyện thi 15p - 45p, xem bài giảng <strong>{currentUserGrade || 'lớp đã chọn'}</strong>. Sau khi Admin / Cô Dung duyệt, tài khoản sẽ được nâng lên Chính Thức để tích lũy Sao đổi học phí!
 </div>
 </div>
 </div>
 <div class="flex items-center gap-2 flex-shrink-0">
 <a
 href="https://zalo.me/0905960437"
 target="_blank"
 rel="noopener noreferrer"
 class="px-3.5 py-1.5 rounded-md bg-amber-700 hover:bg-amber-600 text-white font-semibold text-xs shadow-xs transition-all flex items-center gap-1.5"
 >
 <span>💬 Báo Zalo Cô Dung Duyệt Ngay</span>
 </a>
 </div>
 </div>
 {/if}

 {@render children()}
 </main>

 <!-- Footer -->
 <footer class="bg-surface-0 border-t border-line pt-8 pb-8 mt-auto text-xs text-ink-500 transition-colors duration-200">
 <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col md:flex-row items-center justify-between gap-4">
 <div class="flex items-center gap-3">
 <div class="w-8 h-8 rounded-md bg-brand-700 flex items-center justify-center text-white font-semibold text-sm">
 CD
 </div>
 <div>
 <div class="font-semibold text-ink-900">Tiếng Anh Cô Dung — Hệ Thống Lộ Trình &amp; Đào Tạo Toàn Diện 2026</div>
 <div class="text-[11px] text-ink-500 font-medium">
 Chương trình GDPT 2018 (Lớp 1-12) • Ôn thi THPT Quốc Gia • IELTS Cambridge • Co-Teaching Bản Ngữ
 </div>
 </div>
 </div>
 <div class="flex flex-wrap items-center justify-center md:justify-end gap-x-3 gap-y-1.5 text-[11px] lg:pr-28">
 <span class="text-emerald-700 flex items-center gap-1 font-semibold">
 <span class="w-2 h-2 rounded-full bg-emerald-500"></span>
 Hệ thống hoạt động ổn định
 </span>
 <span class="text-stone-300">•</span>
 <a href="/courses" class="hover:text-brand-600 font-semibold text-ink-900">19 Khóa học</a>
 <span class="text-stone-300">•</span>
 <a href="/truong-hoc" class="hover:text-brand-600 font-semibold text-ink-900">Về Trường Học</a>
 <span class="text-stone-300">•</span>
 <a href="/hall-of-fame" class="hover:text-brand-600 font-semibold text-ink-900">Bảng Vàng CEFR</a>
 <span class="text-stone-300">•</span>
 <a href="/bang-gia" class="hover:text-brand-600 font-semibold text-ink-900">Bảng Học Phí</a>
 <span class="text-stone-300">•</span>
 <a href="/recruitment" class="hover:text-brand-600 font-semibold text-ink-900">Tuyển Dụng GV</a>
 <span class="text-stone-300">•</span>
 <a href="/downloads/tienganhcodung-latest.apk" download="tienganhcodung-latest.apk" class="hover:text-emerald-700 font-bold text-emerald-700 flex items-center gap-1">
 <span>⬇️</span> <span>Tải APK Android (R10)</span>
 </a>
 <span class="text-stone-300">•</span>
 <a href="/install" class="hover:text-brand-600 font-semibold text-brand-700">Cài đặt R10</a>
 <span class="text-stone-300">•</span>
 <a href="/evaluations" class="hover:text-brand-600">Đánh giá học sinh</a>
 <span class="text-stone-300">•</span>
 <a href="/pedagogy" class="hover:text-brand-600">Giáo án 5512</a>
 <span class="text-stone-300">•</span>
 <button
 onclick={() => showTourModal = true}
 class="hover:text-brand-600 flex items-center gap-1 font-semibold text-ink-500 transition-colors"
 title="Xem giới thiệu hệ thống và tầm nhìn sư phạm"
 >
 <span>❓</span> <span>Hướng Dẫn &amp; Tầm Nhìn</span>
 </button>
 <span class="text-stone-300">•</span>
 <button
 id="footer-update-btn"
 data-testid="footer-update-btn"
 type="button"
 onclick={() => checkForUpdate(true)}
 class="hover:text-brand-600 flex items-center gap-1 font-semibold text-brand-700 min-h-[44px]"
 title="Kiểm tra bản cập nhật ứng dụng qua mạng"
 >
 <span>📶</span> <span>Cập Nhật Ứng Dụng (Mạng)</span>
 </button>
 </div>
 </div>
 </footer>

 <!-- Global Layout-Pushing Dockbar (Desktop) + Mobile BottomNav + Floating Zalo -->
 <DockBar {currentUser} {currentUserGrade} />
 <BottomNav />
 <ZaloCta />
 <ThemeStudio />
 <PersonalThemeModal bind:isOpen={showPersonalThemeModal} />

 <!-- Mandatory Login & Register Gate / Modal -->
 <AuthModal bind:isOpen={showAuthModal} {canDismiss} />

 <!-- User Profile Edit Modal -->
 <ProfileEditModal bind:isOpen={showProfileModal} />

 <!-- Pedagogical Vision & Role Tour Modal -->
 <OnboardingTourModal bind:isOpen={showTourModal} {currentUser} />

 <!-- Direct In-App WiFi OTA APK Updater -->
 <ApkOtaUpdater bind:this={apkUpdaterRef} />

 <!-- Leader Notification Drawer (Cô Dung) -->
 <LeaderNotificationDrawer bind:isOpen={showLeaderDrawer} onClose={() => showLeaderDrawer = false} />

 <!-- Universal Role-based Notification Center Modal -->
 <NotificationCenterModal bind:isOpen={showNotificationModal} on:read={() => loadUserNotificationsCount()} />

 <!-- Seasonal & Campaign Marketing Popup (Halloween 2026 & Cambridge Campaigns) -->
 <HalloweenMarketingPopup />
</div>
