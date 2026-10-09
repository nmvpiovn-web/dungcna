<script>
  import { page } from '$app/stores';

  let {
    currentUser = null,
    currentUserGrade = '',
    studentStars = null,
    userUnreadCount = 0,
    leaderUnreadCount = 0,
    onLogin = () => {},
    onLogout = () => {},
    onProfile = () => {},
    onNotifications = () => {},
    onLeaderNotifications = () => {}
  } = $props();

  let moreOpen = $state(false);
  let accountOpen = $state(false);

  const progressHref = $derived(
    currentUser?.role === 'teacher' ? '/cpanel/teacher'
      : currentUser?.role === 'parent' ? '/cpanel/parent'
        : currentUser?.role === 'leader' ? '/cpanel/leader'
          : currentUser?.role === 'admin' || currentUser?.role === 'superadmin' ? '/admin'
            : currentUser?.role === 'student' ? '/cpanel/student'
              : '/evaluations'
  );

  const primaryItems = $derived([
    { href: '/courses', icon: '📚', label: 'Học', match: ['/courses', '/'] },
    { href: '/flashcards', icon: '🗂️', label: 'Luyện tập', match: ['/flashcards', '/dictionary', '/grammar', '/games'] },
    { href: '/exam', icon: '✍️', label: 'Kiểm tra', match: ['/exam', '/quiz'] },
    { href: progressHref, icon: '📈', label: 'Tiến độ', match: ['/cpanel', '/evaluations', '/admin'] }
  ]);

  const isActive = item => item.match.some(path => path === '/' ? $page.url.pathname === '/' : $page.url.pathname.startsWith(path));
  const closeMenus = () => { moreOpen = false; accountOpen = false; };
</script>

<svelte:window onkeydown={(event) => event.key === 'Escape' && closeMenus()} />

