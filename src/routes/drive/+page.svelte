<!-- src/routes/drive/+page.svelte — Google Drive Knowledge Dashboard -->
<script>
 import { onMount } from 'svelte';
 import { getAuthToken } from '$lib/unifiedStore.js';

 let currentUser = $state(null);
 let files = $state([]);
 let loading = $state(true);
 let error = $state('');
 let search = $state('');
 let breadcrumbs = $state([{ id: 'root', name: 'Drive của tôi' }]);
 let currentFolderId = $state('root');
 let debounceTimer = $state(null);

 const isStaff = $derived(currentUser?.role === 'teacher' || currentUser?.role === 'admin' || currentUser?.role === 'superadmin' || currentUser?.role === 'leader');

 function getToken() {
  try {
   return getAuthToken() || localStorage.getItem('token') || '';
  } catch { return ''; }
 }

 async function loadFiles(folderId, q = '') {
  loading = true; error = '';
  try {
   const token = getToken();
   const params = new URLSearchParams({ folder_id: folderId });
   if (q) params.set('q', q);
   const res = await fetch(`/api/drive?${params}`, { headers: { Authorization: `Bearer ${token}` } });
   const data = await res.json();
   if (!data.success) {
    error = data.error || 'Không tải được danh sách file';
    files = [];
   } else {
    files = data.files || [];
   }
  } catch (e) {
   error = 'Lỗi kết nối: ' + e.message;
   files = [];
  } finally {
   loading = false;
  }
 }

 function openFolder(f) {
  breadcrumbs = [...breadcrumbs, { id: f.id, name: f.name }];
  currentFolderId = f.id;
  loadFiles(f.id, search);
 }

 function goToCrumb(idx) {
  breadcrumbs = breadcrumbs.slice(0, idx + 1);
  currentFolderId = breadcrumbs[idx].id;
  loadFiles(currentFolderId, search);
 }

 function onSearchInput() {
  clearTimeout(debounceTimer);
  debounceTimer = setTimeout(() => loadFiles(currentFolderId, search), 400);
 }

 function formatSize(bytes) {
  if (!bytes) return '—';
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
 }

 function fileIcon(mime) {
  if (mime?.includes('folder')) return '📁';
  if (mime?.includes('pdf')) return '📕';
  if (mime?.includes('document') || mime?.includes('word')) return '📄';
  if (mime?.includes('spreadsheet') || mime?.includes('excel')) return '📊';
  if (mime?.includes('presentation') || mime?.includes('powerpoint')) return '📽️';
  if (mime?.includes('image')) return '🖼️';
  if (mime?.includes('video')) return '🎬';
  if (mime?.includes('audio')) return '🎵';
  return '📎';
 }

 onMount(() => {
  try {
   const u = JSON.parse(localStorage.getItem('currentUser') || 'null');
   currentUser = u;
  } catch {}
  loadFiles('root');
 });
</script>

<svelte:head><title>📚 Kho Tài Liệu Drive — Tiếng Anh Cô Dung</title></svelte:head>

