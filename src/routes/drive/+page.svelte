<!-- src/routes/drive/+page.svelte — Google Drive Knowledge Dashboard -->
<script>
 import { onMount } from 'svelte';
 import { getAuthToken, getCurrentUser, isSuperAdmin } from '$lib/unifiedStore.js';

 const DEFAULT_FOLDER_ID = '1_V4YUCuTJ4uui49S6AfcaI8lZmIszKou';

 let currentUser = $state(null);
 let files = $state([]);
 let loading = $state(true);
 let error = $state('');
 let search = $state('');
 let activeGroup = $state('all');
 let dataSource = $state('google_drive');
 let breadcrumbs = $state([{ id: DEFAULT_FOLDER_ID, name: 'Kho Tài Liệu Tiếng Anh Cô Dung' }]);
 let currentFolderId = $state(DEFAULT_FOLDER_ID);
 let debounceTimer = $state(null);
 let apiKeyInput = $state('');
 let savingKey = $state(false);
 let keyMessage = $state('');
 let hasKey = $state(false);

 const isStaff = $derived(
  currentUser?.role === 'teacher' ||
  currentUser?.role === 'admin' ||
  currentUser?.role === 'superadmin' ||
  currentUser?.role === 'leader' ||
  isSuperAdmin(currentUser)
 );
 const isManagerRole = $derived(
  currentUser?.role === 'admin' ||
  currentUser?.role === 'superadmin' ||
  currentUser?.role === 'leader' ||
  isSuperAdmin(currentUser)
 );

 const DRIVE_GROUPS = [
  { key: 'all', label: '📚 Tất cả tài liệu' },
  { key: 'thpt_arch', label: '🎓 Luyện thi THPT & Đề chuẩn' },
  { key: 'intl_cert', label: '🌍 Chứng chỉ Quốc tế (IELTS / Cambridge)' },
  { key: 'k12_curriculum', label: '🏫 Chương trình Phổ thông (THCS / THPT)' },
  { key: 'pedagogy_ops', label: '👩‍🏫 Tài liệu Sư phạm & Giáo án' }
 ];

 let filteredFiles = $derived(
  activeGroup === 'all'
   ? files
   : files.filter((f) => f.groupKey === activeGroup)
 );

 async function checkKeyStatus() {
  if (!isManagerRole) return;
  try {
   const token = getToken();
   if (!token) return;
   const res = await fetch('/api/drive/key', { headers: { Authorization: `Bearer ${token}` } });
   if (!res.ok) return;
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

 function getToken() {
  try {
   return getAuthToken() || localStorage.getItem('tienganh_token') || localStorage.getItem('token') || '';
  } catch { return ''; }
 }

 async function loadFiles(folderId = DEFAULT_FOLDER_ID, q = '') {
  loading = true; error = '';
  try {
   const token = getToken();
   if (!token) {
    loading = false;
    return;
   }
   const resolvedFolder = !folderId || folderId === 'root' ? DEFAULT_FOLDER_ID : folderId;
   const params = new URLSearchParams({ folder_id: resolvedFolder });
   if (q) params.set('q', q);
   const res = await fetch(`/api/drive?${params}`, { headers: { Authorization: `Bearer ${token}` } });
   const data = await res.json();
   if (!data.success) {
    error = data.error || 'Không tải được danh sách file';
    files = [];
   } else {
    files = data.files || [];
    dataSource = data.source || 'google_drive';
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
  debounceTimer = setTimeout(() => loadFiles(currentFolderId, search), 350);
 }

 let folderIdInput = $state('');
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
    loadFiles(currentFolderId, search);
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
  const m = fid.match(/\/folders\/([a-zA-Z0-9_-]+)/);
  const folderId = m ? m[1] : fid;
  breadcrumbs = [{ id: folderId, name: '📁 Thư mục đã chọn' }];
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
  currentUser = getCurrentUser();
  if (isStaff) {
   checkKeyStatus();
   loadFiles(DEFAULT_FOLDER_ID);
  } else {
   loading = false;
  }
 });
</script>

<svelte:head><title>📚 Kho Tài Liệu Drive — Tiếng Anh Cô Dung</title></svelte:head>

<div class="max-w-6xl mx-auto px-4 py-6 pb-20 lg:pb-8 space-y-5">
 <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
  <div>
   <h1 class="text-2xl font-heading font-extrabold text-ink-900">📚 Kho Tài Liệu Google Drive</h1>
   <p class="text-sm text-ink-500">
    Hệ thống học liệu tiếng Anh chuẩn hóa theo nhóm chuyên đề • Đồng bộ trực tiếp với Kho Tri Thức D1
   </p>
  </div>
  <input
   type="search"
   placeholder="🔍 Tìm tài liệu tiếng Việt có dấu..."
   bind:value={search}
   oninput={onSearchInput}
   class="px-4 py-2.5 rounded-xl border border-line bg-surface-0 text-sm w-full sm:w-80 focus:outline-none focus:ring-2 focus:ring-brand-200"
  />
 </div>

 {#if !currentUser}
  <div class="rounded-2xl bg-surface-0 border border-line p-8 text-center space-y-3 shadow-xs">
   <div class="text-3xl">🔒</div>
   <div class="font-heading font-bold text-base text-ink-900">Khu Vực Học Liệu Nội Bộ Giáo Viên &amp; Quản Trị</div>
   <p class="text-xs text-ink-500 max-w-md mx-auto">Vui lòng đăng nhập bằng tài khoản Giáo viên hoặc Quản lý để duyệt và đồng bộ tài liệu từ Google Drive.</p>
  </div>
 {:else if !isStaff}
  <div class="rounded-2xl bg-amber-50 border border-amber-200 p-5 text-sm text-amber-800">
   ⚠️ Chỉ giáo viên và quản trị viên mới truy cập kho tài liệu Drive nội bộ.
  </div>
 {:else}
  <!-- Folder ID input & Sync toolbar -->
  <div class="rounded-2xl bg-surface-0 border border-line p-4 sm:p-5 space-y-3 shadow-xs">
   <div class="flex flex-wrap items-center justify-between gap-2">
    <div class="font-heading font-bold text-sm text-ink-900">📁 Quản lý thư mục Drive &amp; Đồng bộ Kho Tri Thức</div>
    {#if dataSource === 'knowledge_vault_mirror'}
     <span class="px-2.5 py-0.5 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-700 text-[11px] font-bold">
      ✓ Đang hiển thị bản đồng bộ Kho Tri Thức D1 ({files.length} tài liệu)
     </span>
    {/if}
   </div>
   <div class="flex flex-col sm:flex-row gap-2">
    <input
     type="text"
     bind:value={folderIdInput}
     placeholder="Dán Folder ID hoặc link drive.google.com/drive/folders/..."
     class="flex-1 px-4 py-2.5 rounded-xl border border-line bg-surface-1 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-brand-200"
    />
    <button
     onclick={openFolderById}
     class="px-5 py-2.5 rounded-xl bg-brand-600 text-white text-sm font-bold hover:bg-brand-700 whitespace-nowrap"
    >📂 Mở thư mục</button>
    {#if isManagerRole}
     <button
      onclick={syncDriveToVault}
      disabled={syncing}
      class="px-5 py-2.5 rounded-xl bg-emerald-600 text-white text-sm font-bold hover:bg-emerald-700 disabled:opacity-50 whitespace-nowrap"
      title="Đồng bộ toàn bộ file trong folder hiện tại vào kho tri thức"
     >{syncing ? '⏳ Đang đồng bộ...' : '🔄 Đồng bộ vào Kho Tri Thức'}</button>
    {/if}
   </div>
   {#if syncMessage}
    <div class="text-xs font-bold {syncMessage.startsWith('✅') ? 'text-emerald-600' : 'text-red-600'}">{syncMessage}</div>
   {/if}
  </div>

  <!-- Vietnamese Category Filter Pills -->
  <div class="flex items-center gap-2 overflow-x-auto pb-1">
   {#each DRIVE_GROUPS as g}
    <button
     type="button"
     onclick={() => activeGroup = g.key}
     class="px-3.5 py-2 rounded-xl text-xs font-bold whitespace-nowrap transition-all {activeGroup === g.key ? 'bg-brand-600 text-white shadow-xs' : 'bg-surface-0 border border-line text-ink-500 hover:text-ink-900'}"
    >
     {g.label}
    </button>
   {/each}
  </div>

  <!-- Breadcrumbs -->
  <nav class="flex items-center gap-1.5 text-xs sm:text-sm flex-wrap">
   {#each breadcrumbs as crumb, i}
    <button
     onclick={() => goToCrumb(i)}
     class={`px-2.5 py-1 rounded-lg ${i === breadcrumbs.length - 1 ? 'font-bold text-brand-700 bg-brand-50 border border-brand-200' : 'text-ink-500 hover:bg-surface-1'}`}
    >{crumb.name}</button>
    {#if i < breadcrumbs.length - 1}<span class="text-ink-500">/</span>{/if}
   {/each}
  </nav>

  {#if error}
   <div class="rounded-2xl bg-red-50 border border-red-200 p-5 text-sm text-red-700 space-y-3">
    <div class="font-bold">⚠️ {error}</div>
    {#if isManagerRole}
     <div class="rounded-xl bg-white border border-red-200 p-4 space-y-3">
      <div class="font-bold text-ink-900">🔑 Cấu hình Google Drive API Key (Quản lý)</div>
      <p class="text-xs text-ink-500">Key được lưu an toàn trên server, dùng để đồng bộ tài liệu Drive trực tiếp vào kho tri thức.</p>
      <div class="flex flex-col sm:flex-row gap-2">
       <input
        type="password"
        bind:value={apiKeyInput}
        placeholder="AIzaSy..."
        class="flex-1 px-4 py-2.5 rounded-xl border border-line bg-surface-1 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-brand-200"
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
     </div>
    {/if}
    <button onclick={() => loadFiles(currentFolderId, search)} class="px-4 py-2 rounded-xl bg-red-600 text-white text-sm font-bold hover:bg-red-700">🔄 Thử lại</button>
   </div>
  {:else if loading}
   <div class="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
    {#each Array(8) as _}
     <div class="rounded-2xl border border-line bg-surface-0 p-4 animate-pulse h-28"></div>
    {/each}
   </div>
  {:else if filteredFiles.length === 0}
   <div class="rounded-2xl border border-dashed border-line bg-surface-0 p-10 text-center text-ink-500">
    <div class="text-4xl mb-2">📂</div>
    <div class="font-bold text-ink-900">Không tìm thấy tài liệu phù hợp</div>
    <div class="text-xs mt-1">Thử chọn nhóm danh mục khác hoặc xóa từ khóa tìm kiếm</div>
   </div>
  {:else}
   <div class="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
    {#each filteredFiles as f}
     {#if f.isFolder}
      <button
       onclick={() => openFolder(f)}
       class="rounded-2xl border border-line bg-surface-0 p-4 text-left hover:border-brand-600 hover:shadow-md transition-all group"
      >
       <div class="text-3xl mb-2">📁</div>
       <div class="font-bold text-sm text-ink-900 line-clamp-2 group-hover:text-brand-700">{f.name}</div>
       <div class="text-xs text-ink-500 mt-1">Thư mục →</div>
      </button>
     {:else}
      <a
       href={f.webViewLink}
       target="_blank"
       rel="noopener noreferrer"
       class="rounded-2xl border border-line bg-surface-0 p-4 hover:border-brand-600 hover:shadow-md transition-all group flex flex-col justify-between gap-2"
      >
       <div>
        <div class="flex items-start justify-between gap-2 mb-2">
         <span class="text-2xl">{fileIcon(f.mimeType)}</span>
         {#if f.groupLabel}
          <span class="px-2 py-0.5 rounded-md bg-brand-50 border border-brand-200 text-brand-700 text-[10px] font-bold line-clamp-1">
           {f.groupLabel}
          </span>
         {/if}
        </div>
        <div class="font-bold text-xs sm:text-sm text-ink-900 line-clamp-2 group-hover:text-brand-700 leading-snug" title={f.name}>{f.name}</div>
       </div>
       <div class="flex items-center justify-between text-[11px] text-ink-500 pt-2 border-t border-line">
        <span>{formatSize(f.size)}</span>
        <span class="text-brand-600 font-semibold">Mở tài liệu ↗</span>
       </div>
      </a>
     {/if}
    {/each}
   </div>
  {/if}
 {/if}
</div>
