<!-- src/lib/components/ui/DockBar.svelte — Unified 3D Framed Floating Dockbar with Smooth Proximity Zoom In-Out -->
<script>
  import { page } from '$app/stores';
  import { isTeacherOrAdmin, isSuperAdmin } from '$lib/unifiedStore';
  import ThemeSwitcher from '$lib/components/ui/ThemeSwitcher.svelte';

  let {
    currentUser = null,
    currentUserGrade = '',
    currentUserRoleLabel = '',
    userUnreadCount = 0,
    leaderUnreadCount = 0,
    hasPersonalTheme = false,
    onOpenAuth = () => {},
    onOpenProfile = () => {},
    onOpenNotificationModal = () => {},
    onOpenLeaderDrawer = () => {},
    onOpenPersonalTheme = () => {},
    onLogout = () => {}
  } = $props();

  let mouseX = $state(null);
  let hoveredId = $state(null);
  let activeLauncher = $state(null); // 'courses' | 'exams' | 'tools' | 'workspace' | 'user' | null
  let isCollapsed = $state(false);
  let itemRefs = $state({});

  const roleWorkspaceHref = $derived.by(() => {
    if (!currentUser) return '/courses';
    if (isSuperAdmin(currentUser)) return '/admincp';
    if (currentUser.role === 'leader') return '/cpanel/leader';
    if (currentUser.role === 'teacher') return '/cpanel/teacher';
    if (currentUser.role === 'parent') return '/cpanel/parent';
    return '/cpanel/student';
  });

  const roleWorkspaceLabel = $derived.by(() => {
    if (!currentUser) return 'Cổng Học Vụ';
    if (isSuperAdmin(currentUser)) return 'Admin CP Tối Cao';
    if (currentUser.role === 'leader') return 'Sổ Điều Hành Leader';
    if (currentUser.role === 'teacher') return 'Sổ Giáo Viên & BTVN';
    if (currentUser.role === 'parent') return 'Sổ Phụ Huynh';
    return `Sổ Học Sinh ${currentUserGrade ? `(${currentUserGrade})` : ''}`;
  });

  const dockItems = $derived.by(() => {
    const staff = isTeacherOrAdmin(currentUser);
    return [
      {
        id: 'home',
        href: '/',
        icon: '🏠',
        label: 'Trang Chủ',
        sub: 'Tổng quan & Lộ trình',
        tileAccent: 'border-cyan-500/80 bg-cyan-50/90 text-cyan-900',
        match: (p) => p === '/'
      },
      {
        id: 'courses',
        href: '/courses',
        icon: '📚',
        label: 'Lộ Trình K12',
        sub: '19 Khóa học & Trường học',
        tileAccent: 'border-emerald-500/80 bg-emerald-50/90 text-emerald-900',
        hasPopover: true,
        match: (p) => p.startsWith('/courses') || p.startsWith('/truong-hoc') || p.startsWith('/hall-of-fame') || p.startsWith('/recruitment'),
        children: [
          { href: '/?tab=primary', icon: '🎒', title: 'Tiểu Học (Lớp 1 - 5)', desc: 'Global Success & Phonics' },
          { href: '/?tab=secondary', icon: '🌱', title: 'THCS (Lớp 6 - 9)', desc: 'Ngữ pháp & KET/PET' },
          { href: '/?tab=high_school', icon: '🏢', title: 'THPT & Đại Học (L10 - 12)', desc: 'Luyện thi THPT Quốc Gia' },
          { href: '/?tab=certificate', icon: '🌍', title: 'IELTS • TOEIC • VSTEP', desc: 'Chứng chỉ quốc tế Cambridge' },
          { href: '/courses', icon: '🗺️', title: 'Toàn Bộ 19 Khóa Học', desc: 'Danh mục lộ trình đầy đủ' },
          { href: '/truong-hoc', icon: '🏫', title: 'Về Trường Học Cô Dung', desc: 'Mô hình Co-Teaching bản ngữ' },
          { href: '/hall-of-fame', icon: '🏆', title: 'Bảng Vàng CEFR', desc: 'Vinh danh học viên xuất sắc' },
          { href: '/recruitment', icon: '🤝', title: 'Tuyển Dụng Giáo Viên', desc: 'Ứng tuyển GV & Trợ giảng' }
        ]
      },
      {
        id: 'exams',
        href: '/exam',
        icon: '⏱️',
        label: 'Phòng Thi',
        sub: 'Đề 15p • 45p • Học kỳ',
        tileAccent: 'border-amber-500/80 bg-amber-50/90 text-amber-900',
        hasPopover: true,
        match: (p) => p.startsWith('/exam'),
        children: [
          { href: '/exam', icon: '⚡', title: 'Test Nhanh 15 Phút', desc: 'Kiểm tra từ vựng & phản xạ đầu giờ' },
          { href: '/exam', icon: '📝', title: 'Đề Kiểm Tra 1 Tiết (45p)', desc: 'Ma trận chuẩn Bộ GD&ĐT 2026' },
          { href: '/exam', icon: '🎙️', title: 'Phòng Thi IELTS 4 Kỹ Năng', desc: 'Nghe, Đọc, Viết & Ghi âm Nói' },
          { href: '/exam#placement', icon: '🎯', title: 'Test Đầu Vào Xếp Lớp', desc: 'Đánh giá năng lực CEFR miễn phí' }
        ]
      },
      {
        id: 'quiz',
        href: '/quiz-menu',
        icon: '🧩',
        label: 'Quiz',
        sub: 'Làm bài & Kho đề D1',
        tileAccent: 'border-rose-500/80 bg-rose-50/90 text-rose-900',
        match: (p) => p === '/quiz-menu' || p.startsWith('/quiz-menu/')
      },
      {
        id: 'tools',
        href: '/tools',
        icon: '🛠️',
        label: 'Công Cụ',
        sub: 'Từ điển • Flashcard • Game',
        tileAccent: 'border-purple-500/80 bg-purple-50/90 text-purple-900',
        hasPopover: true,
        match: (p) => ['/tools', '/dictionary', '/flashcards', '/games', '/grammar', '/pedagogy'].some(x => p === x || p.startsWith(x + '/')),
        children: [
          { href: '/dictionary', icon: '📖', title: 'Từ Điển Cambridge & IPA', desc: 'Tra cứu phát âm chuẩn bản ngữ' },
          { href: '/flashcards', icon: '🗂️', title: 'Flashcard Ngữ Âm 3D', desc: 'Ghi nhớ từ vựng đa giác quan' },
          { href: '/games', icon: '🎮', title: 'Đấu Trường Trò Chơi', desc: 'Speed Match & Meteor Rush' },
          { href: '/grammar', icon: '📐', title: 'Chuyên Đề Ngữ Pháp K12', desc: '14 chuyên đề & công thức cốt lõi' },
          { href: '/pedagogy', icon: '👨‍🏫', title: 'Giáo Án 5512 & Học Liệu', desc: 'Phương pháp sư phạm chuẩn mực' },
          { href: '/tools', icon: '🧭', title: 'Tất Cả Công Cụ Học Tập', desc: 'Trung tâm bổ trợ kỹ năng' }
        ]
      },
      {
        id: 'schedule',
        href: '/schedule',
        icon: '📅',
        label: 'Thời Khóa Biểu',
        sub: 'Lịch học & Điểm danh',
        tileAccent: 'border-teal-500/80 bg-teal-50/90 text-teal-900',
        match: (p) => p === '/schedule' || p.startsWith('/schedule/')
      },
      ...(staff
        ? [
            {
              id: 'session-audit',
              href: '/session-audit',
              icon: '📊',
              label: 'Đối Soát Ca',
              sub: 'Hồi quy học liệu & Bot Zalo',
              tileAccent: 'border-emerald-600/80 bg-emerald-50/90 text-emerald-900',
              match: (p) => p === '/session-audit' || p.startsWith('/session-audit/')
            }
          ]
        : [
            {
              id: 'evaluations',
              href: '/evaluations',
              icon: '📈',
              label: 'Đánh Giá',
              sub: 'Hồ sơ năng lực 5 kỹ năng',
              tileAccent: 'border-emerald-600/80 bg-emerald-50/90 text-emerald-900',
              match: (p) => p === '/evaluations' || p.startsWith('/evaluations/')
            }
          ]),
      {
        id: 'workspace',
        href: roleWorkspaceHref,
        icon: staff ? '⚙️' : '🎛️',
        label: staff ? 'Quản Trị & Sổ' : 'Sổ Học Vụ',
        sub: roleWorkspaceLabel,
        tileAccent: 'border-amber-600/80 bg-amber-50/90 text-amber-900',
        hasPopover: staff,
        match: (p) => p.startsWith('/cpanel') || p.startsWith('/admin') || p.startsWith('/second-brain') || p.startsWith('/drive'),
        children: staff
          ? [
              { href: '/cpanel/teacher', icon: '👩‍🏫', title: 'Sổ Giáo Viên & Giao BTVN', desc: 'Chấm bài, gắn đề Quiz & nhận xét' },
              { href: '/cpanel/leader', icon: '👑', title: 'Bàn Điều Hành Leader', desc: 'Kiểm soát chất lượng & lương GV' },
              { href: '/session-audit', icon: '📊', title: 'Đối Soát Chất Lượng Ca Dạy', desc: 'Hồi quy Kho Tri Thức - Drive - Quiz' },
              { href: '/second-brain', icon: '🧠', title: 'Kho Tri Thức Second Brain', desc: '220+ chuyên đề & giáo án chuẩn' },
              { href: '/drive', icon: '📁', title: 'Kho Tài Liệu Google Drive', desc: 'Đồng bộ đề cương & học liệu số' },
              { href: '/admincp', icon: '⚡', title: 'Admin CP Quản Trị User & Role', desc: 'Phân quyền HS,PH,GV & đổi mật khẩu' },
              { href: '/admin', icon: '💰', title: 'Báo Học Phí & Đổi Sao', desc: 'Khấu trừ sao, xuất phiếu VietQR' },
              { href: '/admin?tab=webhooks', icon: '🤖', title: 'Cấu Hình Zalo Bot (@bot.ynKabJAc)', desc: 'Kiểm tra Token Bot & Webhook D1' }
            ]
          : []
      }
    ];
  });

  function getItemTransform(id) {
    if (mouseX === null) {
      if (hoveredId === id) {
        return { scale: 1.42, liftY: -16, padX: 7 };
      }
      return { scale: 1, liftY: 0, padX: 0 };
    }
    const el = itemRefs[id];
    if (!el) {
      return {
        scale: hoveredId === id ? 1.42 : 1,
        liftY: hoveredId === id ? -16 : 0,
        padX: hoveredId === id ? 7 : 0
      };
    }
    const rect = el.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const distance = Math.abs(mouseX - centerX);
    const maxDistance = 175;
    if (distance >= maxDistance) {
      return { scale: 1, liftY: 0, padX: 0 };
    }
    const ratio = Math.cos((distance / maxDistance) * (Math.PI / 2));
    const eased = Math.pow(Math.max(0, ratio), 1.35);
    const scale = Number((1 + 0.44 * eased).toFixed(3));
    const liftY = Number((-16 * eased).toFixed(2));
    const padX = Number(((scale - 1) * 14).toFixed(1));
    return { scale, liftY, padX };
  }

  function handleMouseMove(e) {
    mouseX = e.clientX;
  }

  function handleMouseLeave() {
    mouseX = null;
    hoveredId = null;
  }

  function togglePopover(item, e) {
    if (item.hasPopover && item.children?.length > 0) {
      e.preventDefault();
      activeLauncher = activeLauncher === item.id ? null : item.id;
    } else {
      activeLauncher = null;
    }
  }

  function toggleUserMenu() {
    activeLauncher = activeLauncher === 'user' ? null : 'user';
  }

  function closePopover() {
    activeLauncher = null;
  }

  let activePopoverItem = $derived(dockItems.find(i => i.id === activeLauncher) || null);
