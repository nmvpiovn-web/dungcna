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
 <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-6 rounded-xl bg-slate-900 border border-slate-800 text-white shadow-sm">
 <div>
 <div class="inline-flex items-center gap-2 px-2.5 py-1 rounded-md bg-slate-800 border border-slate-700 text-xs font-semibold uppercase tracking-wider mb-2 text-cx-400">
 <svg class="w-4 h-4 text-cx-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
 <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
 </svg>
 <span>Trung Tâm Thông Báo / Notification Hub</span>
 </div>
 <h1 class="text-2xl sm:text-3xl font-bold">Thông Báo &amp; Nhắc Nhở Chéo</h1>
 <p class="text-slate-300 text-xs sm:text-sm mt-1">Cập nhật lịch học, BTVN, phiếu bài tập viết tay, và tin nhắn học tập đa cơ sở.</p>
 </div>
 
 <div class="flex items-center gap-2">
 <button 
 onclick={() => markAsRead(null, true)}
 class="px-4 py-2 rounded-md bg-cx-600 hover:bg-cx-500 font-semibold text-xs transition-colors flex items-center gap-1.5 text-white"
 >
 <span>✓ Đánh dấu tất cả đã đọc</span>
 </button>
 </div>
 </div>

 <!-- Filters -->
 <div class="flex items-center justify-between gap-4 bg-white p-2.5 rounded-lg border border-slate-200 shadow-sm">
 <div class="flex items-center gap-2">
 <button 
 onclick={() => filter = 'all'}
 class="px-3.5 py-1.5 rounded-md text-xs font-semibold transition-all {filter === 'all' ? 'bg-cx-600 text-white shadow-sm' : 'text-slate-600 hover:bg-slate-100'}"
 >
 Tất cả ({notifications.length})
 </button>
 <button 
 onclick={() => filter = 'unread'}
 class="px-3.5 py-1.5 rounded-md text-xs font-semibold transition-all {filter === 'unread' ? 'bg-cx-600 text-white shadow-sm' : 'text-slate-600 hover:bg-slate-100'}"
 >
 Chưa đọc ({notifications.filter(n => !n.is_read).length})
 </button>
 </div>

 <button 
 onclick={fetchNotifications}
 class="p-2 rounded-md text-slate-500 hover:text-slate-800 hover:bg-slate-100 transition-colors"
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
 <div class="p-12 text-center rounded-xl bg-white border border-slate-200 shadow-sm space-y-2">
 <div class="flex justify-center text-cx-500">
 <svg class="w-10 h-10" fill="none" viewBox="0 0 24 24" stroke="currentColor">
 <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
 </svg>
 </div>
 <h3 class="font-bold text-slate-700">Không có thông báo mới</h3>
 <p class="text-xs text-slate-400">Bạn đã cập nhật toàn bộ tin tức và bài tập mới nhất!</p>
 </div>
 {:else}
 <div class="space-y-3">
 {#each filteredNotifications as item (item.id)}
 <div class="p-4 rounded-lg border transition-all {item.is_read ? 'bg-white/60 border-slate-200 opacity-75' : 'bg-white border-cx-300 shadow-sm ring-1 ring-cx-500/20'}">
 <div class="flex items-start justify-between gap-3">
 <div class="flex items-start gap-3">
 <div class="w-10 h-10 rounded-lg flex items-center justify-center shrink-0 {item.is_read ? 'bg-slate-100 text-slate-500' : 'bg-cx-50 text-cx-600'}">
 {#if item.category === 'homework'}
 <svg class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
 <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
 </svg>
 {:else if item.category === 'reminder'}
 <svg class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
 <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
 </svg>
 {:else if item.category === 'finance'}
 <svg class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
 <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" />
 </svg>
 {:else}
 <svg class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
 <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M11 5.882V19.24a1.76 1.76 0 01-3.417.592l-2.147-6.15M18 13a3 3 0 100-6M5.436 13.683A4.001 4.001 0 017 6h1.832c4.1 0 7.625-1.234 9.168-3v14c-1.543-1.766-5.067-3-9.168-3H7a3.988 3.988 0 01-1.564-.317z" />
 </svg>
 {/if}
 </div>
 <div>
 <div class="flex items-center gap-2">
 <h4 class="font-bold text-sm text-slate-800">{item.title}</h4>
 {#if !item.is_read}
 <span class="w-2 h-2 rounded-full bg-rose-500"></span>
 {/if}
 </div>
 <p class="text-xs text-slate-600 mt-1 leading-relaxed">{item.message}</p>
 {#if item.created_at}
 <span class="inline-block text-[11px] text-slate-400 mt-2">
 {new Date(item.created_at * (item.created_at < 10000000000 ? 1000 : 1)).toLocaleString('vi-VN')}
 </span>
 {/if}
 </div>
 </div>

 {#if !item.is_read}
 <button 
 onclick={() => markAsRead(item.id)}
 class="px-2.5 py-1 rounded-md text-[11px] font-semibold text-cx-600 hover:bg-cx-50 transition-colors shrink-0"
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
