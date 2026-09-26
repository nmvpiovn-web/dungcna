<script>
  import { onMount } from 'svelte';
  import { getCurrentUser, getAuthToken } from '$lib/unifiedStore';
  import { t, currentLang } from '$lib/i18n';

  let notifications = $state([]);
  let isLoading = $state(true);
  let filter = $state('all'); // 'all' | 'unread'

  async function fetchNotifications() {
    isLoading = true;
    try {
      const token = getAuthToken();
      const res = await fetch('/api/notifications', {
        headers: token ? { Authorization: `Bearer ${token}` } : {}
      });
      const data = await res.json();
      if (data.success) {
        notifications = data.notifications || [];
      }
    } catch (err) {
      console.error('Failed to fetch notifications:', err);
    } finally {
      isLoading = false;
    }
  }

  async function markAsRead(id, markAll = false) {
    try {
      const token = getAuthToken();
      await fetch('/api/notifications', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {})
        },
        body: JSON.stringify({
          action: 'mark_read',
          notification_id: id,
          mark_all: markAll
        })
      });
      if (markAll) {
        notifications = notifications.map(n => ({ ...n, is_read: 1 }));
      } else {
        const item = notifications.find(n => n.id === id);
        if (item) item.is_read = 1;
      }
    } catch (err) {
      console.error('Failed to mark read:', err);
    }
  }

  onMount(() => {
    fetchNotifications();
  });

  let filteredNotifications = $derived(
    filter === 'unread' ? notifications.filter(n => !n.is_read) : notifications
  );
</script>

<svelte:head>
  <title>Thông Báo Hệ Thống | Cpanel Tiếng Anh Cô Dung</title>
</svelte:head>

<div class="space-y-6 max-w-4xl mx-auto">
  <!-- Header -->
  <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-6 rounded-3xl bg-gradient-to-r from-sky-600 via-indigo-600 to-purple-600 text-white shadow-xl shadow-sky-600/20">
    <div>
      <div class="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/10 backdrop-blur-md text-xs font-semibold uppercase tracking-wider mb-2">
        <span>🔔 Trung Tâm Thông Báo / Notification Hub</span>
      </div>
      <h1 class="text-2xl sm:text-3xl font-black">Thông Báo & Nhắc Nhở Chéo</h1>
      <p class="text-sky-100 text-xs sm:text-sm mt-1">Cập nhật lịch học, BTVN, phiếu bài tập viết tay, và tin nhắn học tập đa cơ sở.</p>
    </div>
    
    <div class="flex items-center gap-2">
      <button 
        onclick={() => markAsRead(null, true)}
        class="px-4 py-2 rounded-xl bg-white/20 hover:bg-white/30 backdrop-blur-md font-bold text-xs transition-colors flex items-center gap-1.5"
      >
        <span>✓ Đánh dấu tất cả đã đọc</span>
      </button>
    </div>
  </div>

  <!-- Filters -->
  <div class="flex items-center justify-between gap-4 bg-white dark:bg-slate-900 p-3 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm">
    <div class="flex items-center gap-2">
      <button 
        onclick={() => filter = 'all'}
        class="px-4 py-1.5 rounded-xl text-xs font-bold transition-all {filter === 'all' ? 'bg-sky-500 text-white shadow-md shadow-sky-500/20' : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'}"
      >
        Tất cả ({notifications.length})
      </button>
      <button 
        onclick={() => filter = 'unread'}
        class="px-4 py-1.5 rounded-xl text-xs font-bold transition-all {filter === 'unread' ? 'bg-sky-500 text-white shadow-md shadow-sky-500/20' : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'}"
      >
        Chưa đọc ({notifications.filter(n => !n.is_read).length})
      </button>
    </div>

    <button 
      onclick={fetchNotifications}
      class="p-2 rounded-xl text-slate-500 hover:text-slate-800 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
      title="Tải lại"
    >
      <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
      </svg>
    </button>
  </div>

  <!-- Notification List -->
  {#if isLoading}
    <div class="py-16 text-center text-slate-400 text-sm animate-pulse">
      Đang tải danh sách thông báo...
    </div>
  {:else if filteredNotifications.length === 0}
    <div class="p-12 text-center rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm">
      <div class="text-4xl mb-3">🎉</div>
      <h3 class="font-bold text-slate-700 dark:text-slate-300">Không có thông báo nào</h3>
      <p class="text-xs text-slate-400 mt-1">Bạn đã cập nhật toàn bộ tin tức và bài tập mới nhất!</p>
    </div>
  {:else}
    <div class="space-y-3">
      {#each filteredNotifications as item (item.id)}
        <div class="p-4 rounded-2xl border transition-all {item.is_read ? 'bg-white/60 dark:bg-slate-900/60 border-slate-200/80 dark:border-slate-800/80 opacity-75' : 'bg-white dark:bg-slate-900 border-sky-200 dark:border-sky-800 shadow-md shadow-sky-500/5 ring-1 ring-sky-500/20'}">
          <div class="flex items-start justify-between gap-3">
            <div class="flex items-start gap-3">
              <div class="w-10 h-10 rounded-2xl flex items-center justify-center text-lg shrink-0 {item.is_read ? 'bg-slate-100 dark:bg-slate-800 text-slate-500' : 'bg-sky-50 dark:bg-sky-950/60 text-sky-600 dark:text-sky-400'}">
                {#if item.category === 'homework'}
                  📝
                {:else if item.category === 'reminder'}
                  ⏰
                {:else if item.category === 'finance'}
                  💰
                {:else}
                  📢
                {/if}
              </div>
              <div>
                <div class="flex items-center gap-2">
                  <h4 class="font-bold text-sm text-slate-800 dark:text-slate-100">{item.title}</h4>
                  {#if !item.is_read}
                    <span class="w-2 h-2 rounded-full bg-rose-500"></span>
                  {/if}
                </div>
                <p class="text-xs text-slate-600 dark:text-slate-300 mt-1 leading-relaxed">{item.message}</p>
                {#if item.created_at}
                  <span class="inline-block text-[10px] text-slate-400 mt-2">
                    {new Date(item.created_at * (item.created_at < 10000000000 ? 1000 : 1)).toLocaleString('vi-VN')}
                  </span>
                {/if}
              </div>
            </div>

            {#if !item.is_read}
              <button 
                onclick={() => markAsRead(item.id)}
                class="px-2.5 py-1 rounded-lg text-[11px] font-semibold text-sky-600 dark:text-sky-400 hover:bg-sky-50 dark:hover:bg-sky-950/50 transition-colors shrink-0"
              >
                Đã đọc
              </button>
            {/if}
          </div>
        </div>
      {/each}
    </div>
  {/if}
</div>
