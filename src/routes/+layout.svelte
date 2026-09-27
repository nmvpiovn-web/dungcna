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
    toggleTheme,
    getStudentStars,
    getUnreadLeaderNotificationCount,
    scanScheduleAndAttendanceForLeader,
    scanTuitionDueAlerts,
    SUPERADMIN_EMAILS,
    verifySessionWithServer,
    hasPersistedToken
  } from '$lib/unifiedStore';
  import AuthModal from '$lib/components/AuthModal.svelte';
  import ProfileEditModal from '$lib/components/ProfileEditModal.svelte';
  import ApkOtaUpdater from '$lib/components/ApkOtaUpdater.svelte';
  import LeaderNotificationDrawer from '$lib/components/LeaderNotificationDrawer.svelte';
  import NotificationCenterModal from '$lib/components/NotificationCenterModal.svelte';

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
  let leaderUnreadCount = $state(0);
  let userUnreadCount = $state(0);
  let canDismiss = $state(false);
  let studentStars = $state(null);

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

  onMount(() => {
    allUsers = getAllUsers();
    currentUser = getCurrentUser();
    currentTheme = getTheme();
    setTheme(currentTheme);

    if (currentUser?.role === 'student') {
      studentStars = getStudentStars(currentUser.id);
    }

    // Initialize Leader unread notifications count
    leaderUnreadCount = getUnreadLeaderNotificationCount();

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
          showAuthModal = true;
          canDismiss = false;
        } else {
          currentUser = res.user;
          showAuthModal = false;
          loadUserNotificationsCount();
        }
      });
    } else {
      currentUser = null;
      showAuthModal = true;
      canDismiss = false;
    }

    const handleAuthEvent = (e) => {
      currentUser = e.detail;
      if (!currentUser) {
        showAuthModal = true;
        canDismiss = false;
        studentStars = null;
        userUnreadCount = 0;
      } else {
        if (currentUser.role === 'student') {
          studentStars = getStudentStars(currentUser.id);
        }
        loadUserNotificationsCount();
      }
      leaderUnreadCount = getUnreadLeaderNotificationCount();
    };

    const handleThemeEvent = (e) => {
      currentTheme = e.detail;
    };

    const handleLeaderNotifEvent = () => {
      leaderUnreadCount = getUnreadLeaderNotificationCount();
    };

    window.addEventListener('tienganh:auth-change', handleAuthEvent);
    window.addEventListener('tienganh:theme-change', handleThemeEvent);
    window.addEventListener('tienganh:leader-notifications-change', handleLeaderNotifEvent);
    window.addEventListener('tienganh:leader-notification-new', handleLeaderNotifEvent);

    return () => {
      clearInterval(scanTimer);
      window.removeEventListener('tienganh:auth-change', handleAuthEvent);
      window.removeEventListener('tienganh:theme-change', handleThemeEvent);
      window.removeEventListener('tienganh:leader-notifications-change', handleLeaderNotifEvent);
      window.removeEventListener('tienganh:leader-notification-new', handleLeaderNotifEvent);
    };
  });

  function handleThemeToggle() {
    currentTheme = toggleTheme();
  }

  function handleLogout() {
    showUserDropdown = false;
    logoutUser();
    currentUser = null;
    showAuthModal = true;
    canDismiss = false;
  }

  function openAuthModal() {
    showUserDropdown = false;
    showAuthModal = true;
    canDismiss = !!currentUser;
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
  }
</script>