</script>

{#if activeLauncher}
  <button
    type="button"
    class="fixed inset-0 z-40 bg-stone-900/15 backdrop-blur-[1px] cursor-default"
    aria-label="Đóng bảng chọn nhanh Dockbar"
    onclick={closePopover}
  ></button>
{/if}

<!-- Unified Fixed 3D Glass Floating Dockbar (Replaces Top Header Navigation on Desktop & Tablet) -->
<aside
  id="floating-dockbar"
  data-testid="floating-dockbar"
  aria-label="Thanh công cụ Dockbar cố định"
  class="hidden md:flex fixed bottom-3.5 left-1/2 -translate-x-1/2 z-50 flex-col items-center select-none pointer-events-none"
>
  <!-- Launchpad Module Popover Above Dockbar -->
  {#if activePopoverItem && !isCollapsed}
    <div
      data-testid="dockbar-launchpad-popover"
      class="pointer-events-auto mb-6 w-[38rem] max-w-[94vw] rounded-3xl bg-surface-0/96 backdrop-blur-2xl border-2 border-brand-600/80 ring-4 ring-brand-500/15 shadow-2xl p-4 animate-in fade-in zoom-in-95 duration-150"
    >
      <div class="flex items-center justify-between pb-3 mb-3 border-b border-line">
        <div class="flex items-center gap-2.5">
          <span class="w-9 h-9 rounded-2xl bg-brand-50 border-2 border-brand-300 text-brand-700 flex items-center justify-center text-lg font-bold shadow-2xs">
            {activePopoverItem.icon}
          </span>
          <div>
            <div class="text-xs font-extrabold text-ink-900 uppercase tracking-wider">{activePopoverItem.label}</div>
            <div class="text-[11px] text-ink-500 font-medium">{activePopoverItem.sub}</div>
          </div>
        </div>
        <div class="flex items-center gap-2">
          <a
            href={activePopoverItem.href}
            onclick={closePopover}
            class="px-3.5 py-1.5 rounded-xl bg-brand-600 hover:bg-brand-700 border border-brand-700 text-white text-xs font-extrabold shadow-xs transition-all hover:scale-105"
          >
            Mở Trang Chính ➔
          </a>
          <button
            type="button"
            onclick={closePopover}
            class="w-7 h-7 rounded-xl bg-surface-1 hover:bg-stone-200 border border-line text-ink-500 text-xs font-bold flex items-center justify-center cursor-pointer"
            aria-label="Đóng"
          >
            ✕
          </button>
        </div>
      </div>

      <div class="grid grid-cols-2 gap-2.5">
        {#each activePopoverItem.children as child}
          <a
            href={child.href}
            onclick={closePopover}
            class="group flex items-start gap-3 p-2.5 rounded-2xl border-2 border-line bg-surface-0 hover:bg-brand-50/70 hover:border-brand-600 transition-all duration-150 hover:scale-[1.02] shadow-2xs"
          >
            <div class="w-10 h-10 rounded-xl bg-surface-1 group-hover:bg-surface-0 border-2 border-line group-hover:border-brand-500 flex items-center justify-center text-lg shrink-0 shadow-2xs group-hover:scale-110 transition-transform">
              {child.icon}
            </div>
            <div class="min-w-0">
              <div class="text-xs font-extrabold text-ink-900 group-hover:text-brand-700 truncate">{child.title}</div>
              <div class="text-[11px] text-ink-500 line-clamp-1">{child.desc}</div>
            </div>
          </a>
        {/each}
      </div>
    </div>
  {/if}

  <!-- User Profile Popover Above Dockbar -->
  {#if activeLauncher === 'user' && currentUser && !isCollapsed}
    <div
      data-testid="dockbar-user-popover"
      class="pointer-events-auto mb-4 w-80 rounded-3xl bg-surface-0/96 backdrop-blur-2xl border-2 border-brand-600/80 ring-4 ring-brand-500/15 shadow-2xl p-4 animate-in fade-in zoom-in-95 duration-150"
    >
      <div class="flex items-center gap-3 pb-3 border-b border-line">
        <img
          src={currentUser.avatar && !currentUser.avatar.includes('photo-1534528741775-53994a69daeb') ? currentUser.avatar : '/icon.svg'}
          onerror={(e) => { e.currentTarget.onerror = null; e.currentTarget.src = '/icon.svg'; }}
          alt=""
          class="w-11 h-11 rounded-2xl object-cover border-2 border-brand-600 shrink-0"
        />
        <div class="flex-1 min-w-0">
          <div class="font-extrabold text-sm text-ink-900 truncate flex items-center gap-1">
            {#if isSuperAdmin(currentUser)}👑{/if} {currentUser.name}
          </div>
          <div class="text-[11px] text-brand-600 font-mono">@{currentUser.username || 'user'}</div>
          <div class="mt-1 flex flex-wrap items-center gap-1 text-[10px]">
            <span class="px-2 py-0.5 rounded-md font-bold bg-brand-50 text-brand-700 border border-brand-200">
              {currentUserRoleLabel}
            </span>
          </div>
        </div>
      </div>

      <div class="py-2.5 space-y-1.5">
        {#if isSuperAdmin(currentUser)}
          <a
            href="/admin"
            onclick={closePopover}
            class="w-full flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-extrabold bg-amber-50 text-amber-800 hover:bg-amber-100 transition-all border border-amber-300"
          >
            <span>⚙️</span>
            <span>Admin CP (Học Phí, Quản Trị &amp; Zalo Bot)</span>
          </a>
        {/if}

        <button
          type="button"
          onclick={() => { closePopover(); onOpenProfile(); }}
          class="w-full flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-bold text-brand-700 hover:bg-surface-1 transition-all text-left cursor-pointer"
        >
          <span>✏️</span>
          <span>Chỉnh Sửa Hồ Sơ &amp; Zalo</span>
        </button>

        <button
          type="button"
          onclick={() => { closePopover(); onOpenAuth(); }}
          class="w-full flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-bold text-ink-500 hover:text-ink-900 hover:bg-surface-1 transition-all text-left cursor-pointer"
        >
          <span>🔄</span>
          <span>Đổi Tài Khoản / Đăng Nhập Khác</span>
        </button>

        <button
          type="button"
          id="logout-btn"
          data-testid="logout-btn"
          onclick={() => { closePopover(); onLogout(); }}
          class="w-full flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-extrabold text-rose-600 hover:bg-rose-50 transition-all text-left cursor-pointer"
        >
          <span>🚪</span>
          <span>Đăng Xuất Khỏi Thiết Bị</span>
        </button>
      </div>
    </div>
  {/if}

  <!-- Main 3D Framed Dockbar Container -->
  {#if isCollapsed}
    <button
      type="button"
      data-testid="dockbar-expand-btn"
      onclick={() => isCollapsed = false}
      class="dockbar-shell pointer-events-auto flex items-center gap-2.5 px-5 py-2.5 rounded-full bg-surface-0/95 backdrop-blur-2xl text-xs font-extrabold text-ink-900 hover:scale-108 transition-all cursor-pointer"
      title="Mở rộng thanh Dockbar điều hướng"
    >
      <span class="w-6 h-6 rounded-lg bg-brand-700 text-white flex items-center justify-center text-xs">👩‍🏫</span>
      <span>Mở Dockbar Tiếng Anh Cô Dung</span>
      <span class="text-brand-600">▲</span>
    </button>
  {:else}
    <nav
      aria-label="Dockbar Điều Hướng Trung Tâm"
      onmousemove={handleMouseMove}
      onmouseleave={handleMouseLeave}
      class="dockbar-shell pointer-events-auto flex items-end gap-1.5 xl:gap-2 px-3.5 py-2.5 rounded-3xl bg-surface-0/95 backdrop-blur-2xl"
    >
      <!-- Brand Identity Tile (Replaces Top Header Logo) -->
      <a
        href="/"
        onclick={closePopover}
        bind:this={itemRefs['brand']}
        onmouseenter={() => hoveredId = 'brand'}
        onmouseleave={() => { if (hoveredId === 'brand') hoveredId = null; }}
        style="transform: translateY({getItemTransform('brand').liftY}px) scale({getItemTransform('brand').scale}); margin-left: {getItemTransform('brand').padX}px; margin-right: {getItemTransform('brand').padX}px;"
        class="dockbar-item relative flex flex-col items-center group pr-1"
        title="Tiếng Anh Cô Dung — Trang Chủ K12 & Quốc Tế"
      >
        <div
          class="pointer-events-none absolute -top-10 left-1/2 -translate-x-1/2 px-2.5 py-1 rounded-xl bg-stone-900 text-white text-[11px] font-bold whitespace-nowrap border border-stone-700 shadow-lg transition-all duration-150 {hoveredId === 'brand' ? 'opacity-100 -translate-y-1 scale-100' : 'opacity-0 translate-y-1 scale-95'}"
        >
          Tiếng Anh Cô Dung • 2026 CTGDPT
        </div>
        <div class="dockbar-tile-icon w-11 h-11 rounded-2xl bg-brand-700 text-white border-2 border-brand-600 ring-2 ring-brand-200 flex items-center justify-center text-xl shadow-md">
          👩‍🏫
        </div>
        <span class="mt-1 px-2 py-0.5 rounded-md text-[10px] font-extrabold tracking-tight bg-brand-50 text-brand-700 border border-brand-200 whitespace-nowrap">
          Cô Dung
        </span>
        <span class="mt-0.5 h-1 w-2 rounded-full bg-transparent"></span>
      </a>

      <!-- Vertical Divider -->
      <div class="h-11 w-0.5 rounded-full bg-line/90 mx-0.5 self-center"></div>

      <!-- 8 Main App Modules with 3D Framed Tiles & Smooth Zoom In-Out -->
      {#each dockItems as item (item.id)}
        {@const active = item.match($page.url.pathname)}
        {@const tf = getItemTransform(item.id)}
        <div
          bind:this={itemRefs[item.id]}
          style="transform: translateY({tf.liftY}px) scale({tf.scale}); margin-left: {tf.padX}px; margin-right: {tf.padX}px;"
          class="dockbar-item relative flex flex-col items-center group"
        >
          <!-- Floating Tooltip Badge on Hover (Hidden if Launchpad Popover is already open) -->
          <div
            class="pointer-events-none absolute -top-11 left-1/2 -translate-x-1/2 px-3 py-1 rounded-xl bg-stone-900 text-white text-[11px] font-bold whitespace-nowrap border border-stone-700 shadow-lg transition-all duration-150 z-40 {hoveredId === item.id && activeLauncher !== item.id ? 'opacity-100 -translate-y-1 scale-100' : 'opacity-0 translate-y-1 scale-95'}"
          >
            <span>{item.label}</span>
            <span class="text-stone-300 font-normal ml-1">• {item.sub}</span>
            {#if item.hasPopover}
              <span class="ml-1 text-amber-300">▴</span>
            {/if}
          </div>

          <a
            href={item.href}
            data-testid={`dock-item-${item.id}`}
            onmouseenter={() => hoveredId = item.id}
            onfocus={() => hoveredId = item.id}
            onblur={() => { if (hoveredId === item.id) hoveredId = null; }}
            onclick={(e) => togglePopover(item, e)}
            class="flex flex-col items-center focus:outline-none"
            aria-current={active ? 'page' : undefined}
          >
            <!-- Sculpted 3D Squircle App Icon Tile with Distinct Border -->
            <div
              class="dockbar-tile-icon relative w-11 h-11 rounded-2xl border-2 flex items-center justify-center text-xl select-none {active
                ? 'bg-brand-600 text-white border-brand-700 ring-2 ring-brand-300 shadow-md'
                : activeLauncher === item.id
                  ? 'bg-brand-50 text-brand-700 border-brand-600 ring-2 ring-brand-200 shadow-md'
                  : `${item.tileAccent} group-hover:border-brand-600 group-hover:bg-surface-0 shadow-xs`}"
            >
              <span>{item.icon}</span>
              {#if item.hasPopover}
                <span
                  class="absolute -top-1 -right-1 w-4 h-4 rounded-full text-[9px] font-black flex items-center justify-center border shadow-2xs transition-transform duration-150 {active ? 'bg-amber-400 text-stone-900 border-white' : 'bg-surface-0 text-brand-700 border-brand-300'} {activeLauncher === item.id ? 'rotate-180' : ''}"
                >
                  ▴
                </span>
              {/if}
            </div>

            <!-- Framed Label Pill Underneath Tile -->
            <span
              class="mt-1 px-2 py-0.5 rounded-md text-[10px] font-extrabold tracking-tight whitespace-nowrap border transition-colors {active
                ? 'bg-brand-600 text-white border-brand-700 shadow-2xs'
                : activeLauncher === item.id
                  ? 'bg-brand-50 text-brand-700 border-brand-400'
                  : 'bg-surface-0/95 text-ink-900 border-stone-300/80 group-hover:border-brand-600 group-hover:text-brand-700'}"
            >
              {item.label}
            </span>
          </a>

          <!-- Active Route Indicator Dot -->
          <span
            class="mt-0.5 h-1 rounded-full transition-all duration-200 {active ? 'w-5 bg-brand-600' : hoveredId === item.id ? 'w-2.5 bg-brand-500' : 'w-1 bg-transparent'}"
          ></span>
        </div>
      {/each}

      <!-- Vertical Divider -->
      <div class="h-11 w-0.5 rounded-full bg-line/90 mx-0.5 self-center"></div>

      <!-- System Controls Tray (Theme, Notifications, User Profile / Login) -->
      <div class="flex items-center gap-1.5 self-center pb-1">
        <!-- Theme Switcher -->
        <div class="hidden xl:block">
          <ThemeSwitcher />
        </div>

        <!-- Personal Color Studio Button -->
        <button
          type="button"
          onclick={onOpenPersonalTheme}
          title="Màu sắc cá nhân"
          aria-label="Chọn màu sắc cá nhân"
          class="dockbar-item relative w-9 h-9 rounded-xl border-2 border-stone-300/90 hover:border-brand-600 bg-surface-1 hover:bg-surface-0 text-sm flex items-center justify-center transition-all hover:scale-120 hover:-translate-y-1.5 cursor-pointer"
        >
          <span>🎨</span>
          {#if hasPersonalTheme}
            <span class="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-brand-600 ring-2 ring-surface-0"></span>
          {/if}
        </button>

        {#if currentUser}
          <!-- Universal Notification Bell -->
          <button
            type="button"
            onclick={onOpenNotificationModal}
            title="Thông Báo Học Vụ"
            aria-label="Thông Báo Học Vụ"
            class="dockbar-item relative w-9 h-9 rounded-xl border-2 border-stone-300/90 hover:border-brand-600 bg-surface-1 hover:bg-surface-0 text-sm flex items-center justify-center transition-all hover:scale-120 hover:-translate-y-1.5 cursor-pointer"
          >
            <span>🔔</span>
            {#if userUnreadCount > 0}
              <span class="absolute -top-1.5 -right-1.5 px-1.5 py-0.2 rounded-full bg-rose-600 text-[10px] font-extrabold text-white ring-2 ring-white">
                {userUnreadCount > 9 ? '9+' : userUnreadCount}
              </span>
            {/if}
          </button>
        {/if}

        {#if isTeacherOrAdmin(currentUser)}
          <!-- Leader Notification Bell -->
          <button
            type="button"
            data-testid="dock-leader-bell-btn"
            onclick={onOpenLeaderDrawer}
            title="Trung Tâm Báo Cáo & Cảnh Báo Sớm Leader"
            aria-label="Trung Tâm Báo Cáo Leader"
            class="dockbar-item relative w-9 h-9 rounded-xl border-2 border-emerald-400 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 text-sm font-bold flex items-center justify-center transition-all hover:scale-120 hover:-translate-y-1.5 cursor-pointer"
          >
            <span>🛡️</span>
            {#if leaderUnreadCount > 0}
              <span class="absolute -top-1.5 -right-1.5 px-1.5 py-0.2 rounded-full bg-emerald-700 text-[10px] font-extrabold text-white ring-2 ring-white">
                {leaderUnreadCount > 9 ? '9+' : leaderUnreadCount}
              </span>
            {/if}
          </button>
        {/if}

        <!-- User Profile / Login Button (With Standard IDs for E2E & User Access) -->
        {#if currentUser}
          <button
            type="button"
            id="user-profile-btn"
            data-testid="user-profile-btn"
            onclick={toggleUserMenu}
            class="dockbar-item flex items-center gap-1.5 px-2.5 py-1.5 rounded-2xl bg-surface-1 hover:bg-surface-0 border-2 border-brand-600/80 hover:border-brand-600 text-left text-xs shadow-xs transition-all hover:scale-112 hover:-translate-y-1.5 cursor-pointer"
            title="Hồ sơ cá nhân & Đăng xuất"
          >
            <img
              src={currentUser.avatar && !currentUser.avatar.includes('photo-1534528741775-53994a69daeb') ? currentUser.avatar : '/icon.svg'}
              onerror={(e) => { e.currentTarget.onerror = null; e.currentTarget.src = '/icon.svg'; }}
              alt="avatar"
              class="w-7 h-7 rounded-xl object-cover ring-2 ring-brand-600 shrink-0"
            />
            <div class="hidden 2xl:block max-w-[105px]">
              <div class="font-extrabold text-ink-900 truncate text-[11px] leading-tight">
                {currentUser.name}
              </div>
              <div class="text-[9px] uppercase font-bold text-brand-700 truncate">
                {currentUserRoleLabel}
              </div>
            </div>
            <span class="text-[10px] text-brand-700 font-bold">▴</span>
          </button>
        {:else}
          <button
            type="button"
            id="login-btn"
            data-testid="login-btn"
            onclick={onOpenAuth}
            class="dockbar-item flex items-center gap-1.5 px-3.5 py-2 rounded-2xl bg-brand-600 hover:bg-brand-700 border-2 border-brand-700 text-white text-xs font-extrabold shadow-md transition-all hover:scale-115 hover:-translate-y-1.5 cursor-pointer"
            title="Đăng nhập hoặc Đăng ký tài khoản"
          >
            <span>🔑</span>
            <span>Đăng Nhập</span>
          </button>
        {/if}

        <!-- Collapse Dockbar Button -->
        <button
          type="button"
          data-testid="dockbar-collapse-btn"
          onclick={() => { activeLauncher = null; isCollapsed = true; }}
          class="w-8 h-9 rounded-xl bg-surface-1 hover:bg-stone-200/80 border-2 border-stone-300/80 text-ink-500 hover:text-ink-900 text-xs font-bold flex items-center justify-center transition-all duration-150 hover:scale-110 cursor-pointer"
          title="Thu gọn thanh Dockbar"
          aria-label="Thu gọn thanh Dockbar"
        >
          ▾
        </button>
      </div>
    </nav>
  {/if}
</aside>