<div class="max-w-6xl mx-auto px-4 py-6 space-y-5">
 <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
  <div>
   <h1 class="text-2xl font-black text-ink-900">📚 Kho Tài Liệu Google Drive</h1>
   <p class="text-sm text-ink-500">Truy cập trực tiếp tài liệu trên Google Drive — không cần đăng nhập lại</p>
  </div>
  <input
   type="search"
   placeholder="🔍 Tìm tài liệu..."
   bind:value={search}
   oninput={onSearchInput}
   class="px-4 py-2.5 rounded-xl border border-line bg-surface-1 text-sm w-full sm:w-72 focus:outline-none focus:ring-2 focus:ring-brand-300"
  />
 </div>

 {#if !isStaff && currentUser}
  <div class="rounded-xl bg-amber-50 border border-amber-200 p-4 text-sm text-amber-800">
   ⚠️ Chỉ giáo viên và quản trị viên mới truy cập kho tài liệu này.
  </div>
 {:else}
  <!-- Breadcrumbs -->
  <nav class="flex items-center gap-1.5 text-sm flex-wrap">
   {#each breadcrumbs as crumb, i}
    <button
     onclick={() => goToCrumb(i)}
     class={`px-2 py-1 rounded-lg ${i === breadcrumbs.length - 1 ? 'font-bold text-ink-900 bg-brand-50' : 'text-brand-600 hover:bg-brand-50'}`}
    >{crumb.name}</button>
    {#if i < breadcrumbs.length - 1}<span class="text-ink-300">/</span>{/if}
   {/each}
  </nav>

  {#if error}
   <div class="rounded-xl bg-red-50 border border-red-200 p-5 text-sm text-red-700 space-y-2">
    <div class="font-bold">⚠️ {error}</div>
    {#if error.includes('GOOGLE_DRIVE_API_KEY')}
     <div class="text-red-600">
      <strong>Cách cấu hình:</strong>
      <ol class="list-decimal ml-5 mt-1 space-y-1">
       <li>Vào <a href="https://console.cloud.google.com" target="_blank" rel="noopener" class="underline">Google Cloud Console</a> → tạo API Key → bật <strong>Google Drive API</strong></li>
       <li>Chia sẻ folder Drive cần dùng với "Bất kỳ ai có link" (Viewer) — hoặc giới hạn theo HTTP referrer của API key</li>
       <li>Vào Cloudflare Pages → <strong>tienganh7-pro</strong> → Settings → Environment Variables → thêm <code class="bg-red-100 px-1 rounded">GOOGLE_DRIVE_API_KEY</code></li>
       <li>Redeploy để nhận biến môi trường mới</li>
      </ol>
     </div>
    {/if}
    <button onclick={() => loadFiles(currentFolderId, search)} class="px-4 py-2 rounded-xl bg-red-600 text-white text-sm font-bold hover:bg-red-700">🔄 Thử lại</button>
   </div>
  {:else if loading}
   <div class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
    {#each Array(8) as _}
     <div class="rounded-2xl border border-line bg-surface-1 p-4 animate-pulse h-28"></div>
    {/each}
   </div>
  {:else if files.length === 0}
   <div class="rounded-2xl border border-dashed border-line bg-surface-1 p-10 text-center text-ink-400">
    <div class="text-4xl mb-2">📂</div>
    <div class="font-bold">Thư mục trống</div>
    <div class="text-sm">Chưa có tài liệu nào ở đây</div>
   </div>
  {:else}
   <div class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
    {#each files as f}
     {#if f.isFolder}
      <button
       onclick={() => openFolder(f)}
       class="rounded-2xl border border-line bg-surface-1 p-4 text-left hover:border-brand-300 hover:shadow-md transition-all group"
      >
       <div class="text-3xl mb-2">📁</div>
       <div class="font-bold text-sm text-ink-900 truncate group-hover:text-brand-700">{f.name}</div>
       <div class="text-xs text-ink-400 mt-1">Thư mục →</div>
      </button>
     {:else}
      <a
       href={f.webViewLink}
       target="_blank"
       rel="noopener"
       class="rounded-2xl border border-line bg-surface-1 p-4 hover:border-brand-300 hover:shadow-md transition-all group block"
      >
       {#if f.thumbnailLink}
        <img src={f.thumbnailLink} alt="" loading="lazy" class="w-full h-20 object-cover rounded-xl mb-2" />
       {:else}
        <div class="text-3xl mb-2">{fileIcon(f.mimeType)}</div>
       {/if}
       <div class="font-bold text-sm text-ink-900 truncate group-hover:text-brand-700" title={f.name}>{f.name}</div>
       <div class="text-xs text-ink-400 mt-1">{formatSize(f.size)}</div>
      </a>
     {/if}
    {/each}
   </div>
  {/if}
 {/if}
</div>