<svelte:head>
  <title>Tiếng Anh Cô Dung - Hệ Thống Đào Tạo K12 &amp; Khảo Thí Quốc Tế</title>
  <meta name="description" content="Hệ thống đào tạo tiếng Anh chuẩn K12 và khảo thí quốc tế Cambridge, IELTS cùng học liệu Obsidian Second Brain và phòng thi số hóa." />
  <link rel="canonical" href={`https://timbk.io.vn${$page.url.pathname}`} />
  <meta property="og:url" content={`https://timbk.io.vn${$page.url.pathname}`} />
  <meta property="og:type" content="website" />
  <meta property="og:title" content="Tiếng Anh Cô Dung - Hệ Thống Đào Tạo K12 &amp; Khảo Thí Quốc Tế" />
  <meta property="og:description" content="Đào tạo Tiếng Anh chuẩn K12 &amp; Khảo thí quốc tế - Hệ thống học vụ, bài giảng số hóa và kho tri thức Obsidian." />
  <meta property="og:image" content="https://timbk.io.vn/icon.svg" />
  <meta name="twitter:card" content="summary" />
  <meta name="twitter:title" content="Tiếng Anh Cô Dung" />
  <meta name="twitter:description" content="Hệ thống đào tạo K12 &amp; Khảo thí quốc tế" />
  {#if $page.url.pathname.startsWith('/cpanel') || $page.url.pathname.startsWith('/admin') || $page.url.pathname.startsWith('/second-brain')}
    <meta name="robots" content="noindex, nofollow" />
  {:else}
    <meta name="robots" content="index, follow" />
  {/if}
</svelte:head>

<!-- Global Click Backdrop for Dropdowns -->
{#if activeDropdown || showUserDropdown}
  <button
    type="button"
    class="fixed inset-0 z-30 bg-transparent cursor-default"
    onclick={closeAllDropdowns}
    aria-label="Close menu"
  ></button>
{/if}

<div class="min-h-screen flex flex-col bg-transparent text-slate-800 dark:text-slate-100 font-sans transition-colors duration-250">
  <!-- Top Navigation Header -->
  <header class="sticky top-0 z-40 bg-white/95 dark:bg-slate-900/95 backdrop-blur-md border-b border-slate-200 dark:border-slate-800 shadow-xs transition-colors duration-250 w-full">
    <div class="max-w-7xl mx-auto px-2 sm:px-6 lg:px-8">
      <div class="flex items-center justify-between h-16 gap-2 sm:gap-3 min-w-0">
        
        <!-- Brand Logo (Academic Ledger Style) -->
        <a href="/" onclick={closeAllDropdowns} class="flex items-center gap-2 sm:gap-3 group shrink min-w-0">
          <div class="w-8 h-8 sm:w-10 sm:h-10 rounded-lg bg-sky-700 flex items-center justify-center text-white text-base sm:text-xl border border-sky-800 shadow-xs group-hover:scale-105 transition-transform duration-200 shrink-0">
            👩‍🏫
          </div>
          <div class="min-w-0">
            <div class="flex items-center gap-1.5">
              <span class="font-semibold text-xs sm:text-base tracking-tight text-slate-900 dark:text-white truncate">
                Tiếng Anh Cô Dung
              </span>
              <span class="hidden 2xl:inline-block text-[11px] font-medium px-2 py-0.5 rounded bg-sky-50 text-sky-800 border border-sky-200 dark:bg-sky-950 dark:text-sky-300 dark:border-sky-800">
                2026 CTGDPT
              </span>
            </div>
            <span class="hidden xl:block text-[11px] text-slate-700 dark:text-slate-300 font-medium -mt-0.5">K12 &amp; Khảo Thí Chuẩn Quốc Tế</span>
          </div>
        </a>

        <!-- Desktop Navigation with Flyout Submenus -->
        <nav class="hidden lg:flex items-center gap-1 relative z-40">
          <!-- Item 1: Lộ Trình Đào Tạo Dropdown (Or Direct Student Course) -->
          {#if currentUser?.role === 'student'}
            <a
              href="/"
              onclick={closeAllDropdowns}
              class="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold tracking-wide transition-all bg-emerald-50 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300 border border-emerald-300/60 dark:border-emerald-800"
            >
              <span>🎓</span>
              <span>Lớp Của Tôi: {currentUserGrade || 'Lớp 7'}</span>
            </a>
          {:else}
            <div class="relative">
              <button
                onclick={() => toggleSubmenu('courses')}
                class="flex items-center gap-1 px-3 py-1.5 rounded-md text-xs font-semibold tracking-wide transition-all {activeDropdown === 'courses' ? 'bg-sky-50 text-sky-700 dark:bg-sky-950/60 dark:text-sky-300' : 'text-slate-700 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800'}"
              >
                <span>📚</span>
                <span>Lộ Trình</span>
                <span class="text-[11px] transition-transform duration-200 {activeDropdown === 'courses' ? 'rotate-180' : ''}">▾</span>
              </button>

              {#if activeDropdown === 'courses'}
                <div class="absolute left-0 mt-2 w-72 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xl p-2 z-50 animate-in fade-in zoom-in-95 duration-150">
                  <a
                    href="/?tab=primary"
                    onclick={closeAllDropdowns}
                    class="flex items-center gap-3 p-2.5 rounded-md hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors group"
                  >
                    <div class="w-8 h-8 rounded-md bg-emerald-100 dark:bg-emerald-900/50 text-emerald-700 dark:text-emerald-300 flex items-center justify-center text-sm font-semibold">
                      🎒
                    </div>
                    <div>
                      <div class="font-semibold text-xs text-slate-900 dark:text-white group-hover:text-sky-600 dark:group-hover:text-sky-400">Tiểu Học (Lớp 1 - 5)</div>
                      <div class="text-[11px] text-slate-600 dark:text-slate-300">Global Success, Phonics &amp; Âm Nhạc</div>
                    </div>
                  </a>

                  <a
                    href="/?tab=secondary"
                    onclick={closeAllDropdowns}
                    class="flex items-center gap-3 p-2.5 rounded-md hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors group"
                  >
                    <div class="w-8 h-8 rounded-md bg-teal-100 dark:bg-teal-900/50 text-teal-700 dark:text-teal-300 flex items-center justify-center text-sm font-semibold">
                      🌱
                    </div>
                    <div>
                      <div class="font-semibold text-xs text-slate-900 dark:text-white group-hover:text-sky-600 dark:group-hover:text-sky-400">THCS (Lớp 6 - 9)</div>
                      <div class="text-[11px] text-slate-600 dark:text-slate-300">Ngữ pháp cốt lõi, Cambridge KET/PET</div>
                    </div>
                  </a>

                  <a
                    href="/?tab=high_school"
                    onclick={closeAllDropdowns}
                    class="flex items-center gap-3 p-2.5 rounded-md hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors group"
                  >
                    <div class="w-8 h-8 rounded-md bg-indigo-100 dark:bg-indigo-900/50 text-indigo-700 dark:text-indigo-300 flex items-center justify-center text-sm font-semibold">
                      🏢
                    </div>
                    <div>
                      <div class="font-semibold text-xs text-slate-900 dark:text-white group-hover:text-sky-600 dark:group-hover:text-sky-400">THPT &amp; Ôn Thi ĐH (Lớp 10 - 12)</div>
                      <div class="text-[11px] text-slate-600 dark:text-slate-300">Bám sát cấu trúc đề thi 2026</div>
                    </div>
                  </a>

                  <a
                    href="/?tab=certificate"
                    onclick={closeAllDropdowns}
                    class="flex items-center gap-3 p-2.5 rounded-md hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors group"
                  >
                    <div class="w-8 h-8 rounded-md bg-amber-100 dark:bg-amber-900/50 text-amber-700 dark:text-amber-300 flex items-center justify-center text-sm font-semibold">
                      🌍
                    </div>
                    <div>
                      <div class="font-semibold text-xs text-slate-900 dark:text-white group-hover:text-sky-600 dark:group-hover:text-sky-400">IELTS • TOEIC • VSTEP</div>
                      <div class="text-[11px] text-slate-600 dark:text-slate-300">Khảo thí chuẩn Cambridge quốc tế</div>
                    </div>
                  </a>

                  <div class="pt-1.5 border-t border-slate-100 dark:border-slate-800/80 mt-1">
                    <a
                      href="/courses"
                      onclick={closeAllDropdowns}
                      class="flex items-center justify-between p-2 rounded-md bg-sky-50 dark:bg-sky-950/40 text-sky-700 dark:text-sky-300 text-xs font-bold hover:bg-sky-100 dark:hover:bg-sky-900/60 transition-colors"
                    >
                      <span>Xem Toàn Bộ 19 Khóa Học K12</span>
                      <span>➔</span>
                    </a>
                  </div>
                </div>
              {/if}
            </div>
          {/if}

          <!-- Item 2: Khảo Thí & Luyện Thi Dropdown -->
          <div class="relative">
            <button
              onclick={() => toggleSubmenu('exams')}
              class="flex items-center gap-1 px-3 py-1.5 rounded-md text-xs font-semibold tracking-wide transition-all {$page.url.pathname.startsWith('/exam') ? 'bg-sky-600 text-white shadow-xs' : activeDropdown === 'exams' ? 'bg-sky-50 text-sky-700 dark:bg-sky-950/60 dark:text-sky-300' : 'text-slate-700 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800'}"
            >
              <span>⏱️</span>
              <span>Phòng Thi</span>
              <span class="text-[11px] transition-transform duration-200 {activeDropdown === 'exams' ? 'rotate-180' : ''}">▾</span>
            </button>

            {#if activeDropdown === 'exams'}
              <div class="absolute left-0 mt-2 w-72 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xl p-2 z-50 animate-in fade-in zoom-in-95 duration-150">
                <a
                  href="/exam"
                  onclick={closeAllDropdowns}
                  class="flex items-center gap-3 p-2.5 rounded-md hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors group"
                >
                  <div class="w-8 h-8 rounded-md bg-red-100 dark:bg-red-900/50 text-red-700 dark:text-red-300 flex items-center justify-center text-sm font-semibold">
                    ⚡
                  </div>
                  <div>
                    <div class="font-semibold text-xs text-slate-900 dark:text-white group-hover:text-sky-600 dark:group-hover:text-sky-400">Test Nhanh 15 Phút</div>
                    <div class="text-[11px] text-slate-600 dark:text-slate-300">Kiểm tra miệng, từ vựng và phản xạ</div>
                  </div>
                </a>

                <a
                  href="/exam"
                  onclick={closeAllDropdowns}
                  class="flex items-center gap-3 p-2.5 rounded-md hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors group"
                >
                  <div class="w-8 h-8 rounded-md bg-indigo-100 dark:bg-indigo-900/50 text-indigo-700 dark:text-indigo-300 flex items-center justify-center text-sm font-semibold">
                    ⏱️
                  </div>
                  <div>
                    <div class="font-semibold text-xs text-slate-900 dark:text-white group-hover:text-sky-600 dark:group-hover:text-sky-400">Đề 1 Tiết 45 Phút Chuẩn Bộ</div>
                    <div class="text-[11px] text-slate-600 dark:text-slate-300">Ma trận đề thi học kỳ 2026</div>
                  </div>
                </a>

                <a
                  href="/exam"
                  onclick={closeAllDropdowns}
                  class="flex items-center gap-3 p-2.5 rounded-md hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors group"
                >
                  <div class="w-8 h-8 rounded-md bg-teal-100 dark:bg-teal-900/50 text-teal-700 dark:text-teal-300 flex items-center justify-center text-sm font-semibold">
                    🎙️
                  </div>
                  <div>
                    <div class="font-semibold text-xs text-slate-900 dark:text-white group-hover:text-sky-600 dark:group-hover:text-sky-400">Phòng Thi IELTS 4 Kỹ Năng</div>
                    <div class="text-[11px] text-slate-600 dark:text-slate-300">Nghe, Đọc, Viết &amp; Ghi âm Nói trực tiếp</div>
                  </div>
                </a>

                <div class="pt-1.5 border-t border-slate-100 dark:border-slate-800/80 mt-1">
                  <a
                    href="/exam"
                    onclick={closeAllDropdowns}
                    class="flex items-center justify-between p-2 rounded-md bg-sky-50 dark:bg-sky-950/40 text-sky-700 dark:text-sky-300 text-xs font-bold hover:bg-sky-100 dark:hover:bg-sky-900/60 transition-colors"
                  >
                    <span>Xem Tất Cả Bộ Đề Khảo Thí</span>
                    <span>➔</span>
                  </a>
                </div>
              </div>
            {/if}
          </div>

          <!-- Item 3: Học Tập & Công Cụ Dropdown -->
          <div class="relative">
            <button
              onclick={() => toggleSubmenu('tools')}
              class="flex items-center gap-1 px-3 py-1.5 rounded-md text-xs font-semibold tracking-wide transition-all {$page.url.pathname === '/dictionary' || $page.url.pathname === '/flashcards' || $page.url.pathname === '/games' || $page.url.pathname === '/grammar' || $page.url.pathname === '/pedagogy' ? 'bg-sky-600 text-white shadow-xs' : activeDropdown === 'tools' ? 'bg-sky-50 text-sky-700 dark:bg-sky-950/60 dark:text-sky-300' : 'text-slate-700 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800'}"
            >
              <span>🛠️</span>
              <span>Công Cụ</span>
              <span class="text-[11px] transition-transform duration-200 {activeDropdown === 'tools' ? 'rotate-180' : ''}">▾</span>
            </button>

            {#if activeDropdown === 'tools'}
              <div class="absolute left-0 mt-2 w-72 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xl p-2 z-50 animate-in fade-in zoom-in-95 duration-150">
                <a
                  href="/dictionary"
                  onclick={closeAllDropdowns}
                  class="flex items-center gap-3 p-2.5 rounded-md hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors group"
                >
                  <div class="w-8 h-8 rounded-md bg-blue-100 dark:bg-blue-900/50 text-blue-700 dark:text-blue-300 flex items-center justify-center text-sm font-semibold">
                    📖
                  </div>
                  <div>
                    <div class="font-semibold text-xs text-slate-900 dark:text-white group-hover:text-sky-600 dark:group-hover:text-sky-400">Từ Điển Cambridge &amp; Phonics</div>
                    <div class="text-[11px] text-slate-600 dark:text-slate-300">Tra cứu phát âm IPA, nguyên âm &amp; phụ âm</div>
                  </div>
                </a>

                <a
                  href="/flashcards"
                  onclick={closeAllDropdowns}
                  class="flex items-center gap-3 p-2.5 rounded-md hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors group"
                >
                  <div class="w-8 h-8 rounded-md bg-emerald-100 dark:bg-emerald-900/50 text-emerald-700 dark:text-emerald-300 flex items-center justify-center text-sm font-semibold">
                    🗂️
                  </div>
                  <div>
                    <div class="font-semibold text-xs text-slate-900 dark:text-white group-hover:text-sky-600 dark:group-hover:text-sky-400">Flashcard Ngữ Âm 3D</div>
                    <div class="text-[11px] text-slate-600 dark:text-slate-300">Ghi nhớ từ vựng đa giác quan</div>
                  </div>
                </a>

                <a
                  href="/games"
                  onclick={closeAllDropdowns}
                  class="flex items-center gap-3 p-2.5 rounded-md hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors group"
                >
                  <div class="w-8 h-8 rounded-md bg-purple-100 dark:bg-purple-900/50 text-purple-700 dark:text-purple-300 flex items-center justify-center text-sm font-semibold">
                    🎮
                  </div>
                  <div>
                    <div class="font-semibold text-xs text-slate-900 dark:text-white group-hover:text-sky-600 dark:group-hover:text-sky-400">Đấu Trường Trò Chơi</div>
                    <div class="text-[11px] text-slate-600 dark:text-slate-300">Speed Match &amp; Meteor Rush phản xạ</div>
                  </div>
                </a>

                <a
                  href="/grammar"
                  onclick={closeAllDropdowns}
                  class="flex items-center gap-3 p-2.5 rounded-md hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors group"
                >
                  <div class="w-8 h-8 rounded-md bg-teal-100 dark:bg-teal-900/50 text-teal-700 dark:text-teal-300 flex items-center justify-center text-sm font-semibold">
                    📐
                  </div>
                  <div>
                    <div class="font-semibold text-xs text-slate-900 dark:text-white group-hover:text-sky-600 dark:group-hover:text-sky-400">Chuyên Đề Ngữ Pháp &amp; Công Thức</div>
                    <div class="text-[11px] text-slate-600 dark:text-slate-300">14 chuyên đề toàn cấp K12, cạm bẫy &amp; bài tập</div>
                  </div>
                </a>

                {#if isTeacherOrAdmin(currentUser)}
                  <a
                    href="/pedagogy"
                    onclick={closeAllDropdowns}
                    class="flex items-center gap-3 p-2.5 rounded-md hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors group border-t border-slate-100 dark:border-slate-800/80"
                  >
                    <div class="w-8 h-8 rounded-md bg-amber-100 dark:bg-amber-900/50 text-amber-700 dark:text-amber-300 flex items-center justify-center text-sm font-semibold">
                      👨‍🏫
                    </div>
                    <div>
                      <div class="font-semibold text-xs text-slate-900 dark:text-white group-hover:text-sky-600 dark:group-hover:text-sky-400">Giáo Án 5512 &amp; Bản Ngữ</div>
                      <div class="text-[11px] text-slate-600 dark:text-slate-300">Mô hình Co-Teaching &amp; Học liệu nội bộ</div>
                    </div>
                  </a>
                {/if}

                <div class="pt-1.5 border-t border-slate-100 dark:border-slate-800/80 mt-1">
                  <a
                    href="/tools"
                    onclick={closeAllDropdowns}
                    class="flex items-center justify-between p-2 rounded-md bg-sky-50 dark:bg-sky-950/40 text-sky-700 dark:text-sky-300 text-xs font-bold hover:bg-sky-100 dark:hover:bg-sky-900/60 transition-colors"
                  >
                    <span>Xem Tất Cả Công Cụ Học Tập</span>
                    <span>➔</span>
                  </a>
                </div>
              </div>
            {/if}
          </div>

          <!-- Item 4: Thời Khóa Biểu & Điểm Danh (Direct Link) -->
          <a
            href="/schedule"
            onclick={closeAllDropdowns}
            class="flex items-center gap-1 px-3 py-1.5 rounded-md text-xs font-semibold tracking-wide transition-all {$page.url.pathname === '/schedule' ? 'bg-indigo-700 text-white shadow-xs' : 'text-slate-700 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800'}"
          >
            <span>📅</span>
            <span>Thời Khóa Biểu</span>
          </a>

          <!-- Role-based Portal Link: Sổ Phụ Huynh (parent only) / Sổ Giáo Viên (teacher only) -->
          {#if currentUser?.role === 'parent'}
            <a
              href="/?tab=parent"
              onclick={closeAllDropdowns}
              class="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold tracking-wide transition-all bg-purple-50 text-purple-700 dark:bg-purple-950/40 dark:text-purple-300 border border-purple-200 dark:border-purple-800 shadow-xs"
            >
              <span>👨‍👩‍👧</span>
              <span>Sổ Phụ Huynh</span>
            </a>
          {:else if currentUser?.role === 'teacher'}
            <a
              href="/schedule"
              onclick={closeAllDropdowns}
              class="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold tracking-wide transition-all bg-teal-50 text-teal-700 dark:bg-teal-950/40 dark:text-teal-300 border border-teal-200 dark:border-teal-800 shadow-xs"
            >
              <span>👨‍🏫</span>
              <span>Sổ Giáo Viên</span>
            </a>
          {/if}

          <!-- Item 6: Admin CP Dropdown (Only for Teacher / SuperAdmin - Contains Second Brain) -->
          {#if isTeacherOrAdmin(currentUser)}
            <div class="relative">
              <button
                onclick={() => toggleSubmenu('admin')}
                class="flex items-center gap-1 px-3 py-1.5 rounded-md text-xs font-semibold tracking-wide transition-all {$page.url.pathname.startsWith('/admin') || $page.url.pathname.startsWith('/second-brain') ? 'bg-amber-600 text-white shadow-xs' : activeDropdown === 'admin' ? 'bg-amber-50 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300' : 'text-amber-700 dark:text-amber-400 hover:bg-amber-50 dark:hover:bg-amber-950/30'}"
              >
                <span>⚙️</span>
                <span>Admin CP</span>
                <span class="text-[11px] transition-transform duration-200 {activeDropdown === 'admin' ? 'rotate-180' : ''}">▾</span>
              </button>

              {#if activeDropdown === 'admin'}
                <div class="absolute right-0 mt-2 w-72 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xl p-2 z-50 animate-in fade-in zoom-in-95 duration-150">
                  <a
                    href="/admin"
                    onclick={closeAllDropdowns}
                    class="flex items-center gap-3 p-2.5 rounded-md hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors group"
                  >
                    <div class="w-8 h-8 rounded-md bg-emerald-100 dark:bg-emerald-900/50 text-emerald-700 dark:text-emerald-300 flex items-center justify-center text-sm font-semibold">
                      💰
                    </div>
                    <div>
                      <div class="font-semibold text-xs text-slate-900 dark:text-white group-hover:text-sky-600 dark:group-hover:text-sky-400">Báo Học Phí &amp; Đổi Sao</div>
                      <div class="text-[11px] text-slate-600 dark:text-slate-300 font-medium">Khấu trừ 100 sao = 1.000đ, in PDF VietQR</div>
                    </div>
                  </a>

                  <!-- Obsidian Second Brain: Admin & Teacher Only -->
                  <a
                    href="/second-brain"
                    onclick={closeAllDropdowns}
                    class="flex items-center gap-3 p-2.5 rounded-md hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors group"
                  >
                    <div class="w-8 h-8 rounded-md bg-teal-100 dark:bg-teal-900/50 text-teal-700 dark:text-teal-300 flex items-center justify-center text-sm font-semibold">
                      🧠
                    </div>
                    <div>
                      <div class="font-semibold text-xs text-slate-900 dark:text-white group-hover:text-sky-600 dark:group-hover:text-sky-400">Obsidian Second Brain</div>
                      <div class="text-[11px] text-slate-600 dark:text-slate-300 font-medium">Kho tri thức &amp; WikiLinks Vault local</div>
                    </div>
                  </a>

                  <a
                    href="/evaluations"
                    onclick={closeAllDropdowns}
                    class="flex items-center gap-3 p-2.5 rounded-md hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors group"
                  >
                    <div class="w-8 h-8 rounded-md bg-purple-100 dark:bg-purple-900/50 text-purple-700 dark:text-purple-300 flex items-center justify-center text-sm font-semibold">
                      📊
                    </div>
                    <div>
                      <div class="font-semibold text-xs text-slate-900 dark:text-white group-hover:text-sky-600 dark:group-hover:text-sky-400">Đánh Giá Năng Lực Học Viên</div>
                      <div class="text-[11px] text-slate-600 dark:text-slate-300 font-medium">Phân tích 5 kỹ năng, báo cáo Zalo Bot</div>
                    </div>
                  </a>

                  <a
                    href="/schedule"
                    onclick={closeAllDropdowns}
                    class="flex items-center gap-3 p-2.5 rounded-md hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors group"
                  >
                    <div class="w-8 h-8 rounded-md bg-indigo-100 dark:bg-indigo-900/50 text-indigo-700 dark:text-indigo-300 flex items-center justify-center text-sm font-semibold">
                      📅
                    </div>
                    <div>
                      <div class="font-semibold text-xs text-slate-900 dark:text-white group-hover:text-sky-600 dark:group-hover:text-sky-400">Thời Khóa Biểu &amp; Điểm Danh</div>
                      <div class="text-[11px] text-slate-600 dark:text-slate-300 font-medium">Sổ đầu bài, thông báo đón con, phân quyền giáo viên</div>
                    </div>
                  </a>
                </div>
              {/if}
            </div>
          {/if}
        </nav>

        <!-- Right Side Controls: Theme Switcher, Star Counter & User Avatar -->
        <div class="flex items-center gap-1 sm:gap-2 shrink-0">
          <!-- Theme Switcher: Xanh Nhẹ / Sáng / Tối -->
          <button
            onclick={handleThemeToggle}
            class="h-8 w-8 sm:h-9 sm:w-auto p-1 sm:px-2.5 rounded-md border border-slate-200 dark:border-slate-800 bg-white/80 dark:bg-slate-800/80 text-slate-700 dark:text-slate-300 hover:text-sky-600 dark:hover:text-sky-400 flex items-center justify-center gap-1.5 text-xs font-semibold transition-all shadow-xs"
            title="Đổi Giao diện: Xanh Nhẹ (Sky) / Sáng / Tối"
            aria-label="Toggle Theme"
          >
            {#if currentTheme === 'sky'}
              <span>🩵</span>
              <span class="hidden sm:inline text-xs text-sky-700 dark:text-sky-300 font-semibold">Xanh Nhẹ</span>
            {:else if currentTheme === 'dark'}
              <span>🌙</span>
              <span class="hidden sm:inline text-xs text-slate-400 font-semibold">Tối</span>
            {:else}
              <span>☀️</span>
              <span class="hidden sm:inline text-xs text-amber-600 font-semibold">Sáng</span>
            {/if}
          </button>

          <!-- Universal Notification Bell (Cho mọi Role: Parent, Student, Teacher, Leader) -->
          {#if currentUser}
            <button
              onclick={() => showNotificationModal = true}
              class="relative w-8 h-8 sm:w-9 sm:h-9 rounded-md border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:text-sky-600 dark:hover:text-sky-400 flex items-center justify-center text-sm transition-all"
              title="Thông Báo Học Vụ & Hoạt Động"
              aria-label="Thông Báo Học Vụ"
            >
              <span>🔔</span>
              {#if userUnreadCount > 0}
                <span class="absolute -top-1 -right-1 px-1.5 py-0.2 rounded-md bg-rose-600 text-xs font-semibold text-white shadow-xs ring-1 ring-white dark:ring-slate-900">
                  {userUnreadCount > 9 ? '9+' : userUnreadCount}
                </span>
              {/if}
            </button>
          {/if}

          <!-- Leader PWA Notification Bell (Cô Dung & Ban Quản Lý) -->
          {#if isTeacherOrAdmin(currentUser)}
            <button
              onclick={() => showLeaderDrawer = true}
              class="relative w-8 h-8 sm:w-9 sm:h-9 rounded-md border border-emerald-300 dark:border-emerald-800/80 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-800 dark:text-emerald-300 hover:text-emerald-900 flex items-center justify-center text-sm transition-all"
              title="Trung Tâm Báo Cáo Leader (Cô Dung)"
              aria-label="Thông Báo Leader"
            >
              <span>🛡️</span>
              {#if leaderUnreadCount > 0}
                <span class="absolute -top-1 -right-1 px-1.5 py-0.2 rounded-md bg-emerald-700 text-xs font-semibold text-white shadow-xs ring-1 ring-white dark:ring-slate-900">
                  {leaderUnreadCount > 9 ? '9+' : leaderUnreadCount}
                </span>
              {/if}
            </button>
          {/if}

          <!-- Student Star Badge (If Student Logged In) -->
          {#if currentUser?.role === 'student'}
            <div class="hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 text-amber-800 dark:text-amber-300 text-xs font-semibold shadow-xs">
              <span>⭐</span>
              <span class="tabular-nums">{(studentStars?.stars_balance || 5000).toLocaleString('vi-VN')}</span>
              <span class="text-[11px] opacity-80 font-normal">(-{Math.floor((studentStars?.stars_balance || 5000) / 100 * 1000).toLocaleString('vi-VN')}đ)</span>
            </div>
          {/if}

          <!-- User Switcher Dropdown -->
          <div class="relative">
            {#if currentUser}
              <button
                onclick={() => { showUserDropdown = !showUserDropdown; activeDropdown = null; }}
                class="flex items-center gap-1 sm:gap-2 p-1 sm:px-2.5 sm:py-1.5 rounded-md bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:border-sky-500 transition-all text-left text-xs"
              >
                <img
                  src={currentUser.avatar || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=80'}
                  alt="avatar"
                  class="w-6 h-6 sm:w-7 sm:h-7 rounded-full object-cover ring-2 {isSuperAdmin(currentUser) ? 'ring-amber-400' : currentUser.role === 'teacher' ? 'ring-emerald-400' : currentUser.role === 'parent' ? 'ring-purple-400' : 'ring-sky-500'}"
                />
                <div class="hidden sm:block">
                  <div class="font-semibold text-slate-800 dark:text-slate-200 truncate max-w-[130px] leading-tight flex items-center gap-1">
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
                  <div class="text-[11px] uppercase font-semibold tracking-wider truncate max-w-[130px] {isSuperAdmin(currentUser) ? 'text-amber-600 dark:text-amber-400' : currentUser.role === 'teacher' ? 'text-teal-600 dark:text-teal-400' : currentUser.role === 'parent' ? 'text-purple-600 dark:text-purple-400' : 'text-sky-600 dark:text-sky-400'}">
                    {currentUserRoleLabel}
                  </div>
                </div>
                <span class="text-slate-400 text-[11px] hidden sm:inline">▼</span>
              </button>
            {:else}
              <button
                onclick={openAuthModal}
                class="flex items-center gap-1 sm:gap-1.5 px-2.5 sm:px-3 py-1.5 rounded-md bg-sky-600 hover:bg-sky-500 text-white font-semibold text-xs shadow-xs transition-all"
              >
                <span>🔑</span>
                <span class="hidden sm:inline">Đăng Nhập</span>
              </button>
            {/if}

            <!-- User Info & Action Menu -->
            {#if showUserDropdown && currentUser}
              <div class="absolute right-0 mt-2 w-72 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 shadow-xl p-3 z-50 animate-in fade-in zoom-in-95 duration-150">
                <div class="flex items-center gap-3 pb-3 border-b border-slate-100 dark:border-slate-800">
                  <img src={currentUser.avatar} alt="" class="w-11 h-11 rounded-full object-cover ring-2 ring-sky-500 flex-shrink-0" />
                  <div class="flex-1 min-w-0">
                    <div class="font-semibold text-sm text-slate-900 dark:text-white truncate flex items-center gap-1">
                      {#if isSuperAdmin(currentUser)}👑{/if} {currentUser.name}
                    </div>
                    <div class="text-[11px] text-sky-600 dark:text-sky-400 font-mono">@{currentUser.username || 'user'}</div>
                    <div class="mt-1 flex flex-wrap items-center gap-1 text-[11px]">
                      <span class="px-2 py-0.5 rounded font-semibold {isSuperAdmin(currentUser) ? 'bg-amber-100 text-amber-800 dark:bg-amber-900/50 dark:text-amber-300' : currentUser.role === 'teacher' ? 'bg-teal-100 text-teal-800 dark:bg-teal-900/50 dark:text-teal-300' : currentUser.role === 'parent' ? 'bg-purple-100 text-purple-800 dark:bg-purple-900/50 dark:text-purple-300' : 'bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-300'}">
                        {currentUserRoleLabel}
                      </span>
                      {#if currentUser.status === 'trial' || currentUser.approval_status === 'trial'}
                        <span class="px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-700 dark:text-amber-300 font-semibold uppercase text-[11px]">
                          Trial
                        </span>
                      {/if}
                    </div>
                    {#if currentUser.phone}
                      <div class="text-[11px] text-slate-600 dark:text-slate-300 font-medium flex items-center gap-1 mt-1">
                        <span>📞</span> <span>{currentUser.phone}</span>
                      </div>
                    {/if}
                  </div>
                </div>

                <div class="py-2 space-y-1">
                  {#if isSuperAdmin(currentUser)}
                    <a
                      href="/admin"
                      onclick={() => showUserDropdown = false}
                      class="w-full flex items-center gap-2 px-3 py-2 rounded-md text-xs font-semibold bg-amber-50 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300 hover:bg-amber-100 dark:hover:bg-amber-900/40 transition-all border border-amber-200 dark:border-amber-800"
                    >
                      <span>⚙️</span>
                      <span>Admin CP (Học Phí &amp; Quản Trị)</span>
                    </a>
                  {/if}

                  <button
                    onclick={() => { showUserDropdown = false; showProfileModal = true; }}
                    class="w-full flex items-center gap-2 px-3 py-2 rounded-md text-xs font-semibold text-sky-700 dark:text-sky-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-all text-left"
                  >
                    <span>✏️</span>
                    <span>Chỉnh Sửa Hồ Sơ &amp; Zalo</span>
                  </button>

                  <button
                    onclick={openAuthModal}
                    class="w-full flex items-center gap-2 px-3 py-2 rounded-md text-xs font-semibold text-slate-700 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 transition-all text-left"
                  >
                    <span>🔄</span>
                    <span>Đổi Tài Khoản / Đăng Nhập Khác</span>
                  </button>

                  <button
                    onclick={handleLogout}
                    class="w-full flex items-center gap-2 px-3 py-2 rounded-md text-xs font-semibold text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/30 transition-all text-left"
                  >
                    <span>🚪</span>
                    <span>Đăng Xuất Khỏi Thiết Bị</span>
                  </button>
                </div>

                <div class="pt-2 border-t border-slate-100 dark:border-slate-800 px-1 text-[11px] text-slate-600 dark:text-slate-300 font-medium flex justify-between items-center">
                  <span>Hệ Thống Tiếng Anh Cô Dung</span>
                  <span class="text-sky-600 dark:text-sky-400 font-semibold">PWA Active</span>
                </div>
              </div>
            {/if}
          </div>

          <!-- Mobile Menu Toggle Button -->
          <button
            onclick={() => mobileMenuOpen = !mobileMenuOpen}
            class="lg:hidden p-1.5 sm:p-2 rounded-md bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white transition-colors"
            aria-label="Toggle Menu"
          >
            <span class="text-base">{mobileMenuOpen ? '✕' : '☰'}</span>
          </button>
        </div>

      </div>

      <!-- Mobile Navigation Drawer -->
      {#if mobileMenuOpen}
        <div class="lg:hidden py-4 border-t border-slate-200 dark:border-slate-800 space-y-4 animate-in slide-in-from-top-2 duration-150 max-h-[82vh] overflow-y-auto">
          <!-- Section 1: Khóa Học & Lộ Trình -->
          <div class="space-y-1.5">
            <div class="text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300 px-1">
              📚 Lộ Trình &amp; Khóa Học
            </div>
            {#if currentUser?.role === 'student'}
              <a
                href="/"
                onclick={() => mobileMenuOpen = false}
                class="flex items-center justify-between p-3 rounded-lg bg-emerald-50 dark:bg-emerald-950/40 text-emerald-800 dark:text-emerald-300 text-xs font-semibold border border-emerald-300/60 dark:border-emerald-800"
              >
                <div class="flex items-center gap-2">
                  <span class="text-base">🎓</span>
                  <span>Khóa Học Của Tôi: {currentUserGrade || 'Lớp 7'}</span>
                </div>
                <span class="text-[11px] px-2 py-0.5 rounded bg-emerald-200 dark:bg-emerald-900/60 uppercase font-semibold">Đang Học</span>
              </a>
            {:else}
              <div class="grid grid-cols-2 gap-2">
                <a
                  href="/?tab=primary"
                  onclick={() => mobileMenuOpen = false}
                  class="flex items-center gap-2 p-2.5 rounded-md bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-slate-200 text-xs font-semibold"
                >
                  <span>🎒</span> <span>Tiểu Học (L1-5)</span>
                </a>
                <a
                  href="/?tab=secondary"
                  onclick={() => mobileMenuOpen = false}
                  class="flex items-center gap-2 p-2.5 rounded-md bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-slate-200 text-xs font-semibold"
                >
                  <span>🌱</span> <span>THCS (L6-9)</span>
                </a>
                <a
                  href="/?tab=high_school"
                  onclick={() => mobileMenuOpen = false}
                  class="flex items-center gap-2 p-2.5 rounded-md bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-slate-200 text-xs font-semibold"
                >
                  <span>🏢</span> <span>THPT &amp; ĐH</span>
                </a>
                <a
                  href="/?tab=certificate"
                  onclick={() => mobileMenuOpen = false}
                  class="flex items-center gap-2 p-2.5 rounded-md bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-slate-200 text-xs font-semibold"
                >
                  <span>🌍</span> <span>IELTS / TOEIC</span>
                </a>
              </div>

              <div class="pt-1">
                <a
                  href="/courses"
                  onclick={() => mobileMenuOpen = false}
                  class="flex items-center justify-between p-2 rounded-md bg-sky-50 dark:bg-sky-950/40 text-sky-700 dark:text-sky-300 text-xs font-bold hover:bg-sky-100 dark:hover:bg-sky-900/60 transition-colors"
                >
                  <span>📚 Xem Toàn Bộ 19 Khóa Học K12</span>
                  <span>➔</span>
                </a>
              </div>
            {/if}
          </div>

          <!-- Section 2: Khảo Thí & Học Tập -->
          <div class="space-y-1.5">
            <div class="text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300 px-1">
              ⏱️ Phòng Thi &amp; Học Tập Đa Giác Quan
            </div>
            <div class="grid grid-cols-2 gap-2">
              <a
                href="/exam"
                onclick={() => mobileMenuOpen = false}
                class="flex items-center gap-2 p-2.5 rounded-md bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-slate-200 text-xs font-semibold"
              >
                <span>⏱️</span> <span>Phòng Thi &amp; 15p</span>
              </a>
              <a
                href="/dictionary"
                onclick={() => mobileMenuOpen = false}
                class="flex items-center gap-2 p-2.5 rounded-md bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-slate-200 text-xs font-semibold"
              >
                <span>📖</span> <span>Từ Điển Phonics</span>
              </a>
              <a
                href="/grammar"
                onclick={() => mobileMenuOpen = false}
                class="flex items-center gap-2 p-2.5 rounded-md bg-teal-50 dark:bg-teal-950/50 text-teal-800 dark:text-teal-300 text-xs font-semibold"
              >
                <span>📐</span> <span>Ngữ Pháp Cốt Lõi</span>
              </a>
              <a
                href="/flashcards"
                onclick={() => mobileMenuOpen = false}
                class="flex items-center gap-2 p-2.5 rounded-md bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-slate-200 text-xs font-semibold"
              >
                <span>🗂️</span> <span>Flashcard 3D</span>
              </a>
              <a
                href="/games"
                onclick={() => mobileMenuOpen = false}
                class="col-span-2 flex items-center justify-between p-2.5 rounded-md bg-purple-50 dark:bg-purple-950/40 text-purple-800 dark:text-purple-300 text-xs font-semibold border border-purple-200/50 dark:border-purple-800/40"
              >
                <div class="flex items-center gap-2">
                  <span>🎮</span> <span>Đấu Trường Game Từ Vựng</span>
                </div>
                <span class="text-[11px] px-2 py-0.5 rounded bg-purple-200 dark:bg-purple-900/60 uppercase font-semibold">Speed Match</span>
              </a>
            </div>

            <div class="pt-1">
              <a
                href="/tools"
                onclick={() => mobileMenuOpen = false}
                class="flex items-center justify-between p-2 rounded-md bg-sky-50 dark:bg-sky-950/40 text-sky-700 dark:text-sky-300 text-xs font-bold hover:bg-sky-100 dark:hover:bg-sky-900/60 transition-colors"
              >
                <span>🛠️ Xem Tất Cả Công Cụ Học Tập</span>
                <span>➔</span>
              </a>
            </div>
          </div>

          <!-- Section 3: Tiện Ích & Liên Lạc -->
          <div class="space-y-1.5">
            <div class="text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300 px-1">
              📅 Lịch Học &amp; Gia Đình
            </div>
            <div class="grid grid-cols-2 gap-2">
              <a
                href="/schedule"
                onclick={() => mobileMenuOpen = false}
                class="flex items-center gap-2 p-2.5 rounded-md bg-indigo-50 dark:bg-indigo-950/50 text-indigo-800 dark:text-indigo-300 text-xs font-semibold"
              >
                <span>📅</span> <span>Thời Khóa Biểu</span>
              </a>
              {#if currentUser?.role === 'parent' || isSuperAdmin(currentUser)}
                <a
                  href="/?tab=parent"
                  onclick={() => mobileMenuOpen = false}
                  class="flex items-center gap-2 p-2.5 rounded-md bg-purple-50 dark:bg-purple-950/50 text-purple-800 dark:text-purple-300 text-xs font-semibold"
                >
                  <span>👨‍👩‍👧</span> <span>Sổ Phụ Huynh</span>
                </a>
              {:else if currentUser?.role === 'teacher'}
                <a
                  href="/schedule"
                  onclick={() => mobileMenuOpen = false}
                  class="flex items-center gap-2 p-2.5 rounded-md bg-teal-50 dark:bg-teal-950/50 text-teal-800 dark:text-teal-300 text-xs font-semibold"
                >
                  <span>👨‍🏫</span> <span>Sổ Giáo Viên</span>
                </a>
              {/if}
            </div>
          </div>

          <!-- Section 4: Dành Riêng Cho Leader & Giáo Viên (Chỉ Admin / Teacher mới thấy) -->
          {#if isTeacherOrAdmin(currentUser)}
            <div class="pt-3 border-t border-slate-200 dark:border-slate-800 space-y-2">
              <div class="text-xs font-semibold uppercase tracking-wider text-amber-700 dark:text-amber-400 px-1 flex items-center gap-1">
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
                  class="flex items-center gap-2 p-2.5 rounded-md bg-amber-500/15 text-amber-800 dark:text-amber-300 text-xs font-semibold border border-amber-500/30"
                >
                  <span>⚙️</span> <span>Admin CP</span>
                </a>
                <a
                  href="/second-brain"
                  onclick={() => mobileMenuOpen = false}
                  class="flex items-center gap-2 p-2.5 rounded-md bg-teal-500/15 text-teal-800 dark:text-teal-300 text-xs font-semibold border border-teal-500/30"
                >
                  <span>🧠</span> <span>Second Brain</span>
                </a>
                <a
                  href="/evaluations"
                  onclick={() => mobileMenuOpen = false}
                  class="flex items-center gap-2 p-2.5 rounded-md bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-slate-200 text-xs font-semibold"
                >
                  <span>📊</span> <span>Đánh Giá Năng Lực</span>
                </a>
                <a
                  href="/pedagogy"
                  onclick={() => mobileMenuOpen = false}
                  class="flex items-center gap-2 p-2.5 rounded-md bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-slate-200 text-xs font-semibold"
                >
                  <span>👨‍🏫</span> <span>Giáo Án 5512</span>
                </a>
              </div>
            </div>
          {/if}
        </div>
      {/if}
    </div>
  </header>

  <!-- Main Content Body -->
  <main class="flex-1 w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
    {#if currentUser?.status === 'trial' || currentUser?.approval_status === 'trial'}
      <div class="mb-5 p-4 rounded-lg bg-amber-50 dark:bg-amber-950/40 border border-amber-300 dark:border-amber-800 text-amber-900 dark:text-amber-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-xs animate-in slide-in-from-top-1 duration-200">
        <div class="flex items-center gap-3">
          <div class="w-9 h-9 rounded-md bg-amber-500/20 border border-amber-500/40 text-amber-700 dark:text-amber-300 flex items-center justify-center text-lg font-semibold">
            ⏳
          </div>
          <div>
            <div class="text-xs font-semibold flex items-center gap-2">
              <span>Tài Khoản Đang Ở Chế Độ Dùng Thử (Trial)</span>
              <span class="px-2 py-0.5 rounded bg-amber-500/20 text-amber-800 dark:text-amber-300 text-[11px] font-semibold uppercase border border-amber-500/30">Chờ duyệt chính thức</span>
            </div>
            <div class="text-[11px] text-slate-600 dark:text-slate-300 mt-0.5">
              Bạn có thể làm bài khảo thí 15p - 45p, xem bài giảng <strong>{currentUserGrade || 'lớp đã chọn'}</strong>. Sau khi Admin / Cô Dung duyệt, tài khoản sẽ được nâng lên Chính Thức để tích lũy Sao đổi học phí!
            </div>
          </div>
        </div>
        <div class="flex items-center gap-2 flex-shrink-0">
          <a
            href="https://zalo.me/0901234567"
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
  <footer class="bg-white dark:bg-slate-900 border-t border-slate-200 dark:border-slate-800 py-8 mt-auto text-xs text-slate-700 dark:text-slate-300 transition-colors duration-200">
    <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col md:flex-row items-center justify-between gap-4">
      <div class="flex items-center gap-3">
        <div class="w-8 h-8 rounded-md bg-sky-700 flex items-center justify-center text-white font-semibold text-sm">
          CD
        </div>
        <div>
          <div class="font-semibold text-slate-900 dark:text-white">Tiếng Anh Cô Dung — Hệ Thống Khảo Thí &amp; Đào Tạo Toàn Diện 2026</div>
          <div class="text-[11px] text-slate-600 dark:text-slate-300 font-medium">
            Chương trình GDPT 2018 (Lớp 1-12) • Ôn thi THPT Quốc Gia • IELTS Cambridge • Co-Teaching Bản Ngữ
          </div>
        </div>
      </div>
      <div class="flex items-center gap-4 text-[11px]">
        <span class="text-emerald-700 dark:text-emerald-400 flex items-center gap-1 font-semibold">
          <span class="w-2 h-2 rounded-full bg-emerald-500"></span>
          Cloudflare D1 APAC Active
        </span>
        <span class="text-slate-300 dark:text-slate-700">•</span>
        <a href="/evaluations" class="hover:text-sky-600 dark:hover:text-sky-400">Đánh giá học sinh</a>
        <span class="text-slate-300 dark:text-slate-700">•</span>
        <a href="/pedagogy" class="hover:text-sky-600 dark:hover:text-sky-400">Giáo án 5512</a>
        <span class="text-slate-300 dark:text-slate-700">•</span>
        <button
          onclick={() => apkUpdaterRef?.checkForUpdate(true)}
          class="hover:text-sky-600 dark:hover:text-sky-400 flex items-center gap-1 font-semibold text-sky-700 dark:text-sky-300"
          title="Kiểm tra bản cập nhật APK mới qua Wi-Fi"
        >
          <span>📶</span> <span>Cập Nhật APK (Wi-Fi)</span>
        </button>
      </div>
    </div>
  </footer>

  <!-- Mandatory Login & Register Gate / Modal -->
  <AuthModal bind:isOpen={showAuthModal} {canDismiss} />

  <!-- User Profile Edit Modal -->
  <ProfileEditModal bind:isOpen={showProfileModal} />

  <!-- Direct In-App WiFi OTA APK Updater -->
  <ApkOtaUpdater bind:this={apkUpdaterRef} />

  <!-- Leader Notification Drawer (Cô Dung) -->
  <LeaderNotificationDrawer bind:isOpen={showLeaderDrawer} onClose={() => showLeaderDrawer = false} />

  <!-- Universal Role-based Notification Center Modal -->
  <NotificationCenterModal bind:isOpen={showNotificationModal} on:read={() => loadUserNotificationsCount()} />
</div>
