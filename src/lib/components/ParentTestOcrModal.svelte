<script>
 import { onMount, onDestroy } from 'svelte';
 import { getAuthToken, getCurrentUser, saveParentTestRecord } from '$lib/unifiedStore';
 import { playAudioFeedback } from '$lib/speech.js';

 let { isOpen = $bindable(false), student = null, onSaved = () => {} } = $props();

 let uploadedImage = $state(null);
 let isSaving = $state(false);

 // Form Fields - NO pre-filled sample scores!
 let testName = $state('');
 let testType = $state('standard_45m');
 let score = $state('');
 let maxScore = $state(10);
 let testDate = $state(new Date().toISOString().split('T')[0]);
 let teacherFeedback = $state('');
 let statusMessage = $state('');

 // Scoping & Generation Guards
 let activeStudentId = $state(null);
 let activeActorId = $state(null);
 let fileReaderGen = 0;
 let saveGen = 0;
 let currentIdempotencyKey = $state(null);
 let lastSubmittedPayloadSig = $state('');

 const testTypes = [
 { id: 'quick_15m', label: '⚡ Kiểm Tra 15 Phút Nhanh' },
 { id: 'standard_45m', label: '⏱️ Đề 1 Tiết 45 Phút Chuẩn' },
 { id: 'midterm_test', label: '📑 Khảo Sát Giữa Học Kỳ' },
 { id: 'final_test', label: '🏆 Đề Thi Cuối Kỳ' },
 { id: 'cambridge_test', label: '🌍 Bài Test Cambridge / Tiếng Anh Quốc Tế' },
 { id: 'other', label: '📝 Bài Kiểm Tra Khác' }
 ];

 function fastHash(str) {
 let hash = 5381;
 const step = Math.max(1, Math.floor(str.length / 500));
 for (let i = 0; i < str.length; i += step) {
 hash = ((hash << 5) + hash) + str.charCodeAt(i);
 hash = hash & hash;
 }
 return str.length + '_' + hash;
 }

 function computePayloadSignature() {
 return JSON.stringify({
 studentId: student?.id,
 testName: testName.trim(),
 testType,
 score: String(score).trim(),
 maxScore,
 testDate,
 feedback: teacherFeedback.trim(),
 imageSignature: uploadedImage ? (uploadedImage.slice(0, 100) + '_' + uploadedImage.slice(-100) + '_' + fastHash(uploadedImage)) : ''
 });
 }

 // Reset form cleanly whenever modal opens, child changes, or actor changes
 $effect(() => {
 const actor = getCurrentUser();
 const actorId = actor?.id || null;
 const sId = student?.id || null;

 if (isOpen) {
 if (activeStudentId !== sId || activeActorId !== actorId) {
 activeStudentId = sId;
 activeActorId = actorId;
 resetForm();
 }
 } else {
 // Invalidate in-flight background operations when modal is closed
 saveGen += 1;
 fileReaderGen += 1;
 }
 });

 function handleAuthChange() {
 saveGen += 1;
 fileReaderGen += 1;
 isOpen = false;
 resetForm();
 activeStudentId = null;
 activeActorId = null;
 }

 onMount(() => {
 if (typeof window !== 'undefined') {
 window.addEventListener('tienganh:auth-change', handleAuthChange);
 }
 });

 onDestroy(() => {
 saveGen += 1;
 fileReaderGen += 1;
 if (typeof window !== 'undefined') {
 window.removeEventListener('tienganh:auth-change', handleAuthChange);
 }
 });

 function resetForm() {
 saveGen += 1;
 fileReaderGen += 1;
 testName = '';
 testType = 'standard_45m';
 score = '';
 maxScore = 10;
 testDate = new Date().toISOString().split('T')[0];
 teacherFeedback = '';
 uploadedImage = null;
 statusMessage = '';
 isSaving = false;
 currentIdempotencyKey = null;
 lastSubmittedPayloadSig = '';
 }

 function handleFileSelect(e) {
 const file = e.target.files?.[0];
 if (!file) return;

 // Strict UI limit: 360KB binary ensures base64 string + data URL header < 500,000 characters
 if (file.size > 360 * 1024) {
 statusMessage = '⚠️ Dung lượng ảnh tối đa là 360KB! Vui lòng chọn ảnh nhỏ hơn hoặc nén lại.';
 return;
 }

 const thisReaderGen = ++fileReaderGen;
 const targetStudentId = student?.id;

 const reader = new FileReader();
 reader.onload = (event) => {
 // Invalidate if modal closed, student changed, or superseded by another file read
 if (thisReaderGen !== fileReaderGen || !isOpen || student?.id !== targetStudentId) {
 return;
 }
 const dataUrl = event.target?.result;
 if (typeof dataUrl === 'string' && dataUrl.length > 500000) {
 statusMessage = '⚠️ Dữ liệu ảnh sau mã hóa vượt quá giới hạn 500.000 ký tự. Vui lòng chọn ảnh nhỏ hơn.';
 return;
 }
 uploadedImage = dataUrl;
 statusMessage = '📷 Đã đính kèm ảnh chụp bài thi (tài liệu tham khảo, chưa xác thực).';
 };
 reader.readAsDataURL(file);
 }

 async function handleSave() {
 if (!student || !student.id) {
 statusMessage = '⚠️ Chưa xác định được học sinh liên kết!';
 return;
 }

 const cleanName = testName.trim();
 if (!cleanName) {
 statusMessage = '⚠️ Vui lòng nhập Tên bài kiểm tra / Chuyên đề!';
 return;
 }

 if (score === '' || isNaN(Number(score))) {
 statusMessage = '⚠️ Vui lòng nhập điểm số đạt được!';
 return;
 }

 const numScore = Number(score);
 const numMax = Number(maxScore) || 10;

 if (!isFinite(numScore) || numScore < 0 || numScore > numMax) {
 statusMessage = `⚠️ Điểm số không hợp lệ! Phải là số từ 0 đến ${numMax}.`;
 return;
 }

 const currentSig = computePayloadSignature();
 // If payload changed, generate a new idempotency key to prevent 409 conflict
 // If payload is identical (retry), maintain same idempotency key to permit safe replay
 if (!currentIdempotencyKey || currentSig !== lastSubmittedPayloadSig) {
 currentIdempotencyKey = `ptest_${student.id}_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
 lastSubmittedPayloadSig = currentSig;
 }

 const thisSaveGen = ++saveGen;
 const targetStudentId = student.id;
 const actor = getCurrentUser();
 const actorId = actor?.id;

 isSaving = true;
 statusMessage = '';

 try {
 const token = getAuthToken();
 const res = await fetch('/api/parents/tests', {
 method: 'POST',
 headers: {
 'Content-Type': 'application/json',
 ...(token ? { 'Authorization': `Bearer ${token}` } : {})
 },
 body: JSON.stringify({
 student_id: targetStudentId,
 test_name: cleanName,
 test_type: testType,
 score: numScore,
 max_score: numMax,
 test_date: testDate,
 teacher_feedback: teacherFeedback.trim(),
 image_url: uploadedImage || '',
 idempotency_key: currentIdempotencyKey
 })
 });

 const data = await res.json();

 // Guard against late response if modal closed, student changed, or actor changed
 if (thisSaveGen !== saveGen || !isOpen || student?.id !== targetStudentId || getCurrentUser()?.id !== actorId) {
 return;
 }

 if (res.ok && data.success) {
 playAudioFeedback('correct');
 onSaved(data.record);
 isOpen = false;
 resetForm();
 } else {
 statusMessage = `⚠️ ${data.error || 'Có lỗi xảy ra khi lưu hồ sơ bài thi vào máy chủ!'}`;
 }
 } catch (err) {
 if (thisSaveGen !== saveGen || !isOpen || student?.id !== targetStudentId || getCurrentUser()?.id !== actorId) {
 return;
 }
 statusMessage = `⚠️ Lỗi kết nối máy chủ: ${err.message || err}`;
 } finally {
 if (thisSaveGen === saveGen && isOpen && student?.id === targetStudentId) {
 isSaving = false;
 }
 }
 }
</script>

{#if isOpen}
 <div class="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-md animate-in fade-in duration-200">
 <div class="w-full max-w-xl bg-white border border-purple-200 rounded-3xl shadow-2xl overflow-hidden relative font-sans text-slate-800 flex flex-col max-h-[92vh]">
 
 <!-- Modal Header -->
 <div class="bg-gradient-to-r from-purple-700 via-indigo-700 to-purple-800 p-6 text-white border-b border-purple-500/20 relative">
 <button
 onclick={() => isOpen = false}
 class="absolute top-4 right-4 text-purple-100 hover:text-white p-1.5 rounded-full bg-black/20 hover:bg-black/40 text-xs transition-all"
 title="Đóng"
 >
 ✕
 </button>

 <div class="flex items-center gap-3">
 <div class="w-12 h-12 rounded-2xl bg-white/20 border border-white/30 flex items-center justify-center text-2xl shadow-md">
 📝
 </div>
 <div>
 <div class="text-[11px] font-bold uppercase tracking-wider text-purple-200">SỔ PHỤ HUYNH • THEO DÕI ĐIỂM SỐ</div>
 <h2 class="text-xl font-heading font-black">
 Khai Báo Điểm Bài Thi {student ? `của con: ${student.name}` : ''}
 </h2>
 <div class="text-xs text-purple-100 mt-0.5">Phụ huynh tự nhập điểm bài thi định kỳ để cùng Cô Dung theo dõi tiến độ</div>
 </div>
 </div>
 </div>

 <!-- Regulatory Policy Notice Banner -->
 <div class="bg-amber-50 border-b border-amber-200 p-3.5 px-6 text-xs text-amber-900 flex items-start gap-2.5">
 <span class="text-base leading-none">ℹ️</span>
 <div class="text-[11px] leading-relaxed">
 <strong>Lưu ý quy chế minh bạch:</strong> Điểm số do phụ huynh tự khai báo phục vụ theo dõi học tập của gia đình, mang trạng thái <strong>Chưa xác thực (Unverified)</strong>. Hệ thống không sử dụng dữ liệu này để cộng sao thưởng, giảm trừ học phí hoặc thay thế điểm thi chính thức của lớp.
 </div>
 </div>

 <!-- Modal Body -->
 <div class="p-6 overflow-y-auto space-y-4 flex-1 text-xs">
 {#if statusMessage}
 <div class="p-3 rounded-2xl text-xs font-semibold bg-rose-500/10 border border-rose-500/30 text-rose-600">
 {statusMessage}
 </div>
 {/if}

 <!-- Attachment upload box (No OCR scanning claim) -->
 <div class="p-4 rounded-2xl border border-dashed border-purple-300 bg-purple-50/40 text-center space-y-2">
 {#if !uploadedImage}
 <div class="flex items-center justify-between text-left">
 <div>
 <strong class="text-xs font-bold text-slate-800 block">
 Đính kèm ảnh chụp bài kiểm tra (Tùy chọn)
 </strong>
 <span class="text-slate-500 text-[11px] block mt-0.5">
 Lưu trữ hình ảnh để đối chiếu khi cần. Dung lượng tối đa 360KB.
 </span>
 </div>
 <label class="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-purple-600 hover:bg-purple-500 text-white font-bold text-xs shadow-sm cursor-pointer transition-all">
 <span>📎 Tải ảnh</span>
 <input type="file" accept="image/*" onchange={handleFileSelect} class="hidden" />
 </label>
 </div>
 {:else}
 <div class="flex items-center justify-between">
 <div class="flex items-center gap-3">
 <img src={uploadedImage} alt="Bài thi đính kèm" class="w-14 h-14 rounded-xl object-cover border border-purple-400 shadow-sm" />
 <div class="text-left">
 <div class="font-bold text-slate-800 text-xs">Ảnh bài thi đã đính kèm</div>
 <div class="text-[10px] text-amber-600 font-semibold">Tài liệu tham khảo (Chưa xác minh)</div>
 </div>
 </div>
 <div class="flex items-center gap-2">
 <label class="text-[11px] text-purple-600 font-bold underline cursor-pointer">
 Đổi ảnh
 <input type="file" accept="image/*" onchange={handleFileSelect} class="hidden" />
 </label>
 <button
 type="button"
 onclick={() => uploadedImage = null}
 class="text-[11px] text-rose-500 hover:text-rose-700 font-bold ml-2"
 >
 Gỡ ảnh
 </button>
 </div>
 </div>
 {/if}
 </div>

 <!-- FORM INPUTS -->
 <div class="space-y-3 pt-1">
 <div>
 <label for="parent-test-name" class="block font-semibold text-slate-700 mb-1">
 Tên Bài Kiểm Tra / Chuyên Đề (*):
 </label>
 <input
 id="parent-test-name"
 type="text"
 bind:value={testName}
 required
 placeholder="VD: Khảo sát 15 phút Unit 2, Đề kiểm tra 1 tiết giữa kỳ..."
 class="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-slate-900 focus:outline-none focus:border-purple-500"
 />
 </div>

 <div class="grid grid-cols-1 sm:grid-cols-3 gap-3">
 <div>
 <label for="parent-test-type" class="block font-semibold text-slate-700 mb-1">
 Loại Bài Kiểm Tra:
 </label>
 <select
 id="parent-test-type"
 bind:value={testType}
 class="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-slate-900 focus:outline-none focus:border-purple-500 text-xs"
 >
 {#each testTypes as t}
 <option value={t.id}>{t.label}</option>
 {/each}
 </select>
 </div>

 <div>
 <label for="parent-score" class="block font-semibold text-purple-700 mb-1 font-bold">
 Điểm Số Đạt Được (*):
 </label>
 <input
 id="parent-score"
 type="number"
 step="0.1"
 min="0"
 max={maxScore}
 bind:value={score}
 required
 placeholder="VD: 8.5"
 class="w-full bg-purple-50/50 border border-purple-300 rounded-xl px-3 py-2 text-base font-heading font-black text-purple-700 focus:outline-none focus:border-purple-500"
 />
 </div>

 <div>
 <label for="parent-date" class="block font-semibold text-slate-700 mb-1">
 Ngày Làm Bài:
 </label>
 <input
 id="parent-date"
 type="date"
 bind:value={testDate}
 class="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-slate-900 focus:outline-none focus:border-purple-500 text-xs"
 />
 </div>
 </div>

 <div>
 <label for="parent-feedback" class="block font-semibold text-slate-700 mb-1">
 Lời Phê / Nhận Xét Của Giáo Viên (Nếu có):
 </label>
 <textarea
 id="parent-feedback"
 rows="2"
 bind:value={teacherFeedback}
 placeholder="VD: Con làm bài cẩn thận, phát âm tốt..."
 class="w-full bg-slate-50 border border-slate-300 rounded-xl p-3 text-slate-900 focus:outline-none focus:border-purple-500"
 ></textarea>
 </div>
 </div>

 <!-- Action Button -->
 <button
 type="button"
 disabled={isSaving}
 onclick={handleSave}
 class="w-full py-3 rounded-xl bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white font-extrabold text-xs shadow-lg shadow-purple-600/25 transition-all hover:scale-[1.01] flex items-center justify-center gap-2 mt-4 disabled:opacity-50"
 >
 {#if isSaving}
 <span class="inline-block animate-spin w-4 h-4 border-2 border-white border-t-transparent rounded-full"></span>
 <span>Đang lưu trữ vào máy chủ...</span>
 {:else}
 <span>💾 Lưu Điểm Bài Thi Vào Sổ Theo Dõi</span>
 {/if}
 </button>
 </div>
 </div>
 </div>
{/if}