{#if moreOpen || accountOpen}
  <button class="fixed inset-0 z-40 bg-slate-950/20" aria-label="Đóng menu" onclick={closeMenus}></button>
{/if}

<header class="sticky top-0 z-50 border-b border-cx-200 bg-white/95 backdrop-blur-md shadow-sm">
  <div class="mx-auto flex h-16 max-w-7xl items-center justify-between gap-4 px-3 sm:px-6 lg:px-8">
    <a href="/" class="flex min-w-0 items-center gap-2.5" onclick={closeMenus}>
      <span class="grid h-10 w-10 shrink-0 place-items-center rounded-lg border border-cx-800 bg-cx-700 text-xl text-white">👩‍🏫</span>
      <span class="min-w-0">
        <strong class="block truncate text-sm text-slate-950 sm:text-base">Tiếng Anh Cô Dung</strong>
        <span class="hidden text-xs font-medium text-slate-600 sm:block">Học tiếng Anh theo lộ trình rõ ràng</span>
      </span>
    </a>

    <nav class="hidden items-center gap-1 lg:flex" aria-label="Điều hướng học tập chính">
      {#each primaryItems as item}
        <a
          id={item.label === 'Học' ? 'nav-btn-courses' : item.label === 'Kiểm tra' ? 'nav-btn-exams' : undefined}
          href={item.href}
          class="flex min-h-11 items-center gap-2 rounded-lg px-4 text-sm font-bold transition-colors {isActive(item) ? 'bg-cx-100 text-cx-900' : 'text-slate-700 hover:bg-slate-100 hover:text-slate-950'}"
          aria-current={isActive(item) ? 'page' : undefined}
        >
          <span aria-hidden="true">{item.icon}</span><span>{item.label}</span>
        </a>
      {/each}
      <button id="nav-btn-tools" type="button" class="min-h-11 rounded-lg px-4 text-sm font-bold text-slate-700 hover:bg-slate-100" onclick={() => { moreOpen = !moreOpen; accountOpen = false; }} aria-expanded={moreOpen}>Thêm</button>
    </nav>

    <div class="relative flex items-center gap-2">
      {#if currentUser?.role === 'student' && studentStars}
        <span class="hidden rounded-full border border-amber-300 bg-amber-50 px-3 py-1 text-xs font-extrabold text-amber-900 sm:inline-flex">⭐ {studentStars.stars_balance}</span>
      {/if}
      {#if currentUser}
        <button type="button" class="relative min-h-11 max-w-40 rounded-lg border border-slate-300 bg-white px-3 text-left text-xs font-bold text-slate-900 hover:bg-slate-50" onclick={() => { accountOpen = !accountOpen; moreOpen = false; }} aria-expanded={accountOpen}>
          <span class="block truncate">{currentUser.name || currentUser.username}</span>
          <span class="block text-[11px] font-medium text-slate-600">{currentUserGrade || currentUser.role}</span>
          {#if userUnreadCount > 0}<span class="absolute -right-1 -top-1 rounded-full bg-rose-700 px-1.5 text-[10px] text-white">{userUnreadCount}</span>{/if}
        </button>
      {:else}
        <button type="button" class="min-h-11 rounded-lg bg-cx-700 px-4 text-sm font-extrabold text-white hover:bg-cx-800" onclick={onLogin}>Đăng nhập</button>
      {/if}
    </div>
  </div>

  {#if moreOpen}
    <section id="mobile-drawer" data-testid="mobile-drawer" class="absolute inset-x-3 top-[4.5rem] z-50 mx-auto max-w-2xl rounded-xl border border-cx-200 bg-white p-4 shadow-2xl lg:left-1/2 lg:right-auto lg:w-[34rem] lg:-translate-x-1/2" aria-label="Công cụ học tập bổ sung">
      <div class="mb-3 flex items-center justify-between">
        <div><strong class="text-slate-950">Công cụ học tiếng Anh</strong><p class="text-xs text-slate-600">Chọn đúng hoạt động cho mục tiêu hiện tại.</p></div>
        <button type="button" class="min-h-11 rounded-lg px-3 font-bold text-slate-700 hover:bg-slate-100" onclick={() => moreOpen = false}>✕ Đóng</button>
      </div>
      <div class="grid grid-cols-2 gap-2 sm:grid-cols-3">
        <a href="/dictionary" onclick={closeMenus} class="min-h-16 rounded-lg border border-slate-200 p-3 font-bold text-slate-900 hover:border-cx-400 hover:bg-cx-50">📖 Từ điển &amp; IPA</a>
        <a href="/grammar" onclick={closeMenus} class="min-h-16 rounded-lg border border-slate-200 p-3 font-bold text-slate-900 hover:border-cx-400 hover:bg-cx-50">📐 Ngữ pháp</a>
        <a href="/games" onclick={closeMenus} class="min-h-16 rounded-lg border border-slate-200 p-3 font-bold text-slate-900 hover:border-cx-400 hover:bg-cx-50">🎮 Trò chơi</a>
        <a href="/schedule" onclick={closeMenus} class="min-h-16 rounded-lg border border-slate-200 p-3 font-bold text-slate-900 hover:border-cx-400 hover:bg-cx-50">📅 Lịch học</a>
        <a href="/evaluations" onclick={closeMenus} class="min-h-16 rounded-lg border border-slate-200 p-3 font-bold text-slate-900 hover:border-cx-400 hover:bg-cx-50">📊 Đánh giá</a>
        <a href="/pedagogy" onclick={closeMenus} class="min-h-16 rounded-lg border border-slate-200 p-3 font-bold text-slate-900 hover:border-cx-400 hover:bg-cx-50">👩‍🏫 Học liệu</a>
        {#if ['teacher', 'leader', 'admin', 'superadmin'].includes((currentUser?.role || '').toLowerCase())}
        <a href="/quiz-menu" onclick={closeMenus} class="min-h-16 rounded-lg border border-indigo-200 bg-indigo-50 p-3 font-bold text-indigo-900 hover:border-indigo-400 hover:bg-indigo-100">🧩 Tạo Quiz</a>
        {/if}
        {#if ['student', 'parent'].includes((currentUser?.role || '').toLowerCase())}
        <a href="/quiz-menu" onclick={closeMenus} class="min-h-16 rounded-lg border border-indigo-200 bg-indigo-50 p-3 font-bold text-indigo-900 hover:border-indigo-400 hover:bg-indigo-100">▶ Làm Quiz</a>
        {/if}
        {#if (currentUser?.role || '').toLowerCase() === 'parent'}
        <a href="/quiz-menu?tab=results" onclick={closeMenus} class="min-h-16 rounded-lg border border-indigo-200 bg-indigo-50 p-3 font-bold text-indigo-900 hover:border-indigo-400 hover:bg-indigo-100">📊 Kết quả Quiz của con</a>
        {/if}
      </div>
      {#if currentUser?.role === 'teacher' || currentUser?.role === 'leader' || currentUser?.role === 'admin' || currentUser?.role === 'superadmin'}
        <button type="button" class="mt-3 min-h-11 w-full rounded-lg border border-amber-300 bg-amber-50 px-4 text-left font-bold text-amber-950" onclick={() => { closeMenus(); onLeaderNotifications(); }}>🔔 Trung tâm điều hành {#if leaderUnreadCount > 0}({leaderUnreadCount} mới){/if}</button>
      {/if}
    </section>
  {/if}

  {#if accountOpen && currentUser}
    <section class="absolute right-3 top-[4.5rem] z-50 w-72 rounded-xl border border-cx-200 bg-white p-3 shadow-2xl sm:right-6" aria-label="Tài khoản">
      <div class="border-b border-slate-200 px-2 pb-3"><strong class="block text-slate-950">{currentUser.name}</strong><span class="text-xs text-slate-600">@{currentUser.username}</span></div>
      <button type="button" class="mt-2 min-h-11 w-full rounded-lg px-3 text-left font-bold text-slate-800 hover:bg-slate-100" onclick={() => { closeMenus(); onNotifications(); }}>🔔 Thông báo {#if userUnreadCount > 0}({userUnreadCount}){/if}</button>
      <button type="button" class="min-h-11 w-full rounded-lg px-3 text-left font-bold text-slate-800 hover:bg-slate-100" onclick={() => { closeMenus(); onProfile(); }}>👤 Hồ sơ cá nhân</button>
      <button type="button" class="min-h-11 w-full rounded-lg px-3 text-left font-bold text-rose-800 hover:bg-rose-50" onclick={() => { closeMenus(); onLogout(); }}>🚪 Đăng xuất</button>
    </section>
  {/if}
</header>

<nav class="fixed inset-x-0 bottom-0 z-50 grid grid-cols-5 border-t border-cx-200 bg-white/98 px-1 pb-[max(0.25rem,env(safe-area-inset-bottom))] shadow-[0_-8px_24px_rgba(15,23,42,0.08)] lg:hidden" aria-label="Điều hướng nhanh trên điện thoại">
  {#each primaryItems as item}
    <a href={item.href} class="flex min-h-16 flex-col items-center justify-center gap-0.5 rounded-lg text-[11px] font-bold {isActive(item) ? 'text-cx-800' : 'text-slate-600'}" aria-current={isActive(item) ? 'page' : undefined}>
      <span class="text-lg" aria-hidden="true">{item.icon}</span><span>{item.label}</span>
    </a>
  {/each}
  <button id="mobile-menu-btn" data-testid="mobile-menu-btn" type="button" class="flex min-h-16 flex-col items-center justify-center gap-0.5 rounded-lg text-[11px] font-bold {moreOpen ? 'text-cx-800' : 'text-slate-600'}" onclick={() => { moreOpen = !moreOpen; accountOpen = false; }} aria-expanded={moreOpen}>
    <span class="text-lg" aria-hidden="true">{moreOpen ? '✕' : '☰'}</span><span>Thêm</span>
  </button>
</nav>
