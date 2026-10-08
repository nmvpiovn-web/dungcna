<svelte:head>
 <title>AdminCP Tổng • Quản Trị Hệ Thống Toàn Quyền • Tiếng Anh Cô Dung</title>
</svelte:head>

<script>
 import { onMount } from 'svelte';
 import { getCurrentUser, isSuperAdmin, scanScheduleAndAttendanceForLeader, scanTuitionDueAlerts } from '$lib/unifiedStore';
 import { currentLang, toggleLanguage, t } from '$lib/i18n';
 import { playAudioFeedback } from '$lib/speech';
 import ThemeStudioPanel from '$lib/components/ThemeStudioPanel.svelte';
 import QuizMakeForm from '$lib/components/QuizMakeForm.svelte';
 import AdminUsersPanel from '$lib/components/AdminUsersPanel.svelte';
 import { applyThemeVars, clearLocal } from '$lib/themeStudio.js';

 let currentUser = $state(null);
 let campuses = $state([]);
 let streams = $state([]);
 let assignments = $state([]);
 let submissions = $state([]);
 let loading = $state(true);
 let activeTab = $state('campuses'); // 'campuses' | 'streams' | 'cross_reminders' | 'storage_audit' | 'theme' | 'quiz_make' | 'users'
 let selectedCampusFilter = $state('all');
 let lang = $state('vi');

 // Theme Studio (tab Giao dien)
 let themeDraft = $state(null); // {name, c, hof} dang xem truoc
 let themeSaved = $state(null); // theme chung dang luu tren web
 let themeMsg = $state('');
 let themeSaving = $state(false);

 function authHeaders(){
 const token = typeof localStorage !== 'undefined' ? localStorage.getItem('tienganh_token') : null;
 return token ? { 'Authorization': `Bearer ${token}` } : {};
 }
 async function loadSavedTheme(){
 try {
 const res = await fetch('/api/site-theme');
 const data = await res.json();
 if (data.success) themeSaved = data.theme;
 } catch {}
 }
 function previewTheme(c, hof, name){
 applyThemeVars(c, hof);
 themeDraft = { name, c, hof };
 themeMsg = '';
 }
 async function saveThemeGlobal(){
 if (!themeDraft){ themeMsg = 'Chua chon mau nao de luu.'; return; }
 themeSaving = true; themeMsg = '';
 try {
 const res = await fetch('/api/site-theme', {
 method: 'PUT',
 headers: { ...authHeaders(), 'Content-Type': 'application/json' },
 body: JSON.stringify({ theme: themeDraft })
 });
 const data = await res.json();
 if (data.success){
 themeSaved = themeDraft;
 clearLocal(); // de admin thay luon theme chung vua luu
 themeMsg = `✓ Da luu "${themeDraft.name}" — toan bo web se hien mau nay.`;
 playAudioFeedback?.('success');
 } else themeMsg = '✗ ' + (data.error || 'Khong luu duoc.');
 } catch { themeMsg = '✗ Loi ket noi.'; }
 themeSaving = false;
 }
 async function clearGlobalTheme(){
 themeSaving = true; themeMsg = '';
 try {
 const res = await fetch('/api/site-theme', { method: 'DELETE', headers: authHeaders() });
 const data = await res.json();
 if (data.success){
 themeSaved = null; themeDraft = null;
 themeMsg = '✓ Da go theme chung — web ve mau mac dinh. Dang tai lai...';
 setTimeout(()=>location.reload(), 1200);
 } else themeMsg = '✗ ' + (data.error || 'Khong xoa duoc.');
 } catch { themeMsg = '✗ Loi ket noi.'; }
 themeSaving = false;
 }

 // Cross-reminders toast
 let scanToast = $state('');
 let isScanning = $state(false);

 // New Campus Form Modal
 let showAddCampusModal = $state(false);
 let newCampus = $state({
 id: '',
 name: '',
 short_code: '',
 address: '',
 hotline: '',
 manager_user_id: ''
 });

 currentLang.subscribe(val => {
 lang = val;
 });

 async function loadData() {
 loading = true;
 currentUser = getCurrentUser();
 try {
 const token = typeof window !== 'undefined' ? localStorage.getItem('tienganh_token') : '';
 const headers = token ? { 'Authorization': `Bearer ${token}` } : {};

 const [campRes, hwRes] = await Promise.all([
 fetch('/api/campuses?streams=true', { headers }),
 fetch('/api/homework', { headers })
 ]);

 const campData = await campRes.json();
 const hwData = await hwRes.json();

 if (campData.success) {
 campuses = campData.campuses || [];
 streams = campData.streams || [];
 }
 if (hwData.success) {
 assignments = hwData.assignments || [];
 submissions = hwData.submissions || [];
 }
 } catch (e) {
 console.error('Failed to load AdminCP data:', e);
 } finally {
 loading = false;
 }
 }

 onMount(() => {
 loadData();
 loadSavedTheme();
 });

 let filteredStreams = $derived.by(() => {
 if (selectedCampusFilter === 'all') return streams;
 return streams.filter(s => s.campus_id === selectedCampusFilter);
 });

 // Cross Reminders Scanner — honest version (RB-M3 pattern fix, 2026-09-30):
 // runs the REAL scan engines (schedule/attendance + tuition) and reports the
 // actual number of alerts generated. No more sleep(800) fake success.
 async function triggerCrossRemindersScan() {
 isScanning = true;
 scanToast = '';
 try {
 const scheduleNotifs = scanScheduleAndAttendanceForLeader() || [];
 const tuitionNotifs = scanTuitionDueAlerts() || [];
 const total = scheduleNotifs.length + tuitionNotifs.length;
 if (total > 0) {
 scanToast = `✅ Quét xong: phát hiện ${total} cảnh báo (${scheduleNotifs.length} lịch học/chấm bài, ${tuitionNotifs.length} học phí) — đã tạo thông báo trong Trung Tâm Báo Cáo Leader.`;
 } else {
 scanToast = '✅ Quét xong: không phát hiện deadline quá hạn hay giáo viên chậm chấm trong phạm vi dữ liệu hiện tại.';
 }
 playAudioFeedback(true);
 } catch (e) {
 scanToast = 'Lỗi quét: ' + e.message;
 } finally {
 isScanning = false;
 }
 }
