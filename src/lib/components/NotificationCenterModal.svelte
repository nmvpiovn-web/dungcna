<script>
  import { onMount } from 'svelte';
  import { getAuthToken } from '$lib/unifiedStore';

  let { isOpen = $bindable(false) } = $props();

  let notifications = $state([]);
  let unreadCount = $state(0);
  let isLoading = $state(false);
  let activeFilter = $state('all'); // 'all' | 'unread'

  async function loadNotifications() {
    const token = getAuthToken();
    if (!token) return;

    try {
      isLoading = true;
      const res = await fetch('/api/notifications', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await res.json();
      if (data.success) {
        notifications = data.notifications || [];
        unreadCount = data.unread_count || 0;
      }
    } catch (e) {
      console.error('Error fetching notifications:', e);
    } finally {
      isLoading = false;
    }
  }

  $effect(() => {
    if (isOpen) {
      loadNotifications();
    }
  });

  async function markRead(id = null, markAll = false) {
    const token = getAuthToken();
    if (!token) return;

    try {
      await fetch('/api/notifications', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          action: 'mark_read',
          notification_id: id,
          mark_all: markAll
        })
      });

      if (markAll) {
        notifications = notifications.map(n => ({ ...n, is_read: 1 }));
        unreadCount = 0;
      } else if (id) {
        notifications = notifications.map(n => n.id === id ? { ...n, is_read: 1 } : n);
        unreadCount = Math.max(0, unreadCount - 1);
      }
    } catch (e) {
      console.error('Error marking notification as read:', e);
    }
  }

  let filteredNotifications = $derived.by(() => {
    if (activeFilter === 'unread') {
      return notifications.filter(n => n.is_read === 0);
    }
    return notifications;
  });

  function getCategoryBadge(cat) {
    switch (cat) {
      case 'attendance': return { text: 'Chuyên cần', color: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300' };
      case 'tuition': return { text: 'Học phí', color: 'bg-purple-100 text-purple-800 dark:bg-purple-950 dark:text-purple-300' };
      case 'leave': return { text: 'Nghỉ & Dạy thay', color: 'bg-teal-100 text-teal-800 dark:bg-teal-950 dark:text-teal-300' };
      case 'salary': return { text: 'Lương & Ứng', color: 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300' };
      case 'exam': return { text: 'Khảo thí', color: 'bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300' };
      default: return { text: 'Thông báo', color: 'bg-slate-100 text-slate-800 dark:bg-slate-800 dark:text-slate-300' };
    }
  }
</script>

{#if isOpen}
  <div class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-sm animate-in fade-in duration-150">
    <div class="w-full max-w-lg rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-2xl overflow-hidden flex flex-col max-h-[85vh] animate-in zoom-in-95 duration-150">
      
      <!-- Top Bar -->
      <div class="flex items-center justify-between px-6 py-4 border-b border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-950/50">
        <div class="flex items-center gap-2.5">
          <span class="text-xl">🔔</span>
          <div>
            <h3 class="font-bold text-sm text-slate-900 dark:text-white">Trung Tâm Thông Báo</h3>
            <p class="text-[11px] text-slate-500">
              {unreadCount > 0 ? `Có ${unreadCount} thông báo mới chưa đọc` : 'Bạn đã đọc tất cả thông báo'}
            </p>
          </div>
        </div>

        <div class="flex items-center gap-2">
          {#if unreadCount > 0}
            <button
              type="button"
              onclick={() => markRead(null, true)}
              class="px-2.5 py-1 rounded-lg bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 text-[11px] font-bold hover:bg-emerald-100 border border-emerald-300/40"
            >
              Đọc tất cả
            </button>
          {/if}
          <button
            type="button"
            onclick={() => isOpen = false}
            class="w-8 h-8 rounded-full bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 text-slate-600 dark:text-slate-300 flex items-center justify-center text-sm font-bold"
          >
            ✕
          </button>
        </div>
      </div>

      <!-- Filters -->
      <div class="flex items-center gap-2 px-6 py-2.5 border-b border-slate-100 dark:border-slate-800 text-xs">
        <button
          type="button"
          onclick={() => activeFilter = 'all'}
          class="px-3 py-1 rounded-xl font-bold transition-all {activeFilter === 'all' ? 'bg-slate-900 text-white dark:bg-white dark:text-slate-900' : 'text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800'}"
        >
          Tất cả ({notifications.length})
        </button>
        <button
          type="button"
          onclick={() => activeFilter = 'unread'}
          class="px-3 py-1 rounded-xl font-bold transition-all {activeFilter === 'unread' ? 'bg-slate-900 text-white dark:bg-white dark:text-slate-900' : 'text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800'}"
        >
          Chưa đọc ({unreadCount})
        </button>
      </div>

      <!-- List Container -->
      <div class="flex-1 overflow-y-auto p-4 space-y-2.5">
        {#if isLoading}
          <div class="py-12 text-center text-xs text-slate-400">
            <div class="w-8 h-8 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin mx-auto mb-2"></div>
            Đang tải thông báo...
          </div>
        {:else if filteredNotifications.length === 0}
          <div class="py-12 text-center text-xs text-slate-400">
            Không có thông báo nào trong mục này.
          </div>
        {:else}
          {#each filteredNotifications as item}
            {@const badge = getCategoryBadge(item.category)}
            <div
              class="p-4 rounded-2xl border transition-all {item.is_read ? 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 opacity-80' : 'bg-emerald-50/40 dark:bg-emerald-950/20 border-emerald-200 dark:border-emerald-800/60 shadow-xs'}"
            >
              <div class="flex items-start justify-between gap-3 mb-1.5">
                <div class="flex items-center gap-2 flex-wrap">
                  <span class="px-2 py-0.5 rounded-full text-[10px] font-bold {badge.color}">
                    {badge.text}
                  </span>
                  <h4 class="font-bold text-xs text-slate-900 dark:text-white">
                    {item.title}
                  </h4>
                </div>
                {#if !item.is_read}
                  <button
                    type="button"
                    onclick={() => markRead(item.id)}
                    class="text-[10px] text-emerald-600 dark:text-emerald-400 font-bold hover:underline whitespace-nowrap"
                  >
                    Đánh dấu đã đọc
                  </button>
                {/if}
              </div>

              <p class="text-xs text-slate-600 dark:text-slate-300 leading-relaxed mb-2">
                {item.body}
              </p>

              <div class="text-[10px] text-slate-400 flex items-center justify-between">
                <span>{item.created_at}</span>
                {#if item.reference_id}
                  <span class="font-mono text-slate-400/80">Ref: {item.reference_id}</span>
                {/if}
              </div>
            </div>
          {/each}
        {/if}
      </div>

    </div>
  </div>
{/if}
