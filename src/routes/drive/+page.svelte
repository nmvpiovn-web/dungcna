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
 let apiKeyInput = $state('');
 let savingKey = $state(false);
 let keyMessage = $state('');
 let hasKey = $state(false);

 async function checkKeyStatus() {
  try {
   const token = getToken();
   const res = await fetch('/api/drive/key', { headers: { Authorization: `Bearer ${token}` } });
   const data = await res.json();
   if (data.success) hasKey = data.configured;
  } catch {}
 }

 async function saveApiKey() {
  if (savingKey || !apiKeyInput.trim()) return;
  savingKey = true; keyMessage = '';
  try {
   const token = getToken();
   const res = await fetch('/api/drive/key', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ api_key: apiKeyInput.trim() })
   });
   const data = await res.json();
   if (data.success) {
    keyMessage = '✅ ' + data.message;
    hasKey = true;
    apiKeyInput = '';
    // Tự động load lại files sau khi lưu key thành công
    setTimeout(() => loadFiles(currentFolderId, search), 500);
   } else {
    keyMessage = '❌ ' + (data.error || 'Lưu thất bại');
   }
  } catch (e) {
   keyMessage = '❌ Lỗi: ' + e.message;
  } finally {
   savingKey = false;
  }
 }

 async function deleteApiKey() {
  if (!confirm('Xóa Google Drive API key đã lưu?')) return;
  try {
   const token = getToken();
   const res = await fetch('/api/drive/key', {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${token}` }
   });
   const data = await res.json();
   if (data.success) {
    hasKey = false;
    keyMessage = '✅ Đã xóa key';
    loadFiles(currentFolderId, search);
   }
  } catch {}
 }

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

 let folderIdInput = $state('');
 const DEFAULT_FOLDER_ID = '1_V4YUCuTJ4uui49S6AfcaI8lZmIszKou';
 let syncing = $state(false);
 let syncMessage = $state('');

 async function syncDriveToVault() {
  if (syncing) return;
  if (!confirm('Đồng bộ toàn bộ file trong folder hiện tại vào kho tri thức? (tối đa 100 files)')) return;
  syncing = true; syncMessage = '';
  try {
   const token = getToken();
   const res = await fetch('/api/drive/sync', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ folder_id: currentFolderId, recursive: true })
   });
   const data = await res.json();
   if (data.success) {
    syncMessage = '✅ ' + data.message;
   } else {
    syncMessage = '❌ ' + (data.error || 'Sync thất bại');
   }
  } catch (e) {
   syncMessage = '❌ Lỗi: ' + e.message;
  } finally {
   syncing = false;
  }
 }

 function openFolderById() {
  const fid = folderIdInput.trim() || DEFAULT_FOLDER_ID;
  // Trích folder ID từ URL nếu user dán cả link
  const m = fid.match(/\/folders\/([a-zA-Z0-9_-]+)/);
  const folderId = m ? m[1] : fid;
  breadcrumbs = [{ id: folderId, name: '📁 Folder đã share' }];
  currentFolderId = folderId;
  loadFiles(folderId, search);
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
  checkKeyStatus();
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
  <!-- Folder ID input (API key không đọc được root, cần folder đã share) -->
  <div class="rounded-xl bg-blue-50 border border-blue-200 p-4 space-y-2">
   <div class="font-bold text-sm text-ink-900">📁 Mở folder Drive đã share</div>
   <div class="flex flex-col sm:flex-row gap-2">
    <input
     type="text"
     bind:value={folderIdInput}
     placeholder="Dán Folder ID hoặc link drive.google.com/drive/folders/..."
     class="flex-1 px-4 py-2.5 rounded-xl border border-line bg-white text-sm font-mono focus:outline-none focus:ring-2 focus:ring-brand-300"
    />
    <button
     onclick={openFolderById}
     class="px-5 py-2.5 rounded-xl bg-blue-600 text-white text-sm font-bold hover:bg-blue-700 whitespace-nowrap"
    >📂 Mở folder</button>
    <button
     onclick={syncDriveToVault}
     disabled={syncing}
     class="px-5 py-2.5 rounded-xl bg-emerald-600 text-white text-sm font-bold hover:bg-emerald-700 disabled:opacity-50 whitespace-nowrap"
     title="Đồng bộ toàn bộ file trong folder hiện tại vào kho tri thức"
    >{syncing ? '⏳ Đang sync...' : '🔄 Sync vào kho tri thức'}</button>
   </div>
   <p class="text-xs text-ink-500">Để trống = mở folder tài liệu tiếng Anh đã share sẵn.</p>
   {#if syncMessage}
    <div class="text-xs font-bold {syncMessage.startsWith('✅') ? 'text-emerald-600' : 'text-red-600'}">{syncMessage}</div>
   {/if}
  </div>

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
   <div class="rounded-xl bg-red-50 border border-red-200 p-5 text-sm text-red-700 space-y-3">
    <div class="font-bold">⚠️ {error}</div>
    <!-- Ô nhập Google Drive API Key -->
    <div class="rounded-xl bg-white border border-red-200 p-4 space-y-3">
     <div class="font-bold text-ink-900">🔑 Nhập Google Drive API Key</div>
     <p class="text-xs text-ink-500">Key được lưu an toàn trên server, dùng để đồng bộ tài liệu Drive vào kho tri thức.</p>
     <div class="flex flex-col sm:flex-row gap-2">
      <input
       type="password"
       bind:value={apiKeyInput}
       placeholder="AIzaSy..."
       class="flex-1 px-4 py-2.5 rounded-xl border border-line bg-surface-1 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-brand-300"
      />
      <button
       onclick={saveApiKey}
       disabled={savingKey || !apiKeyInput.trim()}
       class="px-5 py-2.5 rounded-xl bg-brand-600 text-white text-sm font-bold hover:bg-brand-700 disabled:opacity-50 whitespace-nowrap"
      >{savingKey ? '⏳ Đang kiểm tra...' : '💾 Lưu key'}</button>
     </div>
     {#if keyMessage}
      <div class="text-xs font-bold {keyMessage.startsWith('✅') ? 'text-emerald-600' : 'text-red-600'}">{keyMessage}</div>
     {/if}
     {#if hasKey}
      <button onclick={deleteApiKey} class="text-xs text-red-600 underline">🗑️ Xóa key đã lưu</button>
     {/if}
     <details class="text-xs text-ink-500">
      <summary class="cursor-pointer font-bold text-brand-600">Cách lấy API key</summary>
      <ol class="list-decimal ml-5 mt-1 space-y-1">
       <li>Vào <a href="https://console.cloud.google.com" target="_blank" rel="noopener" class="underline">Google Cloud Console</a> → tạo API Key → bật <strong>Google Drive API</strong></li>
       <li>Chia sẻ folder Drive cần dùng với "Bất kỳ ai có link" (Viewer)</li>
       <li>Dán key vào ô trên → Lưu (hệ thống tự kiểm tra key trước khi lưu)</li>
      </ol>
     </details>
    </div>
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