</script>

<div class="min-h-screen bg-slate-50 text-slate-900 font-sans p-4 sm:p-6 lg:p-8 space-y-6 transition-colors duration-150">
 <!-- Top AdminCP Bar -->
 <header class="bg-white border border-slate-200 rounded-lg p-5 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
 <div class="flex items-center gap-3">
 <div class="w-12 h-12 rounded-md bg-slate-800 flex items-center justify-center text-white font-semibold text-2xl shadow-sm">
 ⚡
 </div>
 <div>
 <div class="flex items-center gap-2">
 <span class="text-xs font-bold uppercase tracking-wider text-rose-600">Ms. Dung Master AdminCP</span>
 <span class="text-[10px] px-2 py-0.5 rounded-full bg-rose-50 text-rose-700 font-bold border border-rose-200">SUPERADMIN</span>
 </div>
 <h1 class="text-xl sm:text-2xl font-heading font-semibold text-slate-900">Trung Tâm Điều Hành Tối Cao Toàn Hệ Thống</h1>
 </div>
 </div>

 <!-- Quick Switch Links to Cpanels & Language -->
 <div class="flex flex-wrap items-center gap-2">
 <button 
 onclick={toggleLanguage}
 class="px-3 py-1.5 rounded-md bg-slate-100 hover:bg-slate-200 text-xs font-semibold text-slate-800 transition-all border border-slate-200"
 >
 {lang === 'vi' ? '🇻🇳 Tiếng Việt' : '🇬🇧 English'}
 </button>
 <a href="/cpanel/student" class="px-3 py-1.5 rounded-md bg-slate-100 hover:bg-slate-200 text-xs font-semibold text-cx-700 transition-all border border-slate-200">
 🎒 Học Sinh
 </a>
 <a href="/cpanel/parent" class="px-3 py-1.5 rounded-md bg-slate-100 hover:bg-slate-200 text-xs font-semibold text-emerald-700 transition-all border border-slate-200">
 👨‍👩‍👧 Phụ Huynh
 </a>
 <a href="/cpanel/teacher" class="px-3 py-1.5 rounded-md bg-slate-100 hover:bg-slate-200 text-xs font-semibold text-amber-700 transition-all border border-slate-200">
 👩‍🏫 Giáo Viên
 </a>
 <a href="/cpanel/leader" class="px-3 py-1.5 rounded-md bg-slate-100 hover:bg-slate-200 text-xs font-semibold text-indigo-700 transition-all border border-slate-200">
 👑 Leader &amp; Bài Test
 </a>
 <a href="/" class="px-3 py-1.5 rounded-md bg-rose-600 hover:bg-rose-700 text-xs font-semibold text-white shadow-sm transition-all">
 🏠 Trang Chủ
 </a>
 </div>
 </header>

 <!-- Metrics Grid -->
 <div class="grid grid-cols-2 sm:grid-cols-4 gap-4">
 <div class="bg-white border border-slate-200 rounded-lg p-4 shadow-sm">
 <div class="text-xs font-bold text-slate-700 uppercase tracking-wider">Cơ Sở Dạy Học</div>
 <div class="text-2xl font-semibold text-rose-600 mt-1">{campuses.length}</div>
 <div class="text-[11px] text-slate-600 font-medium mt-1">Đa điểm liên kết</div>
 </div>
 <div class="bg-white border border-slate-200 rounded-lg p-4 shadow-sm">
 <div class="text-xs font-bold text-slate-700 uppercase tracking-wider">Sự Kiện Trực Tiếp</div>
 <div class="text-2xl font-semibold text-amber-600 mt-1">{streams.length}</div>
 <div class="text-[11px] text-slate-600 font-medium mt-1">Ghi nhận đa cơ sở</div>
 </div>
 <div class="bg-white border border-slate-200 rounded-lg p-4 shadow-sm">
 <div class="text-xs font-bold text-slate-700 uppercase tracking-wider">Bài Tập Về Nhà</div>
 <div class="text-2xl font-semibold text-cx-600 mt-1">{assignments.length}</div>
 <div class="text-[11px] text-slate-600 font-medium mt-1">Đã phát hành</div>
 </div>
 <div class="bg-white border border-slate-200 rounded-lg p-4 shadow-sm">
 <div class="text-xs font-bold text-slate-700 uppercase tracking-wider">Bài Nộp Học Sinh</div>
 <div class="text-2xl font-semibold text-emerald-600 mt-1">{submissions.length}</div>
 <div class="text-[11px] text-slate-600 font-medium mt-1">Viết tay &amp; Ghi âm nói</div>
 </div>
 </div>

 <!-- Navigation Tabs -->
 <div class="flex flex-wrap items-center justify-between gap-3 bg-white p-2 rounded-lg border border-slate-200 shadow-sm">
 <div class="flex items-center gap-1 overflow-x-auto">
 <button 
 onclick={() => activeTab = 'campuses'}
 class="px-4 py-2 rounded-md text-xs font-bold transition-all {activeTab === 'campuses' ? 'bg-rose-600 text-white shadow-sm' : 'text-slate-700 hover:bg-slate-100'}"
 >
 🏢 Quản Lý Cơ Sở Đa Điểm ({campuses.length})
 </button>
 <button 
 onclick={() => activeTab = 'streams'}
 class="px-4 py-2 rounded-md text-xs font-bold transition-all {activeTab === 'streams' ? 'bg-rose-600 text-white shadow-sm' : 'text-slate-700 hover:bg-slate-100'}"
 >
 📡 Dòng Hoạt Động Thời Gian Thực ({streams.length})
 </button>
 <button 
 onclick={() => activeTab = 'cross_reminders'}
 class="px-4 py-2 rounded-md text-xs font-bold transition-all {activeTab === 'cross_reminders' ? 'bg-rose-600 text-white shadow-sm' : 'text-slate-700 hover:bg-slate-100'}"
 >
 🔔 Nhắc Nhở Chéo (Cross-Reminders)
 </button>
 <button 
 onclick={() => activeTab = 'storage_audit'}
 class="px-4 py-2 rounded-md text-xs font-bold transition-all {activeTab === 'storage_audit' ? 'bg-rose-600 text-white shadow-sm' : 'text-slate-700 hover:bg-slate-100'}"
 >
 📁 Cây Thư Mục &amp; Audit Bài Nộp
 </button>
 <button 
 onclick={() => activeTab = 'theme'}
 class="px-4 py-2 rounded-md text-xs font-bold transition-all {activeTab === 'theme' ? 'bg-rose-600 text-white shadow-sm' : 'text-slate-700 hover:bg-slate-100'}"
 >
 🎨 Giao Diện &amp; Màu Sắc
 </button>
 <button 
 onclick={() => activeTab = 'quiz_make'}
 class="px-4 py-2 rounded-md text-xs font-bold transition-all {activeTab === 'quiz_make' ? 'bg-rose-600 text-white shadow-sm' : 'text-slate-700 hover:bg-slate-100'}"
 >
 📝 Tạo Quiz
 </button>
 <button 
 onclick={() => activeTab = 'users'}
 class="px-4 py-2 rounded-md text-xs font-bold transition-all {activeTab === 'users' ? 'bg-rose-600 text-white shadow-sm' : 'text-slate-700 hover:bg-slate-100'}"
 >
 👥 Tài Khoản
 </button>
 </div>

 <!-- Campus Filter Dropdown -->
 <div class="flex items-center gap-2">
 <span class="text-xs text-slate-700 font-semibold">Lọc cơ sở:</span>
 <select 
 bind:value={selectedCampusFilter}
 class="text-xs font-bold bg-slate-50 text-slate-800 px-3 py-1.5 rounded-md border border-slate-200 focus:outline-none"
 >
 <option value="all">🌐 Toàn bộ cơ sở</option>
 {#each campuses as c}
 <option value={c.id}>{c.name}</option>
 {/each}
 </select>
 </div>
 </div>

 <!-- TAB 1: CAMPUSES MANAGEMENT -->
 {#if activeTab === 'campuses'}
 <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
 {#each campuses as campus}
 <div class="bg-white border border-slate-200 rounded-lg p-5 shadow-sm space-y-3 flex flex-col justify-between">
 <div>
 <div class="flex items-center justify-between">
 <span class="px-2.5 py-1 rounded-lg bg-rose-50 text-rose-700 font-mono font-bold text-xs border border-rose-200">
 {campus.short_code}
 </span>
 <span class="text-xs text-emerald-600 font-bold flex items-center gap-1">
 <span class="w-2 h-2 rounded-full bg-emerald-500"></span> Đang hoạt động
 </span>
 </div>
 <h3 class="text-base font-heading font-semibold text-slate-900 mt-2">{campus.name}</h3>
 <p class="text-xs text-slate-600 font-normal mt-1">📍 {campus.address}</p>
 <div class="text-xs text-slate-600 mt-2 font-medium">
 Hotline: <strong class="text-slate-800">{campus.hotline || 'Chưa cập nhật'}</strong>
 </div>
 </div>

 <div class="pt-3 border-t border-slate-100 flex items-center justify-between text-xs">
 <span class="text-slate-600">Quản lý: <strong class="text-cx-700">{campus.manager_user_id || 'Cô Dung'}</strong></span>
 <span class="text-amber-700 font-bold">Mã: {campus.id}</span>
 </div>
 </div>
 {/each}
 </div>

 <!-- TAB 2: REALTIME ACTIVITY STREAMS -->
 {:else if activeTab === 'streams'}
 <div class="bg-white border border-slate-200 rounded-lg p-6 shadow-sm space-y-4">
 <div class="flex items-center justify-between border-b border-slate-100 pb-3">
 <div>
 <h2 class="text-base font-heading font-semibold text-slate-900 flex items-center gap-2">
 <span>📡 Dòng Sự Kiện Đa Cơ Sở Chồng Chéo</span>
 <span class="w-2 h-2 rounded-full bg-rose-500 animate-ping"></span>
 </h2>
 <p class="text-xs text-slate-600 mt-0.5 font-normal">Mọi hành vi giao bài, nộp bài viết tay, điểm danh và dạy thay liên cơ sở được ghi nhận đồng bộ.</p>
 </div>
 </div>

 {#if filteredStreams.length === 0}
 <div class="text-center py-12 text-slate-500 text-xs font-medium">
 Không có sự kiện nào được ghi nhận cho bộ lọc này.
 </div>
 {:else}
 <div class="space-y-3 max-h-[500px] overflow-y-auto pr-2">
 {#each filteredStreams as stm}
 {@const campusObj = campuses.find(c => c.id === stm.campus_id)}
 <div class="p-4 rounded-lg bg-slate-50 border border-slate-200 flex items-start justify-between gap-4">
 <div class="space-y-1">
 <div class="flex items-center gap-2">
 <span class="px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wider bg-rose-50 text-rose-700 border border-rose-200">
 {campusObj?.short_code || stm.campus_id}
 </span>
 <span class="font-bold text-slate-900 text-sm">{stm.title}</span>
 </div>
 <p class="text-xs text-slate-600 font-normal">{stm.detail}</p>
 <div class="text-[11px] text-slate-600 flex items-center gap-2 mt-1 font-medium">
 <span>Thực hiện: <strong class="text-slate-800">{stm.actor_name}</strong> ({stm.actor_role})</span>
 <span>•</span>
 <span>Mã tham chiếu: <code class="text-cx-700">{stm.reference_id || 'N/A'}</code></span>
 </div>
 </div>
 <span class="text-xs text-slate-500 whitespace-nowrap font-mono">
 {new Date(stm.created_at).toLocaleString('vi-VN')}
 </span>
 </div>
 {/each}
 </div>
 {/if}
 </div>

 <!-- TAB 3: CROSS REMINDERS SYSTEM -->
 {:else if activeTab === 'cross_reminders'}
 <div class="bg-white border border-slate-200 rounded-lg p-6 shadow-sm space-y-6 max-w-4xl mx-auto">
 <div class="border-b border-slate-100 pb-4">
 <h2 class="text-lg font-heading font-semibold text-slate-900">🔔 Cơ Chế Nhắc Nhở Chéo (Cross-Reminders Engine)</h2>
 <p class="text-xs text-slate-600 mt-1 font-normal">Tự động giám sát thời hạn làm bài tập của học sinh và tiến độ chấm bài của giáo viên.</p>
 </div>

 <div class="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
 <div class="p-4 rounded-lg bg-slate-50 border border-slate-200 space-y-2">
 <div class="font-bold text-amber-700 flex items-center gap-1.5">
 <span>⏰ 1. Nhắc Học Sinh &amp; Phụ Huynh</span>
 </div>
 <p class="text-slate-600 font-normal leading-relaxed">
 Hệ thống tự động phát thông báo trước deadline 12h và 2h. Nếu học sinh chưa nộp bài, gửi thông báo chéo tới Phụ huynh để phụ huynh nhắc nhở con.
 </p>
 </div>

 <div class="p-4 rounded-lg bg-slate-50 border border-slate-200 space-y-2">
 <div class="font-bold text-rose-700 flex items-center gap-1.5">
 <span>👩‍🏫 2. Nhắc Giáo Viên Chậm Chấm Bài</span>
 </div>
 <p class="text-slate-600 font-normal leading-relaxed">
 Khi học sinh đã nộp bài quá 24h mà chưa có điểm, tự động gửi thông báo giục giáo viên buổi học đó và báo cáo lên Leader chuyên môn của cơ sở.
 </p>
 </div>
 </div>

 <div class="p-4 rounded-lg bg-slate-50 border border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
 <div>
 <div class="font-bold text-slate-900 text-xs">Kích hoạt quét toàn bộ BTVN &amp; Bài nộp ngay bây giờ:</div>
 <div class="text-[11px] text-slate-600 font-medium">Quét deadline các lớp Lớp 7 Chuyên, Lớp 9, Lớp 12 trên toàn bộ cơ sở.</div>
 </div>
 <button 
 onclick={triggerCrossRemindersScan}
 disabled={isScanning}
 class="px-5 py-2.5 rounded-md bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs shadow-sm disabled:opacity-50 whitespace-nowrap"
 >
 {isScanning ? 'Đang quét hệ thống...' : '⚡ Chạy Quét Nhắc Nhở Chéo'}
 </button>
 </div>

 {#if scanToast}
 <div class="p-3 rounded-md text-xs font-bold text-center bg-emerald-50 text-emerald-800 border border-emerald-200">
 {scanToast}
 </div>
 {/if}
 </div>

 <!-- TAB 4: STORAGE TREE AUDIT -->
 {:else if activeTab === 'storage_audit'}
 <div class="bg-white border border-slate-200 rounded-lg p-6 shadow-sm space-y-4">
 <div class="border-b border-slate-100 pb-3">
 <h2 class="text-base font-heading font-semibold text-slate-900">📁 Cây Thư Mục Lưu Trữ BTVN &amp; Bài Nộp Chuẩn Hóa</h2>
 <p class="text-xs text-slate-600 font-normal mt-0.5">Cấu trúc: <code>storage/homework/&lbrace;campus&rbrace;/&lbrace;class&rbrace;/&lbrace;session&rbrace;/&lbrace;student&rbrace;/&lbrace;assignment&rbrace;/</code></p>
 </div>

 <div class="space-y-3 font-mono text-xs">
 {#each submissions as sub}
 {@const assignment = assignments.find(a => a.id === sub.assignment_id)}
 <div class="p-4 rounded-lg bg-slate-50 border border-slate-200 space-y-2">
 <div class="flex items-center justify-between text-cx-700 font-semibold">
 <span>📂 storage/homework/{assignment?.campus_id || 'loc_codung'}/{assignment?.class_id || 'cls_g7'}/{assignment?.session_id || 'sess_01'}/{sub.student_id}/{sub.assignment_id}/</span>
 <span class="text-slate-500 text-[11px] font-sans font-medium">{new Date(sub.submitted_at).toLocaleDateString('vi-VN')}</span>
 </div>

 <div class="pl-4 border-l-2 border-slate-300 space-y-1 text-slate-700 font-sans text-xs">
 <div>Học sinh: <strong class="text-slate-900">{sub.student_name}</strong> • Điểm số: <strong class="text-amber-700">{sub.score !== null ? `${sub.score}/10` : 'Chờ chấm'}</strong></div>
 {#if sub.handwritten_image_url}
 <div class="text-amber-700 flex items-center gap-1 font-mono text-[11px]">
 <span>📄 handwritten_worksheet_p1.jpg</span>
 <a href={sub.handwritten_image_url} target="_blank" class="text-cx-700 underline font-sans ml-2">Xem ảnh</a>
 </div>
 {/if}
 {#if sub.audio_url}
 <div class="text-emerald-700 flex items-center gap-1 font-mono text-[11px]">
 <span>🎙️ speaking_voice_record.webm</span>
 </div>
 {/if}
 {#if sub.content_text}
 <div class="text-slate-600 text-[11px] italic font-normal">"{sub.content_text.slice(0, 100)}..."</div>
 {/if}
 </div>
 </div>
 {/each}
 </div>
 </div>
 <!-- TAB 5: GIAO DIEN & MAU SAC -->
 {:else if activeTab === 'theme'}
 <div class="bg-white border border-slate-200 rounded-lg p-6 shadow-sm">
 <div class="border-b border-slate-100 pb-3 mb-4">
 <h2 class="text-base font-heading font-semibold text-slate-900">🎨 Giao Diện &amp; Màu Sắc Web</h2>
 <p class="text-xs text-slate-600 font-normal mt-0.5">
 Chọn màu bên dưới để <b>xem trước trực tiếp</b> trên trang này.
 Bấm <b>💾 Lưu lên web</b> thì toàn bộ khách truy cập sẽ thấy màu mới.
 </p>
 <div class="mt-2 text-xs font-bold">
 {#if themeSaved}
 <span class="text-emerald-700">● Đang áp dụng chung: {themeSaved.name}</span>
 {:else}
 <span class="text-slate-500">○ Chưa có theme chung — đang dùng màu mặc định (Lavie Aqua).</span>
 {/if}
 {#if themeDraft}
 <span class="text-amber-700"> • Xem trước: {themeDraft.name} (chưa lưu)</span>
 {/if}
 </div>
 </div>

 <div class="max-w-md">
 <ThemeStudioPanel activeName={themeDraft?.name || themeSaved?.name || 'Lavie Aqua'} onApply={(c,hof,name)=>previewTheme(c,hof,name)} />
 </div>

 {#if themeMsg}
 <div class="mt-4 p-3 rounded-md text-xs font-bold text-center {themeMsg.startsWith('✓') ? 'bg-emerald-50 text-emerald-800 border border-emerald-200' : 'bg-amber-50 text-amber-800 border border-amber-200'}">
 {themeMsg}
 </div>
 {/if}

 <div class="flex flex-wrap gap-3 mt-4">
 <button
 onclick={saveThemeGlobal}
 disabled={themeSaving || !themeDraft}
 class="px-5 py-2.5 rounded-md text-sm font-semibold text-white bg-cx-600 hover:bg-cx-700 disabled:opacity-40 disabled:cursor-not-allowed shadow-sm transition-all"
 >
 {themeSaving ? '⏳ Đang lưu...' : '💾 Lưu lên web'}
 </button>
 {#if themeSaved}
 <button
 onclick={clearGlobalTheme}
 disabled={themeSaving}
 class="px-5 py-2.5 rounded-md text-sm font-bold text-slate-700 bg-slate-100 hover:bg-slate-200 border border-slate-200 disabled:opacity-40 transition-all"
 >
 ↩️ Về màu mặc định
 </button>
 {/if}
 </div>
 <p class="text-[11px] text-slate-500 mt-3">
 Lưu ý: đổi theme không ảnh hưởng dữ liệu hay tài khoản nào — chỉ đổi màu hiển thị.
 </p>
 </div>
 <!-- TAB 6: TAO QUIZ -->
 {:else if activeTab === 'quiz_make'}
 <QuizMakeForm />
 <!-- TAB 7: QUAN LY TAI KHOAN -->
 {:else if activeTab === 'users'}
 <AdminUsersPanel />
 {/if}
</div>
