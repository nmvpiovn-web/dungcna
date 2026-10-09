<script>
 import { page } from '$app/stores';
 import { onMount } from 'svelte';
 import { goto } from '$app/navigation';
 import { getCurrentUser, isSuperAdmin, getStudentStars } from '$lib/unifiedStore';
 import { currentLang, toggleLanguage, t } from '$lib/i18n';

 let { children } = $props();

 let currentUser = $state(typeof window !== 'undefined' ? getCurrentUser() : null);
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
 { path: '/quiz-menu', label: 'Làm Quiz', icon: '▶' },
 { path: '/schedule', label: t('scheduleTab', lang), icon: '📅' }
 ],
 parent: [
 { path: '/cpanel/parent', label: t('parentPortal', lang), icon: '👨‍👩‍👧' },
 { path: '/cpanel/parent#homework', label: t('homeworkTab', lang), icon: '📊' },
 { path: '/quiz-menu?tab=results', label: 'Kết quả Quiz của con', icon: '📈' },
 { path: '/cpanel/parent#tuition', label: t('tuitionTab', lang), icon: '💳' },
 { path: '/schedule', label: t('scheduleTab', lang), icon: '🗓️' }
 ],
 teacher: [
 { path: '/cpanel/teacher', label: t('teacherWorkplace', lang), icon: '👩‍🏫' },
 { path: '/cpanel/teacher#grading', label: t('gradingTab', lang), icon: '✍️' },
 { path: '/cpanel/teacher#assign', label: t('assignTab', lang), icon: '➕' },
 { path: '/quiz-menu', label: t('quizMenuTab', lang), icon: '🧩' },
 { path: '/second-brain', label: t('secondBrainTab', lang), icon: '🧠' }
 ],
 leader: [
 { path: '/cpanel/leader', label: t('academicTesting', lang), icon: '👑' },
 { path: '/cpanel/leader#quality', label: t('homeworkTab', lang), icon: '📈' },
 { path: '/cpanel/leader#curriculum', label: t('secondBrainTab', lang), icon: '🗺️' },
 { path: '/quiz-menu', label: t('quizMenuTab', lang), icon: '🧩' },
 { path: '/admincp', label: t('adminCP', lang), icon: '⚡' }
 ],
 superadmin: [
 { path: '/admin?tab=hiring', label: 'Duyệt giáo viên', icon: '✅' },
 { path: '/cpanel/student', label: t('studentDesk', lang), icon: '🎒' },
 { path: '/cpanel/parent', label: t('parentPortal', lang), icon: '👨‍👩‍👧' },
 { path: '/cpanel/teacher', label: t('teacherWorkplace', lang), icon: '👩‍🏫' },
 { path: '/quiz-menu', label: t('quizMenuTab', lang), icon: '🧩' },
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

 const handleAuth = (e) => {
 currentUser = e.detail;
 if (currentUser?.role === 'student') {
 studentStars = getStudentStars(currentUser.id);
 }
 };
 window.addEventListener('tienganh:auth-change', handleAuth);

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

<div class="min-h-screen bg-slate-50 text-slate-800 flex flex-col font-sans max-w-full overflow-x-hidden">
 <!-- Cpanel Top Bar -->
 <header class="sticky top-0 z-40 bg-white/90 backdrop-blur-md border-b border-slate-200 shadow-sm px-3 sm:px-4 py-2 sm:py-2.5 max-w-full overflow-hidden">
 <div class="max-w-7xl mx-auto flex items-center justify-between gap-2 sm:gap-3 min-w-0">
 <!-- Left: Logo & Portal Badge -->
 <div class="flex items-center gap-2 sm:gap-3 shrink min-w-0">
 <a href="/" class="flex items-center gap-2 group shrink min-w-0">
 <div class="w-8 h-8 sm:w-9 sm:h-9 rounded-lg bg-cx-700 flex items-center justify-center text-white font-bold text-base shadow-sm group-hover:bg-cx-800 transition-colors shrink-0">
 D
 </div>
 <div class="min-w-0">
 <div class="text-[11px] sm:text-xs uppercase tracking-wider font-bold text-cx-600 truncate">Tiếng Anh Cô Dung</div>
 <div class="text-xs sm:text-sm font-bold text-slate-900 flex items-center gap-1.5">
 <span class="truncate">Hệ Thống Cpanel</span>
 <span class="text-[10px] sm:text-[11px] px-1.5 sm:px-2 py-0.5 rounded-md font-semibold tracking-wide bg-cx-50 text-cx-700 border border-cx-200 shrink-0">
 {currentRoleKey}
 </span>
 </div>
 </div>
 </a>

 <!-- Location Filter Dropdown -->
 <div class="hidden md:flex items-center gap-1.5 ml-4 pl-4 border-l border-slate-200">
 <svg class="w-3.5 h-3.5 text-slate-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
 <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
 <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
 </svg>
 <span class="text-xs text-slate-400 font-medium">Điểm học:</span>
 <select
 bind:value={selectedCampus}
 class="text-xs font-semibold bg-slate-100 text-slate-700 px-2.5 py-1 rounded-md border border-slate-300 focus:outline-none focus:ring-1 focus:ring-cx-500"
 >
 <option value="all">Tất cả cơ sở</option>
 {#each campuses as c}
 <option value={c.id}>{c.name}</option>
 {/each}
 </select>
 </div>
 </div>

 <!-- Right: User Quick Info, Stars, Notifications -->
 <div class="flex items-center gap-1.5 sm:gap-3 shrink-0">
 {#if currentUser?.role === 'student' && studentStars}
 <div class="flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-amber-50 border border-amber-200 text-amber-700 font-semibold text-xs shadow-xs">
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
 class="flex items-center gap-1 px-2 sm:px-2.5 py-1 rounded-md text-xs font-semibold bg-slate-100 hover:bg-slate-200 text-slate-700 transition-colors border border-slate-200"
 title="Chuyển đổi ngôn ngữ / Switch Language"
 >
 <span>{lang === 'vi' ? 'VI' : 'EN'}</span>
 </button>

 <!-- Notification Bell -->
 <a
 href="/cpanel/notifications"
 class="relative p-1.5 sm:p-2 rounded-md text-slate-500 hover:text-slate-900 hover:bg-slate-100 transition-colors"
 title="Thông báo"
 >
 <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
 <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
 </svg>
 {#if unreadNotifs > 0}
 <span class="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-rose-500 ring-2 ring-white"></span>
 {/if}
 </a>

 <!-- User Chip & Role Switch for Superadmin -->
 <div class="flex items-center gap-1.5 sm:gap-2 pl-1.5 sm:pl-2 border-l border-slate-200">
 <div class="w-7 h-7 sm:w-8 sm:h-8 rounded-md bg-slate-700 text-white flex items-center justify-center font-semibold text-xs shadow-xs shrink-0">
 {currentUser?.name?.[0] || currentUser?.username?.[0] || 'U'}
 </div>
 <div class="hidden sm:block text-left text-xs">
 <div class="font-semibold text-slate-800 line-clamp-1">{currentUser?.name || currentUser?.username || 'Khách'}</div>
 <div class="text-[11px] text-slate-500 capitalize">{currentUser?.role || 'User'}</div>
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
 <div class="max-w-7xl mx-auto flex items-center gap-2 overflow-x-auto pt-2 scrollbar-none w-full min-w-0">
 {#each navItems as item}
 {@const isActive = $page.url.pathname === item.path || ($page.url.hash && item.path.includes($page.url.hash))}
 <a
 href={item.path}
 class="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold whitespace-nowrap transition-all shrink-0 {isActive ? 'bg-cx-600 text-white shadow-xs' : 'text-slate-600 hover:bg-slate-100'}"
 >
 <span aria-hidden="true">{item.icon}</span>
 <span>{item.label}</span>
 </a>
 {/each}
 </div>
 </header>

 <!-- Main Cpanel Body -->
 <div class="flex-1 max-w-7xl w-full mx-auto p-3 sm:p-6 lg:p-8 min-w-0 overflow-x-hidden">
 {@render children()}
 </div>
</div>
