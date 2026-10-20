<!-- src/lib/components/ui/DockBar.svelte — Streamlined 3D Framed Floating Dockbar with Smooth Proximity Zoom In-Out -->
<script>
  import { page } from '$app/stores';
  import { isTeacherOrAdmin, isSuperAdmin } from '$lib/unifiedStore';

  let {
    currentUser = null,
    currentUserGrade = ''
  } = $props();

  let mouseX = $state(null);
  let hoveredId = $state(null);
  let activeLauncher = $state(null); // 'courses' | 'exams' | 'tools' | 'workspace' | null
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
        label: 'Lộ Trình',
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
        label: 'Lịch Học',
        sub: 'Thời khóa biểu & Điểm danh',
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
        label: staff ? 'Quản Trị' : 'Sổ Học Vụ',
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
              { href: '/admincp', icon: '⚡', title: 'Admin CP Quản Trị User & Role', desc: 'Phân quyền HS, PH, GV & đổi mật khẩu' },
              { href: '/admin', icon: '💰', title: 'Báo Học Phí & Đổi Sao', desc: 'Khấu trừ sao, xuất phiếu VietQR' },
              { href: '/admin?tab=webhooks', icon: '🤖', title: 'Cấu Hình Zalo Bot (@bot.ynKabJAc)', desc: 'Kiểm tra Token Bot & Webhook timbk.io.vn' }
            ]
          : []
      }
    ];
  });

  function getItemTransform(id) {
    if (mouseX === null) {
      if (hoveredId === id) {
        return { scale: 1.4, liftY: -14, padX: 6 };
      }
      return { scale: 1, liftY: 0, padX: 0 };
    }
    const el = itemRefs[id];
    if (!el) {
      return {
        scale: hoveredId === id ? 1.4 : 1,
        liftY: hoveredId === id ? -14 : 0,
        padX: hoveredId === id ? 6 : 0
      };
    }
    const rect = el.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const distance = Math.abs(mouseX - centerX);
    const maxDistance = 160;
    if (distance >= maxDistance) {
      return { scale: 1, liftY: 0, padX: 0 };
    }
    const ratio = Math.cos((distance / maxDistance) * (Math.PI / 2));
    const eased = Math.pow(Math.max(0, ratio), 1.35);
    const scale = Number((1 + 0.42 * eased).toFixed(3));
    const liftY = Number((-14 * eased).toFixed(2));
    const padX = Number(((scale - 1) * 12).toFixed(1));
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

  function closePopover() {
    activeLauncher = null;
  }

  let activePopoverItem = $derived(dockItems.find(i => i.id === activeLauncher) || null);
</script>

{#if activeLauncher}
  <button
    type="button"
    class="fixed inset-0 z-40 bg-stone-400/15 backdrop-blur-[1px] cursor-default"
    aria-label="Đóng bảng chọn nhanh Dockbar"
    onclick={closePopover}
  ></button>
{/if}

<!-- Streamlined Centered 3D Glass Floating Dockbar -->
<aside
  id="floating-dockbar"
  data-testid="floating-dockbar"
  aria-label="Thanh công cụ Dockbar cố định"
  class="hidden md:flex fixed bottom-3 left-1/2 -translate-x-1/2 z-50 flex-col items-center select-none pointer-events-none"
>
  <!-- Launchpad Module Popover Above Dockbar -->
  {#if activePopoverItem && !isCollapsed}
    <div
      data-testid="dockbar-launchpad-popover"
      class="pointer-events-auto mb-5 w-[36rem] max-w-[94vw] rounded-3xl bg-surface-0/98 backdrop-blur-2xl border-2 border-brand-600/80 ring-4 ring-brand-500/15 shadow-2xl p-4 animate-in fade-in zoom-in-95 duration-150"
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

  <!-- Main Compact 3D Framed Dockbar Capsule -->
  {#if isCollapsed}
    <button
      type="button"
      data-testid="dockbar-expand-btn"
      onclick={() => isCollapsed = false}
      class="dockbar-shell pointer-events-auto flex items-center gap-2 px-4 py-2 rounded-full bg-surface-0/95 backdrop-blur-2xl text-xs font-extrabold text-ink-900 hover:scale-105 transition-all cursor-pointer"
      title="Mở rộng thanh Dockbar điều hướng"
    >
      <span class="w-5 h-5 rounded-lg bg-brand-600 text-white flex items-center justify-center text-[11px]">🏠</span>
      <span>Mở Dockbar Điều Hướng</span>
      <span class="text-brand-600">▲</span>
    </button>
  {:else}
    <nav
      aria-label="Dockbar Điều Hướng Trung Tâm"
      onmousemove={handleMouseMove}
      onmouseleave={handleMouseLeave}
      class="dockbar-shell pointer-events-auto flex items-end gap-1.5 sm:gap-2 px-3 py-2 rounded-3xl bg-surface-0/95 backdrop-blur-2xl"
    >
      {#each dockItems as item (item.id)}
        {@const active = item.match($page.url.pathname)}
        {@const tf = getItemTransform(item.id)}
        <div
          bind:this={itemRefs[item.id]}
          style="transform: translateY({tf.liftY}px) scale({tf.scale}); margin-left: {tf.padX}px; margin-right: {tf.padX}px;"
          class="dockbar-item relative flex flex-col items-center group"
        >
          <!-- Light Glass Floating Tooltip Badge on Hover -->
          <div
            class="pointer-events-none absolute -top-11 left-1/2 -translate-x-1/2 px-3 py-1 rounded-xl bg-surface-0/98 text-ink-900 text-[11px] font-bold whitespace-nowrap border-2 border-brand-500 shadow-lg transition-all duration-150 z-40 {hoveredId === item.id && activeLauncher !== item.id ? 'opacity-100 -translate-y-1 scale-100' : 'opacity-0 translate-y-1 scale-95'}"
          >
            <span class="text-brand-700">{item.label}</span>
            <span class="text-ink-500 font-medium ml-1">• {item.sub}</span>
            {#if item.hasPopover}
              <span class="ml-1 text-amber-600">▴</span>
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
            <!-- Sculpted 3D Squircle App Icon Tile -->
            <div
              class="dockbar-tile-icon relative w-10 h-10 rounded-2xl border-2 flex items-center justify-center text-lg select-none {active
                ? 'bg-brand-600 text-white border-brand-700 ring-2 ring-brand-200 shadow-md'
                : activeLauncher === item.id
                  ? 'bg-brand-50 text-brand-700 border-brand-600 ring-2 ring-brand-200 shadow-md'
                  : `${item.tileAccent} group-hover:border-brand-600 group-hover:bg-surface-0 shadow-2xs`}"
            >
              <span>{item.icon}</span>
              {#if item.hasPopover}
                <span
                  class="absolute -top-1 -right-1 w-3.5 h-3.5 rounded-full text-[8px] font-black flex items-center justify-center border shadow-2xs transition-transform duration-150 {active ? 'bg-amber-400 text-ink-900 border-white' : 'bg-surface-0 text-brand-700 border-brand-300'} {activeLauncher === item.id ? 'rotate-180' : ''}"
                >
                  ▴
                </span>
              {/if}
            </div>

            <!-- Compact Framed Label Pill Underneath Tile -->
            <span
              class="mt-1 px-1.5 py-0.2 rounded-md text-[10px] font-extrabold tracking-tight whitespace-nowrap border transition-colors {active
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
            class="mt-0.5 h-1 rounded-full transition-all duration-200 {active ? 'w-4 bg-brand-600' : hoveredId === item.id ? 'w-2 bg-brand-500' : 'w-1 bg-transparent'}"
          ></span>
        </div>
      {/each}

      <!-- Subtle Divider & Collapse Button -->
      <div class="h-8 w-px bg-line mx-0.5 self-center"></div>
      <button
        type="button"
        data-testid="dockbar-collapse-btn"
        onclick={() => { activeLauncher = null; isCollapsed = true; }}
        class="self-center w-7 h-8 rounded-xl bg-surface-1 hover:bg-brand-50 border border-stone-300/80 hover:border-brand-500 text-ink-500 hover:text-brand-700 text-[11px] font-bold flex items-center justify-center transition-all duration-150 hover:scale-110 cursor-pointer"
        title="Thu gọn thanh Dockbar"
        aria-label="Thu gọn thanh Dockbar"
      >
        ▾
      </button>
    </nav>
  {/if}
</aside>
