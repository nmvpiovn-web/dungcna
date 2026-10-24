<!-- src/lib/components/ui/DockBar.svelte — Layout-Pushing macOS Glass Dockbar with Role-Based CPanel Isolation & Zero-Overlap Physics -->
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
  let dockHeight = $state(88);

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
          { href: '/exam?group=k12', icon: '🎒', title: 'Đề Thi Phổ Thông K12', desc: 'Đề kiểm tra từ Lớp 1 đến Lớp 12' },
          { href: '/exam?group=periodic&cat=quick_15m', icon: '⚡', title: 'Test Nhanh 15 Phút', desc: 'Kiểm tra từ vựng & phản xạ đầu giờ' },
          { href: '/exam?group=periodic&cat=standard_45m', icon: '📝', title: 'Đề Kiểm Tra 1 Tiết (45p)', desc: 'Ma trận chuẩn Bộ GD&ĐT 2026' },
          { href: '/exam?group=intl&cat=ielts', icon: '🎙️', title: 'Phòng Thi IELTS 4 Kỹ Năng', desc: 'Nghe, Đọc, Viết & Ghi âm Nói' },
          { href: '/exam?group=random_builder', icon: '🎲', title: 'Tạo Đề Ngẫu Nhiên D1', desc: 'Sinh đề 5p • 15p • 45p từ 1,375+ câu' },
          { href: '/exam#placement', icon: '🎯', title: 'Test Đầu Vào Xếp Lớp', desc: 'Đánh giá năng lực CEFR miễn phí' }
        ]
      },
      {
        id: 'quiz',
        href: '/quiz-menu',
        icon: '🧩',
        label: 'Quiz Menu',
        sub: 'Làm bài • Tạo đề AI • Kho D1',
        iconBg: 'bg-gradient-to-b from-rose-400 via-pink-500 to-rose-600 text-white border-white/85',
        hasPopover: true,
        match: (p) => p === '/quiz-menu' || p.startsWith('/quiz-menu/'),
        children: [
          { href: '/quiz-menu?tab=take', icon: '▶', title: 'Làm Bài Quiz Công Khai', desc: 'Luyện tập 8 dạng câu hỏi tương tác' },
          { href: '/quiz-menu?tab=take&grade=tieu_hoc', icon: '📘', title: 'Quiz Tiểu Học (Lớp 1–5)', desc: 'Phonics & từ vựng Cambridge cấp 1' },
          { href: '/quiz-menu?tab=take&grade=thcs', icon: '📗', title: 'Quiz THCS (Lớp 6–9)', desc: 'Global Success & KET/PET cấp 2' },
          { href: '/quiz-menu?tab=take&grade=thpt', icon: '📙', title: 'Quiz THPT & IELTS', desc: 'Ngữ pháp nâng cao & Luyện thi ĐH' },
          ...(staff ? [
            { href: '/quiz-menu?tab=create&mode=auto', icon: '⚡', title: 'Tạo Đề Quiz Tự Động (AI)', desc: 'Sinh đề từ File/OCR, Drive, D1 & Kho Tri Thức' },
            { href: '/quiz-menu?tab=create&mode=auto&source=question_bank', icon: '📚', title: 'Kho Câu Hỏi D1 (1,375+ Câu)', desc: 'Lọc & nhập trực tiếp câu hỏi chuẩn D1' },
            { href: '/quiz-menu?tab=create&mode=manual', icon: '✍️', title: 'Soạn Đề Thủ Công', desc: 'Tự biên tập từng câu hỏi chi tiết' },
            { href: '/quiz-menu?tab=mine', icon: '▤', title: 'Quản Lý Kho Đề & Giao BTVN', desc: 'Đồng bộ Google Docs & giao bài theo ca' }
          ] : []),
          ...(userRoleType === 'parent' ? [
            { href: '/quiz-menu?tab=results', icon: '📊', title: 'Kết Quả Làm Quiz Của Con', desc: 'Theo dõi điểm số & tiến độ của con' }
          ] : [])
        ]
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
        icon: '📋',
        label: 'Điểm Danh',
        sub: 'Sổ điểm danh & Lịch học',
        iconBg: 'bg-gradient-to-b from-teal-400 via-cyan-500 to-sky-600 text-white border-white/85',
        hasPopover: true,
        match: (p) => p === '/schedule' || p.startsWith('/schedule/'),
        children: [
          { href: '/schedule?view=rollcall', icon: '📋', title: 'Bảng Điểm Danh Nhanh', desc: 'Điểm danh 1 chạm theo ca & gửi Zalo' },
          { href: '/schedule?view=calendar', icon: '📅', title: 'Thời Khóa Biểu Tuần (7 Ngày)', desc: 'Lịch học Sáng • Chiều • Tối trực quan' },
          { href: '/schedule?view=sessions', icon: '📚', title: 'Danh Sách Ca Học & BTVN', desc: 'Chi tiết sĩ số, gắn BTVN & đối soát' },
          ...(staff ? [
            { href: '/schedule?view=alerts', icon: '🔔', title: 'Trung Tâm Báo Cáo & Nhắc Lịch', desc: 'Quét lịch học, điểm danh & hạn học phí' },
            { href: '/session-audit', icon: '📊', title: 'Đối Soát Chất Lượng Ca Dạy', desc: 'Kiểm tra học liệu & tỷ lệ làm BTVN' }
          ] : [])
        ]
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
          id: 'workspace',
          href: '/cpanel/student',
          icon: '🎒',
          label: 'Sổ Học Sinh',
          sub: `Bàn học tập & BTVN ${currentUserGrade ? `(${currentUserGrade})` : ''}`,
          iconBg: 'bg-gradient-to-b from-cyan-500 via-sky-500 to-blue-600 text-white border-white/85',
          hasPopover: true,
          match: (p) => p.startsWith('/cpanel/student') || p.startsWith('/evaluations'),
          children: [
            { href: '/cpanel/student', icon: '🎒', title: 'Bàn Học Tập & BTVN Của Em', desc: 'Xem bài tập giáo viên giao & lời phê' },
            { href: '/quiz-menu', icon: '🧩', title: 'Làm Quiz Trắc Nghiệm Lớp Em', desc: 'Luyện phản xạ từ vựng & ngữ pháp' },
            { href: '/evaluations', icon: '📈', title: 'Hồ Sơ Năng Lực 5 Kỹ Năng', desc: 'Biểu đồ Nghe • Nói • Đọc • Viết • Ngữ pháp' },
            { href: '/schedule', icon: '📅', title: 'Lịch Học Của Lớp Em', desc: 'Xem giờ học & phòng học tuần này' }
          ]
        }
      ];
    }

    if (userRoleType === 'parent') {
      return [
        {
          id: 'workspace',
          href: '/cpanel/parent',
          icon: '👨‍👩‍👧',
          label: 'Sổ Phụ Huynh',
          sub: 'Sổ liên lạc & Học phí của con',
          iconBg: 'bg-gradient-to-b from-purple-500 via-violet-500 to-indigo-600 text-white border-white/85',
          hasPopover: true,
          match: (p) => p.startsWith('/cpanel/parent') || p.startsWith('/evaluations'),
          children: [
            { href: '/cpanel/parent', icon: '👨‍👩‍👧', title: 'Sổ Liên Lạc & Học Phí Của Con', desc: 'Theo dõi BTVN, chuyên cần & mã VietQR' },
            { href: '/schedule', icon: '🗓️', title: 'Lịch Học & Giờ Đưa Đón Con', desc: 'Xem lịch học tại 3 cơ sở của con' },
            { href: '/evaluations', icon: '📈', title: 'Biểu Đồ Năng Lực 5 Kỹ Năng', desc: 'Đánh giá chi tiết sự tiến bộ của con' },
            { href: '/quiz-menu?tab=results', icon: '🧩', title: 'Kết Quả Làm Quiz Của Con', desc: 'Lịch sử điểm số các bài trắc nghiệm' }
          ]
        }
      ];
    }

    if (userRoleType === 'teacher') {
      return [
        {
          id: 'workspace',
          href: '/cpanel/teacher',
          icon: '👩‍🏫',
          label: 'Sổ Giáo Viên',
          sub: 'Sổ giảng dạy, BTVN & Học liệu',
          iconBg: 'bg-gradient-to-b from-teal-500 via-emerald-600 to-green-600 text-white border-white/85',
          hasPopover: true,
          match: (p) => p.startsWith('/cpanel/teacher') || p.startsWith('/second-brain') || p.startsWith('/drive') || p.startsWith('/session-audit'),
          children: [
            { href: '/cpanel/teacher', icon: '👩‍🏫', title: 'Sổ Giáo Viên & Chấm BTVN', desc: 'Giao bài tập về nhà & chấm bài học sinh' },
            { href: '/session-audit', icon: '📊', title: 'Đối Soát Chất Lượng Ca Dạy', desc: 'Gắn giáo án, tài liệu Drive & BTVN' },
            { href: '/second-brain', icon: '🧠', title: 'Kho Tri Thức Second Brain', desc: 'Chuyên đề sư phạm & giáo án chuẩn' },
            { href: '/drive', icon: '📁', title: 'Kho Tài Liệu Google Drive', desc: 'Truy cập đề cương, PDF & Audio giảng dạy' }
          ]
        }
      ];
    }

    // Leader & SuperAdmin Executive Dock Item (1 unified button instead of 3)
    return [
      {
        id: 'workspace',
        href: '/admincp',
        icon: '👑',
        label: 'AdminCP',
        sub: 'Điều hành toàn hệ thống D1',
        iconBg: 'bg-gradient-to-b from-amber-400 via-amber-500 to-orange-600 text-white border-white/85',
        hasPopover: true,
        match: (p) => p.startsWith('/admincp') || p.startsWith('/cpanel') || p.startsWith('/admin') || p.startsWith('/session-audit') || p.startsWith('/langflow') || p.startsWith('/second-brain') || p.startsWith('/drive'),
        children: [
          { href: '/admincp', icon: '⚡', title: 'Quản Trị Hệ Thống (AdminCP)', desc: 'Tài khoản, Gán con, Học phí, 3 Cơ sở & Theme Sự kiện' },
          { href: '/cpanel/leader', icon: '👑', title: 'Bàn Điều Hành Leader (Cô Dung)', desc: 'Kiểm soát chất lượng & duyệt lương GV' },
          { href: '/session-audit', icon: '📊', title: 'Đối Soát Chất Lượng Ca Dạy', desc: 'Hồi quy Kho Tri Thức • Drive • Quiz • BTVN' },
          { href: '/langflow', icon: '🕸️', title: 'Langflow CRAG & Zalo Bot', desc: 'Điều khiển luồng AI CRAG & thông báo Zalo' },
          { href: '/cpanel/teacher', icon: '👩‍🏫', title: 'Sổ Giáo Viên', desc: 'Giao & chấm BTVN' },
          { href: '/cpanel/parent', icon: '👨‍👩‍👧', title: 'Sổ Phụ Huynh', desc: 'Xem giao diện phụ huynh' },
          { href: '/cpanel/student', icon: '🎒', title: 'Sổ Học Sinh', desc: 'Xem giao diện học sinh' }
        ]
      }
    ];
  });

  const dockItems = $derived([...coreDockItems, ...roleDockItems]);

  let activePopoverItem = $derived(dockItems.find(i => i.id === activeLauncher) || null);

  // Computed push height: dynamically reserves DockBar height and shrinks popups/floating cards when they touch DockBar
  let computedPushPx = $derived.by(() => {
    if (activePopoverItem) return Math.max(dockHeight + 28, 330);
    return Math.max(dockHeight + 24, 108);
  });

  let popoverShiftPx = $derived.by(() => {
    if (!activePopoverItem) return 0;
    return Math.max(0, computedPushPx - 108);
  });

  function enforcePopupDockClearance() {
    if (typeof document === 'undefined' || typeof window === 'undefined') return;
    const dockEl = document.getElementById('floating-dockbar');
    if (!dockEl) return;
    const dockRect = dockEl.getBoundingClientRect();
    if (dockRect.width === 0 || dockRect.height === 0) return;
    const safeBottomY = Math.max(240, dockRect.top - 14);
    const maxAllowedHeight = Math.max(220, safeBottomY - 20);

    const popupCards = document.querySelectorAll(
      '[role="dialog"] > div, [aria-modal="true"] > div, .fc-popup-overlay > div, div.fixed.inset-0 > div'
    );
    for (const card of popupCards) {
      if (!(card instanceof HTMLElement)) continue;
      if (card.id === 'floating-dockbar' || card.closest('#floating-dockbar')) continue;
      card.style.maxHeight = `${maxAllowedHeight}px`;
      card.dataset.dockCompacted = 'true';
    }
  }

  // Sync dynamic CSS variables to <html> & auto-compact any popup/floating card touching DockBar
  $effect(() => {
    if (typeof document === 'undefined') return;
    const root = document.documentElement;
    root.style.setProperty('--dockbar-push-height', `${computedPushPx}px`);
    root.style.setProperty('--dockbar-popover-shift', `${popoverShiftPx}px`);
    if (activePopoverItem) {
      root.classList.add('dockbar-popover-open');
    } else {
      root.classList.remove('dockbar-popover-open');
    }
    root.classList.remove('dockbar-is-collapsed');
    enforcePopupDockClearance();

    const obs = new MutationObserver(() => enforcePopupDockClearance());
    obs.observe(document.body, { childList: true, subtree: true });
    const onResize = () => enforcePopupDockClearance();
    window.addEventListener('resize', onResize);
    return () => {
      obs.disconnect();
      window.removeEventListener('resize', onResize);
    };
  });

  function getItemTransform(id) {
    if (mouseX === null) {
      if (hoveredId === id) {
        return { scale: 1.38, liftY: -12, padX: 6 };
      }
      return { scale: 1, liftY: 0, padX: 0 };
    }
    const el = itemRefs[id];
    if (!el) {
      return {
        scale: hoveredId === id ? 1.38 : 1,
        liftY: hoveredId === id ? -12 : 0,
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
    const eased = Math.pow(Math.max(0, ratio), 1.4);
    const scale = Number((1 + 0.40 * eased).toFixed(3));
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
</script>

<!-- In-Flow Layout Pusher: Physically reserves DockBar + Popover height in the document flow so cards/divs are pushed up -->
<div
  id="dockbar-layout-pusher"
  data-testid="dockbar-layout-pusher"
  aria-hidden="true"
  style="height: {computedPushPx}px;"
  class="hidden lg:block w-full shrink-0 pointer-events-none transition-[height] duration-200 ease-out"
></div>

{#if activeLauncher}
  <button
    type="button"
    class="fixed inset-0 z-[115] bg-stone-400/10 cursor-default"
    aria-label="Đóng bảng chọn nhanh Dockbar"
    onclick={closePopover}
  ></button>
{/if}

<!-- Authentic macOS Glass Dockbar: ALWAYS VISIBLE (fixed bottom-2.5 z-[120]), NEVER hidden, NEVER sent to footer; Popups/Cards touching it auto-compact above it -->
<aside
  id="floating-dockbar"
  data-testid="floating-dockbar"
  bind:clientHeight={dockHeight}
  aria-label="Thanh công cụ Dockbar luôn hiện cố định"
  class="hidden lg:flex fixed bottom-2.5 left-1/2 -translate-x-1/2 z-[120] flex-col items-center select-none pointer-events-none"
>
  <!-- macOS Launchpad Popover Above Dockbar (Full Grid, Zero Slide-Bar, Zero Truncate, Pushes Main Content Up) -->
  {#if activePopoverItem && !isCollapsed}
    <div
      data-testid="dockbar-launchpad-popover"
      class="pointer-events-auto mb-3 w-[54rem] max-w-[96vw] rounded-[24px] bg-white/98 backdrop-blur-2xl border-2 border-brand-500/80 ring-4 ring-brand-500/15 shadow-2xl p-4 animate-in fade-in zoom-in-95 duration-150"
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

      <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
        {#each activePopoverItem.children as child}
          <a
            href={child.href}
            onclick={closePopover}
            class="group flex items-start gap-3 p-3 rounded-2xl border-2 border-stone-200/90 bg-white hover:bg-brand-50/70 hover:border-brand-600 transition-all duration-150 hover:scale-[1.01] shadow-2xs"
          >
            <div class="w-10 h-10 rounded-[12px] bg-surface-1 group-hover:bg-white border border-stone-200 group-hover:border-brand-500 flex items-center justify-center text-lg shrink-0 shadow-2xs group-hover:scale-110 transition-transform">
              {child.icon}
            </div>
            <div class="min-w-0">
              <div class="text-xs font-extrabold text-ink-900 group-hover:text-brand-700 leading-snug">{child.title}</div>
              <div class="text-[11px] text-ink-500 leading-relaxed mt-0.5">{child.desc}</div>
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
      class="dockbar-shell pointer-events-auto flex items-center gap-2 px-4 py-1.5 rounded-full bg-white/95 backdrop-blur-2xl text-xs font-extrabold text-ink-900 hover:scale-105 transition-all cursor-pointer"
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
      class="dockbar-shell pointer-events-auto flex items-end gap-2 px-3.5 pt-2 pb-1.5 rounded-[24px] bg-white/90 backdrop-blur-2xl"
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
            class="pointer-events-none absolute -top-10 left-1/2 -translate-x-1/2 px-3 py-1 rounded-xl bg-white/98 text-ink-900 text-[11px] font-bold whitespace-nowrap border-2 border-brand-500/90 shadow-xl transition-all duration-150 z-40 {hoveredId === item.id && activeLauncher !== item.id ? 'opacity-100 -translate-y-1 scale-100' : 'opacity-0 translate-y-1 scale-95'}"
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
              class="dockbar-tile-icon relative w-10 h-10 rounded-[13px] border-2 flex items-center justify-center text-[19px] select-none overflow-hidden {item.iconBg} {active
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
      <div class="h-9 w-[1.5px] rounded-full bg-stone-400/45 mx-1 self-center mb-2"></div>

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
            class="pointer-events-none absolute -top-10 left-1/2 -translate-x-1/2 px-3 py-1 rounded-xl bg-white/98 text-ink-900 text-[11px] font-bold whitespace-nowrap border-2 border-brand-500/90 shadow-xl transition-all duration-150 z-40 {hoveredId === item.id && activeLauncher !== item.id ? 'opacity-100 -translate-y-1 scale-100' : 'opacity-0 translate-y-1 scale-95'}"
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
              class="dockbar-tile-icon relative w-10 h-10 rounded-[13px] border-2 flex items-center justify-center text-[19px] select-none overflow-hidden {item.iconBg} {active
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


    </nav>
  {/if}
</aside>
