<script>
 import { page } from '$app/stores';
 import { onMount } from 'svelte';
 import { goto } from '$app/navigation';
 import { getCurrentUser, isSuperAdmin, getStudentStars, getAuthToken } from '$lib/unifiedStore';
 import { shouldForcePasswordChange } from '$lib/userMetadata';
 import { currentLang, t } from '$lib/i18n';

 let { children } = $props();

 let currentUser = $state(typeof window !== 'undefined' ? getCurrentUser() : null);
 let studentStars = $state(null);
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
   { path: '/cpanel/parent#tuition', label: t('tuitionTab', lang), icon: '💳' },
   { path: '/schedule', label: t('scheduleTab', lang), icon: '🗓️' }
  ],
  teacher: [
   { path: '/cpanel/teacher', label: t('teacherWorkplace', lang), icon: '👩‍🏫' },
   { path: '/cpanel/teacher#grading', label: t('gradingTab', lang), icon: '✍️' },
   { path: '/cpanel/teacher#assign', label: t('assignTab', lang), icon: '➕' },
   { path: '/session-audit', label: 'Đối Soát Ca Dạy', icon: '📊' },
   { path: '/quiz-menu', label: t('quizMenuTab', lang), icon: '🧩' }
  ],
  leader: [
   { path: '/cpanel/leader', label: t('academicTesting', lang), icon: '👑' },
   { path: '/session-audit', label: 'Đối Soát Ca Dạy', icon: '📊' },
   { path: '/quiz-menu', label: t('quizMenuTab', lang), icon: '🧩' },
   { path: '/admincp', label: t('adminCP', lang), icon: '⚡' }
  ],
  superadmin: [
   { path: '/admincp', label: t('adminCP', lang), icon: '⚡' },
   { path: '/cpanel/leader', label: t('academicTesting', lang), icon: '👑' },
   { path: '/cpanel/teacher', label: t('teacherWorkplace', lang), icon: '👩‍🏫' },
   { path: '/cpanel/parent', label: t('parentPortal', lang), icon: '👨‍👩‍👧' },
   { path: '/cpanel/student', label: t('studentDesk', lang), icon: '🎒' },
   { path: '/session-audit', label: 'Đối Soát Ca Dạy', icon: '📊' }
  ]
 });

 async function loadCampuses() {
  if (typeof window === 'undefined') return;
  const token = getAuthToken() || localStorage.getItem('tienganh_token');
  if (!token) return;
  try {
   const res = await fetch('/api/campuses?view=summary', {
    headers: { 'Authorization': `Bearer ${token}` }
   });
   if (!res.ok) return;
   const data = await res.json();
   if (data.success) {
    campuses = data.campuses || [];
   }
  } catch {}
 }

 onMount(() => {
  currentUser = getCurrentUser();
  loadCampuses();

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
   if (currentUser && currentUser.role !== 'parent' && !isSuperAdmin(currentUser) && currentUser.role !== 'leader') {
    goto(currentUser.role === 'teacher' ? '/cpanel/teacher' : '/cpanel/student');
   }
  } else if (pathname.startsWith('/cpanel/teacher')) {
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

 let forcePasswordChange = $derived(shouldForcePasswordChange(currentUser));
 let manualPasswordModalOpen = $state(false);
 let showChangePasswordModal = $derived(forcePasswordChange || manualPasswordModalOpen);
 let cpOldPassword = $state('');
 let cpNewPassword = $state('');
 let cpConfirmPassword = $state('');
 let cpError = $state('');
 let cpSuccess = $state('');
 let isChangingPassword = $state(false);

 function openVoluntaryPasswordModal() {
  cpError = '';
  cpSuccess = '';
  cpOldPassword = '';
  cpNewPassword = '';
  cpConfirmPassword = '';
  manualPasswordModalOpen = true;
 }

 async function handleChangePassword() {
  cpError = '';
  if (cpNewPassword !== cpConfirmPassword) {
   cpError = 'Mật khẩu mới không khớp.';
   return;
  }
  if (cpNewPassword.length < 6) {
   cpError = 'Mật khẩu mới phải có ít nhất 6 ký tự.';
   return;
  }
  isChangingPassword = true;
  try {
   const token = getAuthToken();
   const headers = { 'Content-Type': 'application/json' };
   if (token) {
    headers['Authorization'] = `Bearer ${token}`;
   }
   const res = await fetch('/api/auth/change-password', {
    method: 'POST',
    headers,
    body: JSON.stringify({ old_password: cpOldPassword, new_password: cpNewPassword })
   });
   const data = await res.json();
   if (data.success) {
    cpSuccess = '✅ Đổi mật khẩu thành công trên hệ thống Cloudflare D1!';
    cpOldPassword = '';
    cpNewPassword = '';
    cpConfirmPassword = '';
    setTimeout(() => {
     if (forcePasswordChange) {
      window.location.reload();
     } else {
      manualPasswordModalOpen = false;
      cpSuccess = '';
     }
    }, 1200);
   } else {
    cpError = data.error || 'Đổi mật khẩu thất bại.';
   }
  } catch (e) {
   cpError = 'Lỗi kết nối.';
  } finally {
   isChangingPassword = false;
  }
 }
</script>

<div class="min-h-screen text-slate-800 flex flex-col font-sans max-w-full overflow-x-hidden">
 <!-- Compact Single-Row CPanel Sub-Nav Bar (Zero Duplicate Header) -->
 <div data-testid="cpanel-sub-dockbar" class="max-w-7xl w-full mx-auto px-3 sm:px-6 pt-1 pb-3 flex flex-wrap items-center justify-between gap-2 border-b border-slate-200/80">
  <div class="flex flex-wrap items-center gap-1.5 min-w-0">
   {#each navItems as item}
    {@const isActive = $page.url.pathname === item.path || ($page.url.hash && item.path.includes($page.url.hash))}
    <a
     href={item.path}
     class="cpanel-dock-item flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold border transition-all {isActive ? 'bg-cx-600 text-white border-cx-700 shadow-xs' : 'bg-white text-slate-700 border-slate-200 hover:border-cx-400 hover:bg-slate-50'}"
    >
     <span aria-hidden="true">{item.icon}</span>
     <span>{item.label}</span>
    </a>
   {/each}
  </div>

  <div class="flex items-center gap-2 shrink-0">
   <select
    bind:value={selectedCampus}
    class="text-xs font-semibold bg-white text-slate-700 px-2.5 py-1.5 rounded-xl border border-slate-200 focus:outline-none focus:ring-1 focus:ring-cx-500"
   >
    <option value="all">📍 Tất cả 3 cơ sở</option>
    {#each campuses as c}
     <option value={c.id}>{c.name}</option>
    {/each}
   </select>
   {#if currentUser}
    <button
     type="button"
     data-testid="cpanel-change-password-btn"
     onclick={openVoluntaryPasswordModal}
     class="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-200 text-xs font-bold transition-colors shrink-0"
     title="Đổi mật khẩu tài khoản"
    >
     <span>🔑</span>
     <span class="hidden sm:inline">Đổi mật khẩu</span>
    </button>
   {/if}
  </div>
 </div>

 <!-- Main Cpanel Body -->
 <div class="flex-1 max-w-7xl w-full mx-auto py-4 sm:py-6 min-w-0 overflow-x-hidden">
  {@render children()}
 </div>
</div>

{#if showChangePasswordModal}
 <div
  class="fixed inset-0 z-50 flex items-center justify-center bg-stone-500/25 backdrop-blur-sm p-3 sm:p-4 overflow-y-auto"
  role="dialog"
  aria-modal="true"
  aria-labelledby="change-password-modal-title"
 >
  <div class="bg-white rounded-xl shadow-xl w-full max-w-md overflow-hidden flex flex-col my-auto max-h-[90vh]">
   <div class="px-4 py-3 sm:px-5 sm:py-4 border-b border-slate-100 flex justify-between items-center {forcePasswordChange ? 'bg-rose-50' : 'bg-emerald-50'}">
    <h3 id="change-password-modal-title" class="font-bold {forcePasswordChange ? 'text-rose-800' : 'text-emerald-900'} text-sm sm:text-base">
     {forcePasswordChange ? 'Bắt Buộc Đổi Mật Khẩu Lần Đầu' : '🔑 Đổi Mật Khẩu Bảo Mật (Cloudflare D1)'}
    </h3>
    {#if !forcePasswordChange}
     <button
      type="button"
      onclick={() => { manualPasswordModalOpen = false; }}
      class="w-7 h-7 rounded-full bg-white text-slate-500 hover:text-slate-800 flex items-center justify-center text-xs font-bold border border-slate-200"
      aria-label="Đóng"
     >✕</button>
    {/if}
   </div>
   <div class="p-4 sm:p-5 space-y-3 sm:space-y-4 overflow-y-auto">
    <p class="text-xs sm:text-sm text-slate-600 font-medium">
     {#if forcePasswordChange}
      Chào mừng bạn đến với hệ thống Tiếng Anh Cô Dung. Vì lý do bảo mật, bạn bắt buộc phải đổi mật khẩu ngay trong lần đăng nhập đầu tiên.
     {:else}
      Nhập mật khẩu hiện tại và mật khẩu mới (&ge; 6 ký tự) để cập nhật trực tiếp lên cơ sở dữ liệu Cloudflare D1.
     {/if}
    </p>
    {#if cpError}
     <div class="p-2.5 rounded bg-rose-50 text-rose-700 text-xs font-semibold border border-rose-200" role="alert">{cpError}</div>
    {/if}
    {#if cpSuccess}
     <div class="p-2.5 rounded bg-emerald-50 text-emerald-700 text-xs font-semibold border border-emerald-200" role="status">{cpSuccess}</div>
    {:else}
     <form onsubmit={(e) => { e.preventDefault(); handleChangePassword(); }} class="space-y-3">
      <div>
       <label for="cp-old-password" class="block text-xs font-bold text-slate-700 mb-1">Mật khẩu hiện tại (cũ)</label>
       <input
        id="cp-old-password"
        type="password"
        autocomplete="current-password"
        required
        bind:value={cpOldPassword}
        class="w-full px-3 py-2 border border-slate-300 rounded-md focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 text-sm"
       />
      </div>
      <div>
       <label for="cp-new-password" class="block text-xs font-bold text-slate-700 mb-1">Mật khẩu mới (&ge; 6 ký tự)</label>
       <input
        id="cp-new-password"
        type="password"
        autocomplete="new-password"
        required
        minlength="6"
        bind:value={cpNewPassword}
        class="w-full px-3 py-2 border border-slate-300 rounded-md focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 text-sm"
       />
      </div>
      <div>
       <label for="cp-confirm-password" class="block text-xs font-bold text-slate-700 mb-1">Xác nhận mật khẩu mới</label>
       <input
        id="cp-confirm-password"
        type="password"
        autocomplete="new-password"
        required
        minlength="6"
        bind:value={cpConfirmPassword}
        class="w-full px-3 py-2 border border-slate-300 rounded-md focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 text-sm"
       />
      </div>
      <div class="pt-2 flex justify-end gap-2">
       {#if !forcePasswordChange}
        <button
         type="button"
         onclick={() => { manualPasswordModalOpen = false; }}
         class="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-sm font-semibold rounded-md transition-colors"
        >
         Hủy
        </button>
       {/if}
       <button
        type="submit"
        disabled={isChangingPassword}
        class="w-full sm:w-auto px-5 py-2 {forcePasswordChange ? 'bg-rose-600 hover:bg-rose-700' : 'bg-emerald-600 hover:bg-emerald-700'} text-white text-sm font-semibold rounded-md shadow-sm transition-colors disabled:opacity-50"
       >
        {isChangingPassword ? 'Đang xử lý...' : '🔑 Đổi Mật Khẩu'}
       </button>
      </div>
     </form>
    {/if}
   </div>
  </div>
 </div>
{/if}
