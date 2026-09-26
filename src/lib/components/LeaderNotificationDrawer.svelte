<script>
  import { onMount } from 'svelte';
  import { 
    getAllLeaderNotifications, 
    markNotificationAsRead, 
    markAllNotificationsAsRead, 
    deleteLeaderNotification, 
    clearAllLeaderNotifications, 
    scanScheduleAndAttendanceForLeader, 
    scanTuitionDueAlerts, 
    simulateLeaderNotification, 
    playNotificationChime, 
    requestPwaNotificationPermission,
    addTeacherPrivateReminder
  } from '$lib/unifiedStore';

  let { isOpen = $bindable(false), onClose = () => {} } = $props();

  let notifications = $state([]);
  let activeFilter = $state('all');
  let isSoundEnabled = $state(true);
  let pwaPermissionStatus = $state('default'); // 'default' | 'granted' | 'denied' | 'unsupported'
  let isScanning = $state(false);
  let scanMessage = $state('');
  let teacherReminderSuccess = $state('');

  let unreadCount = $derived(notifications.filter(n => !n.is_read).length);

  let filteredNotifications = $derived.by(() => {
    if (activeFilter === 'all') return notifications;
    if (activeFilter === 'schedule') {
      return notifications.filter(n => n.type === 'schedule_reminder_1h' || n.type === 'schedule_reminder_10m');
    }
    return notifications.filter(n => n.type === activeFilter);
  });

  onMount(() => {
    notifications = getAllLeaderNotifications();

    if (typeof window !== 'undefined' && 'Notification' in window) {
      pwaPermissionStatus = Notification.permission;
    } else {
      pwaPermissionStatus = 'unsupported';
    }

    const handleChange = (e) => {
      notifications = e.detail || getAllLeaderNotifications();
    };

    const handleNewNotif = (e) => {
      notifications = getAllLeaderNotifications();
      if (isSoundEnabled) {
        playNotificationChime(e.detail?.priority || 'normal');
      }
    };

    window.addEventListener('tienganh:leader-notifications-change', handleChange);
    window.addEventListener('tienganh:leader-notification-new', handleNewNotif);

    return () => {
      window.removeEventListener('tienganh:leader-notifications-change', handleChange);
      window.removeEventListener('tienganh:leader-notification-new', handleNewNotif);
    };
  });

  async function handleRequestPermission() {
    const res = await requestPwaNotificationPermission();
    pwaPermissionStatus = res.status;
    if (res.granted) {
      scanMessage = '✅ Đã kích hoạt quyền nhận thông báo PWA trên thiết bị của Cô Dung!';
      setTimeout(() => { scanMessage = ''; }, 4000);
    }
  }

  function handleScanNow() {
    isScanning = true;
    scanMessage = '🔍 Đang rà soát thời khóa biểu hôm nay, sổ điểm danh và hạn học phí...';
    setTimeout(() => {
      const sched = scanScheduleAndAttendanceForLeader();
      const tui = scanTuitionDueAlerts();
      notifications = getAllLeaderNotifications();
      isScanning = false;
      const totalFound = (sched?.length || 0) + (tui?.length || 0);
      scanMessage = totalFound > 0 
        ? `🔔 Đã phát hiện và phát sinh ${totalFound} cảnh báo mới cho Leader!`
        : '✨ Toàn bộ lịch học, điểm danh và học phí đã được đồng bộ chuẩn xác.';
      setTimeout(() => { scanMessage = ''; }, 5000);
    }, 600);
  }

  function handleSimulate(type) {
    simulateLeaderNotification(type);
    notifications = getAllLeaderNotifications();
    if (isSoundEnabled) {
      playNotificationChime(type.includes('urgent') || type.includes('missing') ? 'urgent' : 'normal');
    }
  }

  function handleMarkRead(id) {
    markNotificationAsRead(id);
    notifications = getAllLeaderNotifications();
  }

  function handleMarkAllRead() {
    markAllNotificationsAsRead();
    notifications = getAllLeaderNotifications();
  }

  function handleDelete(id) {
    deleteLeaderNotification(id);
    notifications = getAllLeaderNotifications();
  }

  function handleClearAll() {
    if (confirm('Cô Dung có chắc chắn muốn xóa toàn bộ lịch sử thông báo Leader?')) {
      clearAllLeaderNotifications();
      notifications = [];
    }
  }

  function handleRemindTeacher(notif) {
    const teacherId = notif.meta?.teacherId || 'usr_teach_1';
    const teacherName = notif.meta?.teacherName || 'Giáo viên phụ trách';
    const content = `[Khẩn từ Leader Cô Dung] ${notif.title}: Vui lòng kiểm tra và hoàn thành sổ điểm danh cho lớp "${notif.meta?.className || ''}" ngay!`;
    
    addTeacherPrivateReminder(teacherId, {
      content,
      urgency: 'high'
    });

    handleMarkRead(notif.id);
    teacherReminderSuccess = `Đã gửi lời nhắc khẩn cấp trực tiếp tới ${teacherName}!`;
    setTimeout(() => { teacherReminderSuccess = ''; }, 4000);
  }

  function getBadgeClass(type, priority) {
    if (priority === 'urgent') return 'bg-rose-100 text-rose-800 border-rose-300 dark:bg-rose-950/60 dark:text-rose-300 dark:border-rose-800';
    if (priority === 'high') return 'bg-amber-100 text-amber-800 border-amber-300 dark:bg-amber-950/60 dark:text-amber-300 dark:border-amber-800';
    if (type === 'test_completed') return 'bg-emerald-100 text-emerald-800 border-emerald-300 dark:bg-emerald-950/60 dark:text-emerald-300 dark:border-emerald-800';
    if (type === 'attendance_summary') return 'bg-blue-100 text-blue-800 border-blue-300 dark:bg-blue-950/60 dark:text-blue-300 dark:border-blue-800';
    return 'bg-purple-100 text-purple-800 border-purple-300 dark:bg-purple-950/60 dark:text-purple-300 dark:border-purple-800';
  }

  function formatTime(isoString) {
    if (!isoString) return '';
    try {
      const d = new Date(isoString);
      const diffMin = Math.floor((Date.now() - d.getTime()) / 60000);
      if (diffMin < 1) return 'Vừa xong';
      if (diffMin < 60) return `${diffMin} phút trước`;
      const diffHour = Math.floor(diffMin / 60);
      if (diffHour < 24) return `${diffHour} giờ trước`;
      return d.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
    } catch {
      return '';
    }
  }
