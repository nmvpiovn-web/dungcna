<script>
  import { page } from '$app/stores';
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import { getCurrentUser, isSuperAdmin, getStudentStars } from '$lib/unifiedStore';
  import { currentLang, toggleLanguage, t } from '$lib/i18n';

  let { children } = $props();

  let currentUser = $state(null);
  let studentStars = $state(null);
  let unreadNotifs = $state(0);
  let selectedCampus = $state('all');
  let campuses = $state([]);
  let lang = $state('vi');

  currentLang.subscribe(val => {
    lang = val;
  });

  let roleNavItems = $derived({
    student: [
      { path: '/cpanel/student', label: t('studentDesk', lang), icon: '🎒' },
      { path: '/cpanel/student#homework', label: t('homeworkTab', lang), icon: '📝' },
      { path: '/exam', label: t('examTab', lang), icon: '🎯' },
      { path: '/schedule', label: t('scheduleTab', lang), icon: '📅' }
    ],
    parent: [
      { path: '/cpanel/parent', label: t('parentPortal', lang), icon: '👨‍👩‍👧' },
      { path: '/cpanel/parent#homework', label: t('homeworkTab', lang), icon: '📊' },
      { path: '/cpanel/parent#tuition', label: t('tuitionTab', lang), icon: '💳' },
      { path: '/schedule', label: t('scheduleTab', lang), icon: '🗓️' }
    ],
    teacher: [
      { path: '/cpanel/teacher', label: t('teacherWorkplace', lang), icon: '👩‍🏫' },
      { path: '/cpanel/teacher#grading', label: t('gradingTab', lang), icon: '✍️' },
      { path: '/cpanel/teacher#assign', label: t('assignTab', lang), icon: '➕' },
      { path: '/second-brain', label: t('secondBrainTab', lang), icon: '🧠' }
    ],
    leader: [
      { path: '/cpanel/leader', label: t('academicTesting', lang), icon: '👑' },
      { path: '/cpanel/leader#quality', label: t('homeworkTab', lang), icon: '📈' },
      { path: '/cpanel/leader#curriculum', label: t('secondBrainTab', lang), icon: '🗺️' },
      { path: '/admincp', label: t('adminCP', lang), icon: '⚡' }
    ],
    superadmin: [
      { path: '/cpanel/student', label: t('studentDesk', lang), icon: '🎒' },
      { path: '/cpanel/parent', label: t('parentPortal', lang), icon: '👨‍👩‍👧' },
      { path: '/cpanel/teacher', label: t('teacherWorkplace', lang), icon: '👩‍🏫' },
      { path: '/cpanel/leader', label: t('academicTesting', lang), icon: '👑' },
      { path: '/admincp', label: t('adminCP', lang), icon: '⚡' }
    ]
  });

  async function loadCampuses() {
    try {
      const res = await fetch('/api/campuses');
      const data = await res.json();
      if (data.success) {
        campuses = data.campuses || [];
      }
    } catch {}
  }

  async function loadUnreadCount() {
    if (typeof window === 'undefined') return;
    const token = localStorage.getItem('tienganh_token');
    if (!token) return;
    try {
      const res = await fetch('/api/notifications', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await res.json();
      if (data.success) {
        unreadNotifs = data.unread_count || 0;
      }
    } catch {}
  }

  onMount(() => {
    currentUser = getCurrentUser();
    loadCampuses();
    loadUnreadCount();

    if (currentUser?.role === 'student') {
      studentStars = getStudentStars(currentUser.id);
    }

    // Strict Role-Based Routing & Book Isolation
    const pathname = $page.url.pathname;
    if (pathname === '/cpanel' || pathname === '/cpanel/') {
      if (!currentUser) {
        goto('/courses');
      } else if (currentUser.role === 'student') {
        goto('/cpanel/student');
      } else if (currentUser.role === 'parent') {
        goto('/cpanel/parent');
      } else if (currentUser.role === 'teacher') {
        goto('/cpanel/teacher');
      } else if (currentUser.role === 'leader') {
        goto('/cpanel/leader');
      } else if (isSuperAdmin(currentUser)) {
        goto('/admincp');
      }
    } else if (pathname.startsWith('/cpanel/parent')) {
      // Sổ Phụ Huynh: Visible only to Parent (Leader/Admin manage)
      if (currentUser && currentUser.role !== 'parent' && !isSuperAdmin(currentUser) && currentUser.role !== 'leader') {
        goto(currentUser.role === 'teacher' ? '/cpanel/teacher' : '/cpanel/student');
      }
    } else if (pathname.startsWith('/cpanel/teacher')) {
      // Sổ Giáo Viên: Visible only to Teacher (Leader/Admin manage)
      if (currentUser && currentUser.role !== 'teacher' && !isSuperAdmin(currentUser) && currentUser.role !== 'leader') {
        goto(currentUser.role === 'parent' ? '/cpanel/parent' : '/cpanel/student');
      }
    } else if (pathname.startsWith('/cpanel/leader')) {
      if (currentUser && currentUser.role !== 'leader' && !isSuperAdmin(currentUser)) {
        goto(currentUser.role === 'teacher' ? '/cpanel/teacher' : (currentUser.role === 'parent' ? '/cpanel/parent' : '/cpanel/student'));
      }
    }
  });

  let currentRoleKey = $derived.by(() => {
    if (!currentUser) return 'student';
    if (isSuperAdmin(currentUser)) return 'superadmin';
    return currentUser.role || 'student';
  });

  let navItems = $derived(roleNavItems[currentRoleKey] || roleNavItems.student);
</script>

<div class="min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-800 dark:text-slate-100 flex flex-col font-sans">
  <!-- Cpanel Top Bar -->
  <header class="sticky top-0 z-40 bg-white/90 dark:bg-slate-900/90 backdrop-blur-md border-b border-slate-200 dark:border-slate-800 shadow-sm px-4 py-2.5">
    <div class="max-w-7xl mx-auto flex items-center justify-between gap-3">
      <!-- Left: Logo & Portal Badge -->
      <div class="flex items-center gap-3">
        <a href="/" class="flex items-center gap-2 group">
          <div class="w-9 h-9 rounded-lg bg-sky-700 dark:bg-sky-600 flex items-center justify-center text-white font-bold text-base shadow-sm group-hover:bg-sky-800 dark:group-hover:bg-sky-500 transition-colors">
            D
          </div>
          <div>
            <div class="text-xs uppercase tracking-wider font-bold text-sky-600 dark:text-sky-400">Tiếng Anh Cô Dung</div>
            <div class="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
              <span>Hệ Thống Cpanel</span>
              <span class="text-[11px] px-2 py-0.5 rounded-md font-semibold tracking-wide bg-sky-50 dark:bg-sky-950/80 text-sky-700 dark:text-sky-300 border border-sky-200 dark:border-sky-800">
                {currentRoleKey}
              </span>
            </div>
          </div>
        </a>

        <!-- Location Filter Dropdown -->
        <div class="hidden md:flex items-center gap-1.5 ml-4 pl-4 border-l border-slate-200 dark:border-slate-800">
          <svg class="w-3.5 h-3.5 text-slate-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
          <span class="text-xs text-slate-400 font-medium">Điểm học:</span>
          <select 
            bind:value={selectedCampus}
            class="text-xs font-semibold bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 px-2.5 py-1 rounded-md border border-slate-300 dark:border-slate-700 focus:outline-none focus:ring-1 focus:ring-sky-500"
          >
            <option value="all">Tất cả cơ sở</option>
            {#each campuses as c}
              <option value={c.id}>{c.name}</option>
            {/each}
          </select>
        </div>
      </div>

      <!-- Right: User Quick Info, Stars, Notifications -->
      <div class="flex items-center gap-3">
        {#if currentUser?.role === 'student' && studentStars}
          <div class="flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-amber-50 dark:bg-amber-950/50 border border-amber-200 dark:border-amber-800 text-amber-700 dark:text-amber-400 font-semibold text-xs shadow-xs">
            <svg class="w-3.5 h-3.5 text-amber-500 fill-current" viewBox="0 0 20 20">
              <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z"/>
            </svg>
            <span>{studentStars.stars_balance || 0}</span>
            <span class="text-[11px] opacity-80 hidden sm:inline">sao</span>
          </div>
        {/if}

        <!-- Language Toggle Button -->
        <button 
          onclick={toggleLanguage}
          class="flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-semibold bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 transition-colors border border-slate-200 dark:border-slate-700"
          title="Chuyển đổi ngôn ngữ / Switch Language"
        >
          <span>{lang === 'vi' ? 'VI' : 'EN'}</span>
        </button>

        <!-- Notification Bell -->
        <a 
          href="/cpanel/notifications" 
          class="relative p-2 rounded-md text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
          title="Thông báo"
        >
          <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
          </svg>
          {#if unreadNotifs > 0}
            <span class="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-rose-500 ring-2 ring-white dark:ring-slate-900"></span>
          {/if}
        </a>

        <!-- User Chip & Role Switch for Superadmin -->
        <div class="flex items-center gap-2 pl-2 border-l border-slate-200 dark:border-slate-800">
          <div class="w-8 h-8 rounded-md bg-slate-700 dark:bg-slate-600 text-white flex items-center justify-center font-semibold text-xs shadow-xs">
            {currentUser?.name?.[0] || currentUser?.username?.[0] || 'U'}
          </div>
          <div class="hidden sm:block text-left text-xs">
            <div class="font-semibold text-slate-800 dark:text-slate-200 line-clamp-1">{currentUser?.name || currentUser?.username || 'Khách'}</div>
            <div class="text-[11px] text-slate-500 dark:text-slate-400 capitalize">{currentUser?.role || 'User'}</div>
          </div>
        </div>

        {#if isSuperAdmin(currentUser)}
          <a href="/admincp" class="hidden sm:inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-rose-700 hover:bg-rose-800 text-white text-xs font-semibold shadow-xs transition-all">
            <svg class="w-3.5 h-3.5 fill-current" viewBox="0 0 20 20">
              <path fill-rule="evenodd" d="M11.3 1.046A1 1 0 0112 2v5h4a1 1 0 01.82 1.573l-7 10A1 1 0 018 18v-5H4a1 1 0 01-.82-1.573l7-10a1 1 0 011.12-.38z" clip-rule="evenodd" />
            </svg>
            <span>AdminCP Tổng</span>
          </a>
        {/if}
      </div>
    </div>

    <!-- Secondary Nav Tabs -->
    <div class="max-w-7xl mx-auto flex items-center gap-2 overflow-x-auto pt-2 scrollbar-none">
      {#each navItems as item}
        {@const isActive = $page.url.pathname === item.path || ($page.url.hash && item.path.includes($page.url.hash))}
        <a 
          href={item.path}
          class="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold whitespace-nowrap transition-all {isActive ? 'bg-sky-600 text-white shadow-xs' : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'}"
        >
          <span>{item.label}</span>
        </a>
      {/each}
    </div>
  </header>

  <!-- Main Cpanel Body -->
  <main class="flex-1 max-w-7xl w-full mx-auto p-4 sm:p-6 lg:p-8">
    {@render children()}
  </main>
</div>
