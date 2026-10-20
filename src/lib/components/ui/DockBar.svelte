<!-- src/lib/components/ui/DockBar.svelte — Authentic macOS Glass Dockbar with Role-Based CPanel Isolation & Smooth Magnification -->
<script>
  import { page } from '$app/stores';
  import { isTeacherOrAdmin, isSuperAdmin } from '$lib/unifiedStore';

  let {
    currentUser = null,
    currentUserGrade = ''
  } = $props();

  let mouseX = $state(null);
  let hoveredId = $state(null);
  let activeLauncher = $state(null);
  let isCollapsed = $state(false);
  let itemRefs = $state({});

  const userRoleType = $derived.by(() => {
    if (!currentUser) return 'guest';
    if (isSuperAdmin(currentUser)) return 'superadmin';
    if (currentUser.role === 'leader') return 'leader';
    if (currentUser.role === 'teacher') return 'teacher';
    if (currentUser.role === 'parent') return 'parent';
    return 'student';
  });

  // Core Public & Learning Apps (Left side of macOS Dock Divider)
  const coreDockItems = $derived.by(() => {
    const staff = isTeacherOrAdmin(currentUser);
    return [
      {
        id: 'home',
        href: '/',
        icon: '🏠',
        label: 'Trang Chủ',
        sub: 'Tổng quan & Lộ trình',
        iconBg: 'bg-gradient-to-b from-sky-400 via-cyan-500 to-teal-600 text-white border-white/85',
        match: (p) => p === '/'
      },
      {
        id: 'courses',
        href: '/courses',
        icon: '📚',
        label: 'Lộ Trình',
        sub: '19 Khóa học & Trường học',
        iconBg: 'bg-gradient-to-b from-emerald-400 via-emerald-500 to-teal-600 text-white border-white/85',
        hasPopover: true,
        match: (p) => p.startsWith('/courses') || p.startsWith('/truong-hoc') || p.startsWith('/recruitment'),
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
        iconBg: 'bg-gradient-to-b from-amber-400 via-orange-500 to-rose-500 text-white border-white/85',
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
        iconBg: 'bg-gradient-to-b from-rose-400 via-pink-500 to-rose-600 text-white border-white/85',
        match: (p) => p === '/quiz-menu' || p.startsWith('/quiz-menu/')
      },
      {
        id: 'tools',
        href: '/tools',
        icon: '🛠️',
        label: 'Công Cụ',
        sub: 'Từ điển • Flashcard • Game',
        iconBg: 'bg-gradient-to-b from-violet-400 via-purple-500 to-indigo-600 text-white border-white/85',
        hasPopover: true,
        match: (p) => ['/tools', '/dictionary', '/flashcards', '/games', '/grammar', '/pedagogy'].some(x => p === x || p.startsWith(x + '/')),
        children: [
          { href: '/dictionary', icon: '📖', title: 'Từ Điển Cambridge & IPA', desc: 'Tra cứu phát âm chuẩn bản ngữ' },
          { href: '/flashcards', icon: '🗂️', title: 'Flashcard Ngữ Âm 3D', desc: 'Ghi nhớ từ vựng đa giác quan' },
          { href: '/games', icon: '🎮', title: 'Đấu Trường Trò Chơi', desc: 'Speed Match & Meteor Rush' },
          { href: '/grammar', icon: '📐', title: 'Chuyên Đề Ngữ Pháp K12', desc: '14 chuyên đề & công thức cốt lõi' },
          ...(staff ? [{ href: '/pedagogy', icon: '👨‍🏫', title: 'Giáo Án 5512 & Học Liệu', desc: 'Phương pháp sư phạm chuẩn mực' }] : []),
          { href: '/tools', icon: '🧭', title: 'Tất Cả Công Cụ Học Tập', desc: 'Trung tâm bổ trợ kỹ năng' }
        ]
      },
      {
        id: 'schedule',
        href: '/schedule',
        icon: '📅',
        label: 'Lịch Học',
        sub: 'Thời khóa biểu & Điểm danh',
        iconBg: 'bg-gradient-to-b from-teal-400 via-cyan-500 to-sky-600 text-white border-white/85',
        match: (p) => p === '/schedule' || p.startsWith('/schedule/')
      }
    ];
  });

  // Role-Isolated CPanel & Workspace Apps (Right side of macOS Dock Divider)
  const roleDockItems = $derived.by(() => {
    if (userRoleType === 'guest') {
      return [
        {
          id: 'hall-of-fame',
          href: '/hall-of-fame',
          icon: '🏆',
          label: 'Bảng Vàng',
          sub: 'Vinh danh học viên CEFR',
          iconBg: 'bg-gradient-to-b from-amber-400 via-amber-500 to-orange-600 text-white border-white/85',
          match: (p) => p.startsWith('/hall-of-fame')
        }
      ];
    }

    if (userRoleType === 'student') {
      return [
        {
          id: 'evaluations',
          href: '/evaluations',
          icon: '📈',
          label: 'Đánh Giá',
          sub: 'Hồ sơ năng lực 5 kỹ năng',
          iconBg: 'bg-gradient-to-b from-emerald-400 via-teal-500 to-cyan-600 text-white border-white/85',
          match: (p) => p === '/evaluations' || p.startsWith('/evaluations/')
        },
        {
          id: 'workspace',
          href: '/cpanel/student',
          icon: '🎒',
          label: 'CP Học Sinh',
          sub: `Bàn học tập & BTVN ${currentUserGrade ? `(${currentUserGrade})` : ''}`,
          iconBg: 'bg-gradient-to-b from-cyan-500 via-sky-500 to-blue-600 text-white border-white/85',
          hasPopover: true,
          match: (p) => p.startsWith('/cpanel/student'),
          children: [
            { href: '/cpanel/student', icon: '🎒', title: 'Bàn Học Tập & BTVN Của Em', desc: 'Xem bài tập giáo viên giao & lời phê' },
            { href: '/cpanel/student#homework', icon: '📝', title: 'Làm & Nộp Bài Tập Về Nhà', desc: 'Hoàn thành BTVN nhận sao thưởng' },
            { href: '/quiz-menu', icon: '🧩', title: 'Làm Quiz Trắc Nghiệm Lớp Em', desc: 'Luyện phản xạ từ vựng & ngữ pháp' },
            { href: '/evaluations', icon: '📈', title: 'Hồ Sơ Năng Lực 5 Kỹ Năng', desc: 'Biểu đồ Nghe • Nói • Đọc • Viết • Ngữ pháp' },
            { href: '/schedule', icon: '📅', title: 'Lịch Học Của Lớp Em', desc: 'Xem giờ học & phòng học tuần này' },
            { href: '/exam', icon: '⏱️', title: 'Vào Phòng Thi 15p • 45p', desc: 'Làm bài kiểm tra định kỳ' }
          ]
        }
      ];
    }

    if (userRoleType === 'parent') {
      return [
        {
          id: 'evaluations',
          href: '/evaluations',
          icon: '📈',
          label: 'Đánh Giá Con',
          sub: 'Phiếu nhận xét 5 kỹ năng',
          iconBg: 'bg-gradient-to-b from-emerald-400 via-teal-500 to-cyan-600 text-white border-white/85',
          match: (p) => p === '/evaluations' || p.startsWith('/evaluations/')
        },
        {
          id: 'workspace',
          href: '/cpanel/parent',
          icon: '👨‍👩‍👧',
          label: 'CP Phụ Huynh',
          sub: 'Sổ liên lạc & Học phí của con',
          iconBg: 'bg-gradient-to-b from-purple-500 via-violet-500 to-indigo-600 text-white border-white/85',
          hasPopover: true,
          match: (p) => p.startsWith('/cpanel/parent'),
          children: [
            { href: '/cpanel/parent', icon: '👨‍👩‍👧', title: 'Sổ Liên Lạc Phụ Huynh', desc: 'Tổng quan chuyên cần & kết quả học tập của con' },
            { href: '/cpanel/parent#homework', icon: '📊', title: 'Tiến Độ BTVN & Nhận Xét GV', desc: 'Theo dõi bài tập về nhà & điểm chấm của cô' },
            { href: '/cpanel/parent#tuition', icon: '💳', title: 'Học Phí, Trừ Sao & Mã VietQR', desc: 'Xem phiếu báo học phí khấu trừ sao thưởng' },
            { href: '/schedule', icon: '🗓️', title: 'Lịch Học & Giờ Đưa Đón Con', desc: 'Nhận thông báo Zalo trước giờ tan học 10 phút' },
            { href: '/evaluations', icon: '📈', title: 'Biểu Đồ Năng Lực 5 Kỹ Năng', desc: 'Đánh giá chi tiết sự tiến bộ của con' },
            { href: '/quiz-menu?tab=results', icon: '🧩', title: 'Kết Quả Làm Quiz Của Con', desc: 'Lịch sử điểm số các bài trắc nghiệm' }
          ]
        }
      ];
    }

    if (userRoleType === 'teacher') {
      return [
        {
          id: 'session-audit',
          href: '/session-audit',
          icon: '📊',
          label: 'Đối Soát Ca',
          sub: 'Hồi quy học liệu & Bot Zalo',
          iconBg: 'bg-gradient-to-b from-emerald-500 via-teal-500 to-cyan-600 text-white border-white/85',
          match: (p) => p === '/session-audit' || p.startsWith('/session-audit/')
        },
        {
          id: 'workspace',
          href: '/cpanel/teacher',
          icon: '👩‍🏫',
          label: 'CP Giáo Viên',
          sub: 'Sổ giảng dạy, BTVN & Học liệu',
          iconBg: 'bg-gradient-to-b from-teal-500 via-emerald-600 to-green-600 text-white border-white/85',
          hasPopover: true,
          match: (p) => p.startsWith('/cpanel/teacher') || p.startsWith('/second-brain') || p.startsWith('/drive'),
          children: [
            { href: '/cpanel/teacher', icon: '👩‍🏫', title: 'Sổ Giáo Viên & Giao BTVN', desc: 'Giao bài tập về nhà, gắn đề Quiz cho lớp' },
            { href: '/cpanel/teacher#grading', icon: '✍️', title: 'Chấm Bài Tập & Phê Nhận Xét', desc: 'Chấm điểm BTVN & tặng sao thưởng học sinh' },
            { href: '/session-audit', icon: '📊', title: 'Đối Soát Chất Lượng Ca Dạy', desc: 'Gắn giáo án, tài liệu Drive & xuất hồ sơ 5 phần' },
            { href: '/second-brain', icon: '🧠', title: 'Kho Tri Thức Second Brain', desc: '220+ chuyên đề sư phạm & giáo án chuẩn' },
            { href: '/drive', icon: '📁', title: 'Kho Tài Liệu Google Drive', desc: 'Truy cập đề cương, PDF & Audio giảng dạy' },
            { href: '/evaluations', icon: '📈', title: 'Đánh Giá Năng Lực Học Viên', desc: 'Cập nhật phiếu đánh giá 5 kỹ năng định kỳ' }
          ]
        }
      ];
    }

    // Leader & SuperAdmin Executive Dock Items
    return [
      {
        id: 'session-audit',
        href: '/session-audit',
        icon: '📊',
        label: 'Đối Soát Ca',
        sub: 'Hồi quy học liệu & Bot Zalo',
        iconBg: 'bg-gradient-to-b from-emerald-500 via-teal-500 to-cyan-600 text-white border-white/85',
        match: (p) => p === '/session-audit' || p.startsWith('/session-audit/')
      },
      {
        id: 'workspace',
        href: userRoleType === 'superadmin' ? '/admincp' : '/cpanel/leader',
        icon: '👑',
        label: 'Admin & CP',
        sub: 'Điều hành toàn hệ thống & CPanel',
        iconBg: 'bg-gradient-to-b from-amber-400 via-amber-500 to-orange-600 text-white border-white/85',
        hasPopover: true,
        match: (p) => p.startsWith('/cpanel') || p.startsWith('/admin') || p.startsWith('/second-brain') || p.startsWith('/drive'),
        children: [
          { href: '/admincp', icon: '⚡', title: 'Admin CP Quản Trị User & Role', desc: 'Phân quyền HS, PH, GV & đổi mật khẩu D1' },
          { href: '/cpanel/leader', icon: '👑', title: 'Bàn Điều Hành Leader (Cô Dung)', desc: 'Kiểm soát chất lượng, duyệt đơn & lương GV' },
          { href: '/admin', icon: '💰', title: 'Báo Học Phí, Đổi Sao & VietQR', desc: 'Lập hóa đơn học phí khấu trừ sao thưởng' },
          { href: '/admin?tab=webhooks', icon: '🤖', title: 'Cấu Hình Zalo Bot (@bot.ynKabJAc)', desc: 'Quản lý Token Bot & Webhook timbk.io.vn' },
          { href: '/session-audit', icon: '📊', title: 'Đối Soát Chất Lượng Ca Dạy', desc: 'Hồi quy Kho Tri Thức - Drive - Quiz - BTVN' },
          { href: '/cpanel/teacher', icon: '👩‍🏫', title: 'CPanel Giáo Viên (Giao & Chấm BTVN)', desc: 'Kiểm tra sổ giảng dạy của giáo viên' },
          { href: '/cpanel/parent', icon: '👨‍👩‍👧', title: 'CPanel Phụ Huynh (Kiểm Tra Chéo)', desc: 'Xem giao diện sổ liên lạc phụ huynh' },
          { href: '/cpanel/student', icon: '🎒', title: 'CPanel Học Sinh (Kiểm Tra Chéo)', desc: 'Xem giao diện bàn học tập học sinh' },
          { href: '/second-brain', icon: '🧠', title: 'Kho Tri Thức Obsidian Second Brain', desc: '220+ chuyên đề & giáo án chuẩn 5512' },
          { href: '/drive', icon: '📁', title: 'Kho Tài Liệu Google Drive', desc: 'Đồng bộ đề cương & học liệu số' }
        ]
      }
    ];
  });

  const dockItems = $derived([...coreDockItems, ...roleDockItems]);

  function getItemTransform(id) {
    if (mouseX === null) {
      if (hoveredId === id) {
        return { scale: 1.48, liftY: -16, padX: 8 };
      }
      return { scale: 1, liftY: 0, padX: 0 };
    }
    const el = itemRefs[id];
    if (!el) {
      return {
        scale: hoveredId === id ? 1.48 : 1,
        liftY: hoveredId === id ? -16 : 0,
        padX: hoveredId === id ? 8 : 0
      };
    }
    const rect = el.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const distance = Math.abs(mouseX - centerX);
    const maxDistance = 170;
    if (distance >= maxDistance) {
      return { scale: 1, liftY: 0, padX: 0 };
    }
    const ratio = Math.cos((distance / maxDistance) * (Math.PI / 2));
    const eased = Math.pow(Math.max(0, ratio), 1.4);
    const scale = Number((1 + 0.50 * eased).toFixed(3));
    const liftY = Number((-18 * eased).toFixed(2));
    const padX = Number(((scale - 1) * 15).toFixed(1));
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

<!-- Authentic macOS Sonoma / Sequoia Glass Floating Dockbar -->
<aside
  id="floating-dockbar"
  data-testid="floating-dockbar"
  aria-label="Thanh công cụ Dockbar cố định"
  class="hidden md:flex fixed bottom-3 left-1/2 -translate-x-1/2 z-50 flex-col items-center select-none pointer-events-none"
>
  <!-- macOS Launchpad Popover Above Dockbar -->
  {#if activePopoverItem && !isCollapsed}
    <div
      data-testid="dockbar-launchpad-popover"
      class="pointer-events-auto mb-6 w-[38rem] max-w-[94vw] rounded-[28px] bg-white/95 backdrop-blur-2xl border-2 border-brand-500/80 ring-4 ring-brand-500/15 shadow-2xl p-4 animate-in fade-in zoom-in-95 duration-150"
    >
      <div class="flex items-center justify-between pb-3 mb-3 border-b border-line">
        <div class="flex items-center gap-2.5">
          <span class="w-10 h-10 rounded-[13px] {activePopoverItem.iconBg} border-2 flex items-center justify-center text-lg font-bold shadow-sm">
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

      <div class="grid grid-cols-2 gap-2.5 max-h-[58vh] overflow-y-auto pr-0.5">
        {#each activePopoverItem.children as child}
          <a
            href={child.href}
            onclick={closePopover}
            class="group flex items-start gap-3 p-2.5 rounded-2xl border-2 border-stone-200/90 bg-white hover:bg-brand-50/70 hover:border-brand-600 transition-all duration-150 hover:scale-[1.02] shadow-2xs"
          >
            <div class="w-10 h-10 rounded-[12px] bg-surface-1 group-hover:bg-white border border-stone-200 group-hover:border-brand-500 flex items-center justify-center text-lg shrink-0 shadow-2xs group-hover:scale-110 transition-transform">
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

  <!-- Main macOS Glass Shelf Container -->
  {#if isCollapsed}
    <button
      type="button"
      data-testid="dockbar-expand-btn"
      onclick={() => isCollapsed = false}
      class="dockbar-shell pointer-events-auto flex items-center gap-2 px-4 py-2 rounded-full bg-white/90 backdrop-blur-2xl text-xs font-extrabold text-ink-900 hover:scale-105 transition-all cursor-pointer"
      title="Mở rộng thanh Dockbar điều hướng"
    >
      <span class="w-5 h-5 rounded-lg bg-brand-600 text-white flex items-center justify-center text-[11px]">🏠</span>
      <span>Mở macOS Dock</span>
      <span class="text-brand-600">▲</span>
    </button>
  {:else}
    <nav
      aria-label="Dockbar Điều Hướng Trung Tâm"
      onmousemove={handleMouseMove}
      onmouseleave={handleMouseLeave}
      class="dockbar-shell pointer-events-auto flex items-end gap-2 px-3.5 pt-2.5 pb-1.5 rounded-[26px] bg-white/82 backdrop-blur-2xl"
    >
      <!-- Left Group: 6 Core Learning Apps -->
      {#each coreDockItems as item (item.id)}
        {@const active = item.match($page.url.pathname)}
        {@const tf = getItemTransform(item.id)}
        <div
          bind:this={itemRefs[item.id]}
          style="transform: translateY({tf.liftY}px) scale({tf.scale}); margin-left: {tf.padX}px; margin-right: {tf.padX}px;"
          class="dockbar-item relative flex flex-col items-center group"
        >
          <!-- macOS Floating Pill Tooltip with Pointer Arrow -->
          <div
            class="pointer-events-none absolute -top-11 left-1/2 -translate-x-1/2 px-3 py-1 rounded-xl bg-white/98 text-ink-900 text-[11px] font-bold whitespace-nowrap border-2 border-brand-500/90 shadow-xl transition-all duration-150 z-40 {hoveredId === item.id && activeLauncher !== item.id ? 'opacity-100 -translate-y-1.5 scale-100' : 'opacity-0 translate-y-1 scale-95'}"
          >
            <span class="text-brand-700 font-extrabold">{item.label}</span>
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
            <!-- Authentic 3D macOS Squircle App Icon -->
            <div
              class="dockbar-tile-icon relative w-11 h-11 rounded-[14px] border-2 flex items-center justify-center text-[21px] select-none overflow-hidden {item.iconBg} {active
                ? 'ring-2 ring-brand-600 ring-offset-1 ring-offset-white shadow-lg'
                : activeLauncher === item.id
                  ? 'ring-2 ring-amber-500 ring-offset-1 ring-offset-white shadow-lg'
                  : 'shadow-md'}"
            >
              <!-- Glossy macOS Specular Top Sheen -->
              <span class="pointer-events-none absolute inset-x-0 top-0 h-1/2 bg-gradient-to-b from-white/40 to-transparent"></span>
              <span class="relative z-10 drop-shadow-2xs">{item.icon}</span>
              {#if item.hasPopover}
                <span
                  class="absolute top-0.5 right-0.5 w-3.5 h-3.5 rounded-full text-[8px] font-black flex items-center justify-center bg-white/95 text-brand-700 border border-brand-300 shadow-2xs z-20 transition-transform duration-150 {activeLauncher === item.id ? 'rotate-180 bg-amber-300 text-ink-900' : ''}"
                >
                  ▴
                </span>
              {/if}
            </div>

            <!-- Compact Label Under Squircle -->
            <span
              class="mt-1 px-1.5 py-0.2 rounded-md text-[10px] font-extrabold tracking-tight whitespace-nowrap transition-colors {active
                ? 'bg-brand-600 text-white shadow-2xs'
                : 'text-ink-900 group-hover:text-brand-700'}"
            >
              {item.label}
            </span>
          </a>

          <!-- macOS Active Running Indicator Dot -->
          <span
            class="mt-0.5 h-1 rounded-full transition-all duration-200 {active ? 'w-3.5 bg-brand-600 shadow-2xs' : hoveredId === item.id ? 'w-1.5 bg-brand-400' : 'w-1 bg-transparent'}"
          ></span>
        </div>
      {/each}

      <!-- macOS Vertical Glass Separator between Learning Apps & Role CPanel Apps -->
      <div class="h-10 w-[1.5px] rounded-full bg-stone-400/45 mx-1 self-center mb-2"></div>

      <!-- Right Group: Role-Specific CPanel & Audit Apps -->
      {#each roleDockItems as item (item.id)}
        {@const active = item.match($page.url.pathname)}
        {@const tf = getItemTransform(item.id)}
        <div
          bind:this={itemRefs[item.id]}
          style="transform: translateY({tf.liftY}px) scale({tf.scale}); margin-left: {tf.padX}px; margin-right: {tf.padX}px;"
          class="dockbar-item relative flex flex-col items-center group"
        >
          <div
            class="pointer-events-none absolute -top-11 left-1/2 -translate-x-1/2 px-3 py-1 rounded-xl bg-white/98 text-ink-900 text-[11px] font-bold whitespace-nowrap border-2 border-brand-500/90 shadow-xl transition-all duration-150 z-40 {hoveredId === item.id && activeLauncher !== item.id ? 'opacity-100 -translate-y-1.5 scale-100' : 'opacity-0 translate-y-1 scale-95'}"
          >
            <span class="text-brand-700 font-extrabold">{item.label}</span>
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
            <div
              class="dockbar-tile-icon relative w-11 h-11 rounded-[14px] border-2 flex items-center justify-center text-[21px] select-none overflow-hidden {item.iconBg} {active
                ? 'ring-2 ring-brand-600 ring-offset-1 ring-offset-white shadow-lg'
                : activeLauncher === item.id
                  ? 'ring-2 ring-amber-500 ring-offset-1 ring-offset-white shadow-lg'
                  : 'shadow-md'}"
            >
              <span class="pointer-events-none absolute inset-x-0 top-0 h-1/2 bg-gradient-to-b from-white/40 to-transparent"></span>
              <span class="relative z-10 drop-shadow-2xs">{item.icon}</span>
              {#if item.hasPopover}
                <span
                  class="absolute top-0.5 right-0.5 w-3.5 h-3.5 rounded-full text-[8px] font-black flex items-center justify-center bg-white/95 text-brand-700 border border-brand-300 shadow-2xs z-20 transition-transform duration-150 {activeLauncher === item.id ? 'rotate-180 bg-amber-300 text-ink-900' : ''}"
                >
                  ▴
                </span>
              {/if}
            </div>

            <span
              class="mt-1 px-1.5 py-0.2 rounded-md text-[10px] font-extrabold tracking-tight whitespace-nowrap transition-colors {active
                ? 'bg-brand-600 text-white shadow-2xs'
                : 'text-ink-900 group-hover:text-brand-700'}"
            >
              {item.label}
            </span>
          </a>

          <span
            class="mt-0.5 h-1 rounded-full transition-all duration-200 {active ? 'w-3.5 bg-brand-600 shadow-2xs' : hoveredId === item.id ? 'w-1.5 bg-brand-400' : 'w-1 bg-transparent'}"
          ></span>
        </div>
      {/each}

      <!-- Subtle Minimize Dock Pill -->
      <button
        type="button"
        data-testid="dockbar-collapse-btn"
        onclick={() => { activeLauncher = null; isCollapsed = true; }}
        class="self-center mb-2 ml-0.5 w-6 h-8 rounded-xl bg-white/70 hover:bg-brand-50 border border-stone-300/80 hover:border-brand-500 text-ink-500 hover:text-brand-700 text-[10px] font-bold flex items-center justify-center transition-all duration-150 hover:scale-110 cursor-pointer"
        title="Thu gọn thanh Dockbar"
        aria-label="Thu gọn thanh Dockbar"
      >
        ▾
      </button>
    </nav>
  {/if}
</aside>