</script>

{#if isOpen}
  <!-- Backdrop -->
  <div 
    class="fixed inset-0 bg-slate-950/70 backdrop-blur-sm z-[9990] transition-opacity duration-300 animate-in fade-in"
    onclick={onClose}
    onkeydown={(e) => e.key === 'Escape' && onClose()}
    role="button"
    tabindex="0"
    aria-label="Đóng bảng thông báo Leader"
  ></div>

  <!-- Slide-Over Drawer Container -->
  <aside 
    class="fixed inset-y-0 right-0 w-full sm:w-[500px] md:w-[560px] bg-white dark:bg-slate-900 border-l border-slate-200 dark:border-slate-800 shadow-2xl z-[9995] flex flex-col justify-between overflow-hidden animate-in slide-in-from-right duration-300"
    role="dialog"
    aria-modal="true"
    aria-label="Trung Tâm Báo Cáo Leader"
  >
    <!-- Drawer Header (Academic Ledger Style) -->
    <div class="p-4 sm:p-5 border-b border-slate-800 bg-slate-900 text-slate-100">
      <div class="flex items-center justify-between mb-3">
        <div class="flex items-center gap-2.5">
          <div class="w-10 h-10 rounded-md bg-emerald-700 text-white flex items-center justify-center text-lg shadow-xs">
            🔔
          </div>
          <div>
            <h2 class="text-base sm:text-lg font-semibold text-white flex items-center gap-2">
              Trung Tâm Báo Cáo Leader
              {#if unreadCount > 0}
                <span class="px-2 py-0.5 rounded text-xs font-semibold bg-rose-600 text-white">
                  {unreadCount} mới
                </span>
              {/if}
            </h2>
            <p class="text-xs text-slate-400 font-normal">
              Dành riêng cho Cô Dung • Đăng ký, Lịch học, Điểm danh &amp; Học phí
            </p>
          </div>
        </div>

        <button
          onclick={onClose}
          class="w-8 h-8 rounded-md bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white flex items-center justify-center font-semibold text-sm transition-colors"
          title="Đóng"
        >
          ✕
        </button>
      </div>

      <!-- Quick Action Toolbar -->
      <div class="flex flex-wrap items-center justify-between gap-2 pt-2 text-xs">
        <div class="flex items-center gap-2">
          <!-- PWA Push Permission Toggle -->
          {#if pwaPermissionStatus !== 'granted'}
            <button
              onclick={handleRequestPermission}
              class="px-2.5 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold flex items-center gap-1.5 shadow-sm transition-transform active:scale-95"
            >
              <span>📲</span>
              <span>Bật PWA Push</span>
            </button>
          {:else}
            <span class="px-2 py-1 rounded-xl bg-emerald-100 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300 font-semibold border border-emerald-300 dark:border-emerald-800 flex items-center gap-1">
              <span>✅</span>
              <span>PWA Đã Bật</span>
            </span>
          {/if}

          <!-- Audio Chime Toggle -->
          <button
            onclick={() => isSoundEnabled = !isSoundEnabled}
            class="px-2.5 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 font-medium flex items-center gap-1 transition-all"
            title="Bật/Tắt âm thanh chuông cảnh báo"
          >
            <span>{isSoundEnabled ? '🔊' : '🔇'}</span>
            <span>{isSoundEnabled ? 'Âm thanh: Bật' : 'Âm thanh: Tắt'}</span>
          </button>
        </div>

        <div class="flex items-center gap-2">
          <button
            onclick={handleScanNow}
            disabled={isScanning}
            class="px-2.5 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white font-bold flex items-center gap-1 shadow-sm transition-all"
            title="Quét tức thì lịch học hôm nay và hạn học phí"
          >
            <span class={isScanning ? 'animate-spin' : ''}>⚡</span>
            <span>{isScanning ? 'Đang quét...' : 'Quét Lập Tức'}</span>
          </button>

          <button
            onclick={handleMarkAllRead}
            disabled={unreadCount === 0}
            class="px-2 py-1.5 rounded-xl text-slate-600 dark:text-slate-400 hover:text-emerald-600 dark:hover:text-emerald-400 disabled:opacity-40 font-medium transition-colors"
          >
            Đọc tất cả
          </button>

          <button
            onclick={handleClearAll}
            disabled={notifications.length === 0}
            class="px-2 py-1.5 rounded-xl text-slate-400 hover:text-rose-600 disabled:opacity-40 font-medium transition-colors"
            title="Xóa tất cả thông báo"
          >
            Xóa hết
          </button>
        </div>
      </div>

      {#if scanMessage}
        <div class="mt-2.5 p-2 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-300 text-xs font-semibold flex items-center gap-2 animate-in fade-in">
          <span>ℹ️</span>
          <span>{scanMessage}</span>
        </div>
      {/if}

      {#if teacherReminderSuccess}
        <div class="mt-2.5 p-2 rounded-xl bg-indigo-50 dark:bg-indigo-950/40 border border-indigo-200 dark:border-indigo-800 text-indigo-800 dark:text-indigo-300 text-xs font-semibold flex items-center gap-2 animate-in fade-in">
          <span>📨</span>
          <span>{teacherReminderSuccess}</span>
        </div>
      {/if}

      <!-- Filter Chips -->
      <div class="flex items-center gap-1.5 overflow-x-auto pt-3 pb-1 no-scrollbar text-xs">
        <button
          onclick={() => activeFilter = 'all'}
          class="px-2.5 py-1 rounded-lg font-bold shrink-0 transition-colors {activeFilter === 'all' ? 'bg-slate-900 text-white dark:bg-emerald-500 dark:text-slate-950' : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-200'}"
        >
          Tất cả ({notifications.length})
        </button>
        <button
          onclick={() => activeFilter = 'teacher_missing_attendance'}
          class="px-2.5 py-1 rounded-lg font-bold shrink-0 transition-colors {activeFilter === 'teacher_missing_attendance' ? 'bg-rose-600 text-white' : 'bg-rose-50 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300'}"
        >
          ⚠️ GV chưa điểm danh
        </button>
        <button
          onclick={() => activeFilter = 'attendance_summary'}
          class="px-2.5 py-1 rounded-lg font-bold shrink-0 transition-colors {activeFilter === 'attendance_summary' ? 'bg-blue-600 text-white' : 'bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300'}"
        >
          📋 Điểm danh &amp; Vắng
        </button>
        <button
          onclick={() => activeFilter = 'schedule'}
          class="px-2.5 py-1 rounded-lg font-bold shrink-0 transition-colors {activeFilter === 'schedule' ? 'bg-amber-600 text-white' : 'bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300'}"
        >
          ⏰ Lịch học 1h/10p
        </button>
        <button
          onclick={() => activeFilter = 'new_registration'}
          class="px-2.5 py-1 rounded-lg font-bold shrink-0 transition-colors {activeFilter === 'new_registration' ? 'bg-emerald-600 text-white' : 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300'}"
        >
          🔔 Đăng ký mới
        </button>
        <button
          onclick={() => activeFilter = 'test_completed'}
          class="px-2.5 py-1 rounded-lg font-bold shrink-0 transition-colors {activeFilter === 'test_completed' ? 'bg-purple-600 text-white' : 'bg-purple-50 text-purple-700 dark:bg-purple-950/40 dark:text-purple-300'}"
        >
          📝 Bài thi hoàn thành
        </button>
        <button
          onclick={() => activeFilter = 'tuition_due'}
          class="px-2.5 py-1 rounded-lg font-bold shrink-0 transition-colors {activeFilter === 'tuition_due' ? 'bg-teal-600 text-white' : 'bg-teal-50 text-teal-700 dark:bg-teal-950/40 dark:text-teal-300'}"
        >
          💰 Hạn học phí
        </button>
      </div>
    </div>

    <!-- Notification List Body -->
    <div class="flex-1 overflow-y-auto p-4 space-y-3">
      {#if filteredNotifications.length === 0}
        <div class="text-center py-16 space-y-3">
          <div class="text-5xl">🎉</div>
          <div class="text-base font-bold text-slate-800 dark:text-white">
            Tuyệt vời Cô Dung! Không có thông báo tồn đọng.
          </div>
          <p class="text-xs text-slate-500 dark:text-slate-400 max-w-xs mx-auto">
            Mọi lịch học, sổ điểm danh của giáo viên và đóng học phí của học sinh đều đang diễn ra chuẩn xác.
          </p>
        </div>
      {:else}
        {#each filteredNotifications as notif (notif.id)}
          <div 
            class="p-3.5 sm:p-4 rounded-lg border transition-colors {notif.is_read ? 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800/80 opacity-80' : 'bg-slate-50 dark:bg-slate-850 border-emerald-500/40 dark:border-emerald-500/40 shadow-xs'}"
          >
            <div class="flex items-start justify-between gap-3 mb-2">
              <div class="flex items-center gap-2">
                <span class="px-2 py-0.5 rounded text-[11px] font-semibold uppercase tracking-wider border {getBadgeClass(notif.type, notif.priority)}">
                  {#if notif.priority === 'urgent'}
                    🚨 KHẨN CẤP
                  {:else if notif.type === 'teacher_missing_attendance'}
                    ⚠️ GV CHƯA ĐIỂM DANH
                  {:else if notif.type === 'attendance_summary'}
                    📋 ĐIỂM DANH LỚP
                  {:else if notif.type === 'schedule_reminder_10m'}
                    ⏰ SẮP VÀO HỌC (10P)
                  {:else if notif.type === 'schedule_reminder_1h'}
                    ⏰ LỊCH HỌC (1H)
                  {:else if notif.type === 'new_registration'}
                    🔔 ĐĂNG KÝ MỚI
                  {:else if notif.type === 'test_completed'}
                    📝 BÀI TEST XONG
                  {:else if notif.type === 'tuition_due'}
                    💰 HẠN HỌC PHÍ
                  {:else}
                    📢 HỆ THỐNG
                  {/if}
                </span>

                {#if !notif.is_read}
                  <span class="w-2 h-2 rounded-full bg-emerald-500 animate-ping" title="Chưa đọc"></span>
                {/if}
              </div>

              <div class="flex items-center gap-2 text-[11px] text-slate-400">
                <span>{formatTime(notif.timestamp)}</span>
                <button
                  onclick={() => handleDelete(notif.id)}
                  class="text-slate-400 hover:text-rose-500 transition-colors p-1"
                  title="Xóa thông báo này"
                >
                  ✕
                </button>
              </div>
            </div>

            <!-- Title & Message -->
            <h4 class="text-sm font-bold text-slate-900 dark:text-white mb-1">
              {notif.title}
            </h4>
            <p class="text-xs text-slate-600 dark:text-slate-300 leading-relaxed whitespace-pre-line mb-3">
              {notif.message}
            </p>

            <!-- Action Buttons based on Notification Type -->
            <div class="flex flex-wrap items-center gap-2 pt-2 border-t border-slate-100 dark:border-slate-800">
              {#if notif.type === 'teacher_missing_attendance'}
                <button
                  onclick={() => handleRemindTeacher(notif)}
                  class="px-3 py-1.5 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-bold text-xs flex items-center gap-1 shadow-sm transition-all"
                >
                  <span>📨</span>
                  <span>Nhắc Giáo Viên Ngay</span>
                </button>
                <a
                  href="/schedule"
                  onclick={() => { handleMarkRead(notif.id); onClose(); }}
                  class="px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 font-bold text-xs transition-colors"
                >
                  Xem Lịch &amp; Điểm Danh Hộ
                </a>
              {:else if notif.type === 'new_registration'}
                <a
                  href="/admin?tab=students"
                  onclick={() => { handleMarkRead(notif.id); onClose(); }}
                  class="px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs flex items-center gap-1 shadow-sm transition-all"
                >
                  <span>✓</span>
                  <span>Duyệt Chính Thức</span>
                </a>
              {:else if notif.type === 'attendance_summary'}
                <a
                  href="/schedule?tab=attendance"
                  onclick={() => { handleMarkRead(notif.id); onClose(); }}
                  class="px-3 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs flex items-center gap-1 shadow-sm transition-all"
                >
                  <span>👁️</span>
                  <span>Xem Sổ Điểm Danh</span>
                </a>
              {:else if notif.type === 'test_completed'}
                <a
                  href="/evaluations"
                  onclick={() => { handleMarkRead(notif.id); onClose(); }}
                  class="px-3 py-1.5 rounded-xl bg-purple-600 hover:bg-purple-500 text-white font-bold text-xs flex items-center gap-1 shadow-sm transition-all"
                >
                  <span>📊</span>
                  <span>Xem Đánh Giá &amp; Điểm</span>
                </a>
              {:else if notif.type === 'tuition_due'}
                <a
                  href="/admin?tab=tuition"
                  onclick={() => { handleMarkRead(notif.id); onClose(); }}
                  class="px-3 py-1.5 rounded-xl bg-teal-600 hover:bg-teal-500 text-white font-bold text-xs flex items-center gap-1 shadow-sm transition-all"
                >
                  <span>💳</span>
                  <span>Quản Lý Học Phí</span>
                </a>
              {:else if notif.type.startsWith('schedule_reminder')}
                <a
                  href="/schedule"
                  onclick={() => { handleMarkRead(notif.id); onClose(); }}
                  class="px-3 py-1.5 rounded-xl bg-amber-600 hover:bg-amber-500 text-white font-bold text-xs flex items-center gap-1 shadow-sm transition-all"
                >
                  <span>📅</span>
                  <span>Mở Thời Khóa Biểu</span>
                </a>
              {/if}

              {#if !notif.is_read}
                <button
                  onclick={() => handleMarkRead(notif.id)}
                  class="px-2.5 py-1 rounded-xl text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200 text-xs font-medium ml-auto transition-colors"
                >
                  Đánh dấu đã đọc
                </button>
              {/if}
            </div>
          </div>
        {/each}
      {/if}
    </div>

    <!-- Drawer Footer: Simulation & Test Deck for Leader -->
    <div class="p-3.5 sm:p-4 border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/80">
      <div class="text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-2 flex items-center justify-between">
        <span>🧪 Giả Lập Tình Huống Cảnh Báo (Test Deck)</span>
        <span class="text-[11px] lowercase text-slate-400 font-normal">Click để kích hoạt kiểm thử</span>
      </div>
      <div class="grid grid-cols-2 sm:grid-cols-3 gap-1.5 text-xs">
        <button
          onclick={() => handleSimulate('teacher_missing_attendance')}
          class="p-1.5 rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-rose-700 dark:text-rose-400 font-bold hover:bg-rose-50 dark:hover:bg-rose-950/50 transition-colors text-left truncate"
          title="Mô phỏng GV quên điểm danh sau 15p"
        >
          ⚠️ GV Quên Điểm Danh
        </button>
        <button
          onclick={() => handleSimulate('attendance_summary_absent')}
          class="p-1.5 rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-blue-700 dark:text-blue-400 font-bold hover:bg-blue-50 dark:hover:bg-blue-950/50 transition-colors text-left truncate"
          title="Mô phỏng lớp có học sinh vắng"
        >
          📋 Điểm Danh Thiếu 2 Em
        </button>
        <button
          onclick={() => handleSimulate('schedule_reminder_10m')}
          class="p-1.5 rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-amber-700 dark:text-amber-400 font-bold hover:bg-amber-50 dark:hover:bg-amber-950/50 transition-colors text-left truncate"
          title="Mô phỏng chuông nhắc lịch học trước 10 phút"
        >
          🚨 Nhắc Lịch Học 10 Phút
        </button>
        <button
          onclick={() => handleSimulate('new_registration')}
          class="p-1.5 rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-emerald-700 dark:text-emerald-400 font-bold hover:bg-emerald-50 dark:hover:bg-emerald-950/50 transition-colors text-left truncate"
          title="Mô phỏng có tài khoản học sinh mới đăng ký"
        >
          🔔 Học Sinh Đăng Ký Mới
        </button>
        <button
          onclick={() => handleSimulate('test_completed')}
          class="p-1.5 rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-purple-700 dark:text-purple-400 font-bold hover:bg-purple-50 dark:hover:bg-purple-950/50 transition-colors text-left truncate"
          title="Mô phỏng học sinh vừa nộp bài thi xong"
        >
          📝 Nộp Bài Thi (10/10)
        </button>
        <button
          onclick={() => handleSimulate('tuition_due')}
          class="p-1.5 rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-teal-700 dark:text-teal-400 font-bold hover:bg-teal-50 dark:hover:bg-teal-950/50 transition-colors text-left truncate"
          title="Mô phỏng học phí đến hạn nộp"
        >
          💰 Tới Hạn Học Phí
        </button>
      </div>
    </div>
  </aside>
{/if}
