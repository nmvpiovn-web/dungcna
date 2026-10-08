<!-- src/lib/components/QuizMakeForm.svelte
 Form tạo quiz mới trong admincp (tab "Tạo Quiz").
 - Thông tin quiz: tiêu đề, mô tả, khối lớp, thời lượng (phút), xuất bản ngay
 - Câu hỏi: trắc nghiệm (câu hỏi + 4 đáp án + chọn đáp án đúng) hoặc tự luận (câu hỏi + gợi ý đáp án)
 - POST /api/exams/create với Bearer <redacted> -->
<script>
 import { playAudioFeedback } from '$lib/speech';

 let title = $state('');
 let description = $state('');
 let grade = $state(7);
 let duration = $state(15);
 let isPublished = $state(true);

 let questions = $state([
  { qtype: 'multiple_choice', text: '', options: ['', '', '', ''], correct: 0, explanation: '', hint: '' }
 ]);

 let saving = $state(false);
 let msg = $state('');
 let msgOk = $state(false);

 // OCR state
 let ocrFile = $state(null);
 let ocrLoading = $state(false);
 let ocrText = $state('');
 let showOcrPanel = $state(false);

 const LETTERS = ['A', 'B', 'C', 'D'];

 function tokenHeaders() {
  const t = typeof localStorage !== 'undefined' ? localStorage.getItem('tienganh_token') : null;
  const h = { 'Content-Type': 'application/json' };
  if (t) h['Authorization'] = `Bearer ${t}`;
  return h;
 }

 function addMCQ() {
  questions = [...questions, { qtype: 'multiple_choice', text: '', options: ['', '', '', ''], correct: 0, explanation: '', hint: '' }];
 }
 function addEssay() {
  questions = [...questions, { qtype: 'essay', text: '', options: [], correct: 0, explanation: '', hint: '' }];
 }
 function removeQuestion(i) {
  if (questions.length <= 1) { showMsg(false, 'Quiz cần ít nhất 1 câu hỏi.'); return; }
  questions = questions.filter((_, k) => k !== i);
 }
 function moveQuestion(i, dir) {
  const j = i + dir;
  if (j < 0 || j >= questions.length) return;
  const arr = [...questions];
  [arr[i], arr[j]] = [arr[j], arr[i]];
  questions = arr;
 }

 function showMsg(ok, text) {
  msgOk = ok; msg = text;
  try { playAudioFeedback?.(ok ? 'success' : 'error'); } catch {}
  if (ok) setTimeout(() => { msg = ''; }, 6000);
 }

 // OCR: upload ảnh/PDF → /api/ocr → điền text vào form
 async function handleOcrUpload(event) {
  const file = event.target?.files?.[0];
  if (!file) return;
  ocrFile = file;
  ocrLoading = true;
  showMsg(false, '');
  try {
   const t = typeof localStorage !== 'undefined' ? localStorage.getItem('tienganh_token') : null;
   const formData = new FormData();
   formData.append('file', file);
   const headers = {};
   if (t) headers['Authorization'] = `Bearer ${t}`;
   const res = await fetch('/api/ocr', { method: 'POST', headers, body: formData });
   const data = await res.json().catch(() => ({}));
   if (data.text) {
    ocrText = data.text;
    showOcrPanel = true;
    showMsg(true, `✓ OCR xong (${data.method || 'vision'}): ${data.text.length} ký tự. Xem và chép vào câu hỏi bên dưới.`);
   } else {
    showMsg(false, '✗ ' + (data.error || data.suggestion || 'Không trích xuất được text.'));
   }
  } catch {
   showMsg(false, '✗ Lỗi kết nối khi OCR.');
  } finally {
   ocrLoading = false;
   if (event.target) event.target.value = '';
  }
 }

 function ocrToQuestion() {
  if (!ocrText.trim()) return;
  // Thêm text OCR vào câu hỏi trống đầu tiên, hoặc tạo câu hỏi mới
  const idx = questions.findIndex(q => !q.text.trim());
  if (idx >= 0) {
   questions[idx].text = ocrText.slice(0, 2000);
   questions = [...questions];
  } else {
   questions = [...questions, { qtype: 'essay', text: ocrText.slice(0, 2000), options: [], correct: 0, explanation: '', hint: '' }];
  }
  showMsg(true, '✓ Đã đưa text OCR vào form câu hỏi.');
 }

 function validate() {
  if (!title.trim()) return 'Vui lòng nhập tiêu đề quiz.';
  if (!(grade >= 0 && grade <= 12)) return 'Khối lớp phải từ 0 đến 12.';
  if (!(duration >= 5 && duration <= 180)) return 'Thời lượng phải từ 5 đến 180 phút.';
  if (questions.length === 0) return 'Quiz cần ít nhất 1 câu hỏi.';
  for (let i = 0; i < questions.length; i++) {
   const q = questions[i];
   if (!q.text.trim()) return `Câu ${i + 1}: chưa nhập nội dung câu hỏi.`;
   if (q.qtype === 'multiple_choice') {
    if (q.options.some(o => !String(o).trim())) return `Câu ${i + 1}: cần đủ 4 đáp án.`;
   }
  }
  return '';
 }

 async function submit() {
  const err = validate();
  if (err) { showMsg(false, err); return; }
  saving = true; msg = '';
  try {
   const payload = {
    title: title.trim(),
    description: description.trim(),
    grade: Number(grade),
    duration_minutes: Number(duration),
    is_published: isPublished,
    questions: questions.map(q => ({
     question_text: q.text.trim(),
     question_type: q.qtype,
     options: q.qtype === 'multiple_choice' ? q.options.map(o => String(o).trim()) : [],
     correct_option_index: q.qtype === 'multiple_choice' ? q.correct : undefined,
     explanation: q.qtype === 'multiple_choice' ? String(q.explanation || '').trim() : undefined,
     hint: q.qtype === 'essay' ? String(q.hint || '').trim() : undefined
    }))
   };
   const res = await fetch('/api/exams/create', {
    method: 'POST',
    headers: tokenHeaders(),
    body: JSON.stringify(payload)
   });
   const data = await res.json().catch(() => ({}));
   if (data.success) {
    showMsg(true, '✓ ' + (data.message || 'Đã tạo quiz thành công.'));
    title = ''; description = ''; grade = 7; duration = 15; isPublished = true;
    questions = [{ qtype: 'multiple_choice', text: '', options: ['', '', '', ''], correct: 0, explanation: '', hint: '' }];
   } else {
    showMsg(false, '✗ ' + (data.error || 'Không tạo được quiz.'));
   }
  } catch {
   showMsg(false, '✗ Lỗi kết nối máy chủ.');
  } finally {
   saving = false;
  }
 }
</script>

<div class="bg-white border border-slate-200 rounded-lg p-6 shadow-sm space-y-6 max-w-4xl mx-auto">
 <div class="border-b border-slate-100 pb-4">
  <h2 class="text-lg font-heading font-semibold text-slate-900">📝 Tạo Quiz Mới</h2>
  <p class="text-xs text-slate-600 mt-1 font-normal">Nhập thông tin quiz, thêm câu hỏi trắc nghiệm hoặc tự luận, rồi lưu vào ngân hàng đề.</p>
 </div>

 <!-- Thông tin quiz -->
 <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
  <div class="md:col-span-2">
   <label class="block text-xs font-bold text-slate-700 mb-1">Tiêu đề quiz <span class="text-rose-600">*</span></label>
   <input bind:value={title} placeholder="VD: Kiểm tra 15 phút — Thì hiện tại đơn" class="w-full text-sm bg-slate-50 border border-slate-200 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-rose-200" />
  </div>
  <div class="md:col-span-2">
   <label class="block text-xs font-bold text-slate-700 mb-1">Mô tả</label>
   <textarea bind:value={description} rows="2" placeholder="Mô tả ngắn về nội dung quiz..." class="w-full text-sm bg-slate-50 border border-slate-200 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-rose-200"></textarea>
  </div>
  <div>
   <label class="block text-xs font-bold text-slate-700 mb-1">Khối lớp</label>
   <select bind:value={grade} class="w-full text-sm bg-slate-50 border border-slate-200 rounded-md px-3 py-2 font-semibold">
    {#each Array.from({length: 13}, (_, i) => i) as g}
     <option value={g}>{g === 0 ? 'Chung (không theo lớp)' : `Lớp ${g}`}</option>
    {/each}
   </select>
  </div>
  <div>
   <label class="block text-xs font-bold text-slate-700 mb-1">Thời lượng (phút)</label>
   <input type="number" min="5" max="180" bind:value={duration} class="w-full text-sm bg-slate-50 border border-slate-200 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-rose-200" />
  </div>
  <div class="md:col-span-2 flex items-center gap-2">
   <input type="checkbox" id="qmf-pub" bind:checked={isPublished} class="w-4 h-4 accent-emerald-600" />
   <label for="qmf-pub" class="text-xs font-bold text-slate-700">Xuất bản ngay (học sinh thấy trong danh sách đề thi)</label>
  </div>
 </div>

 <!-- Danh sách câu hỏi -->
 <div class="space-y-4">
  <div class="flex items-center justify-between flex-wrap gap-2">
   <h3 class="text-sm font-bold text-slate-900">Câu hỏi ({questions.length})</h3>
   <div class="flex gap-2 flex-wrap">
    <label class="px-3 py-1.5 rounded-md text-xs font-bold bg-sky-50 text-sky-700 border border-sky-200 hover:bg-sky-100 cursor-pointer">
     {ocrLoading ? '⏳ Đang OCR...' : '📷 OCR từ ảnh/PDF'}
     <input type="file" accept="image/jpeg,image/png,image/webp,application/pdf" onchange={handleOcrUpload} class="hidden" disabled={ocrLoading} />
    </label>
    <button onclick={addMCQ} class="px-3 py-1.5 rounded-md text-xs font-bold bg-emerald-50 text-emerald-700 border border-emerald-200 hover:bg-emerald-100">＋ Trắc nghiệm</button>
    <button onclick={addEssay} class="px-3 py-1.5 rounded-md text-xs font-bold bg-amber-50 text-amber-700 border border-amber-200 hover:bg-amber-100">＋ Tự luận</button>
   </div>
  </div>

  {#if showOcrPanel && ocrText}
   <div class="p-4 rounded-lg bg-sky-50 border border-sky-200 space-y-2">
    <div class="flex items-center justify-between">
     <span class="text-xs font-bold text-sky-800">📷 Kết quả OCR ({ocrText.length} ký tự){ocrFile ? ` — ${ocrFile.name}` : ''}</span>
     <div class="flex gap-2">
      <button onclick={ocrToQuestion} class="px-3 py-1 rounded-md text-xs font-bold bg-sky-600 text-white hover:bg-sky-700">Đưa vào câu hỏi</button>
      <button onclick={() => { showOcrPanel = false; }} class="px-3 py-1 rounded-md text-xs font-bold bg-white text-slate-600 border border-slate-200 hover:bg-slate-100">Đóng</button>
     </div>
    </div>
    <pre class="text-xs text-slate-700 whitespace-pre-wrap max-h-48 overflow-y-auto bg-white rounded-md p-3 border border-sky-100">{ocrText}</pre>
   </div>
  {/if}

  {#each questions as q, i}
   <div class="p-4 rounded-lg bg-slate-50 border border-slate-200 space-y-3">
    <div class="flex items-center justify-between">
     <div class="flex items-center gap-2">
      <span class="text-xs font-bold px-2 py-0.5 rounded-full {q.qtype === 'multiple_choice' ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'}">
       {q.qtype === 'multiple_choice' ? 'Trắc nghiệm' : 'Tự luận'} • Câu {i + 1}
      </span>
     </div>
     <div class="flex items-center gap-1">
      <button onclick={() => moveQuestion(i, -1)} disabled={i === 0} class="px-2 py-1 text-xs font-bold text-slate-500 hover:text-slate-800 disabled:opacity-30" title="Lên trên">▲</button>
      <button onclick={() => moveQuestion(i, 1)} disabled={i === questions.length - 1} class="px-2 py-1 text-xs font-bold text-slate-500 hover:text-slate-800 disabled:opacity-30" title="Xuống dưới">▼</button>
      <button onclick={() => removeQuestion(i)} class="px-2 py-1 text-xs font-bold text-rose-600 hover:text-rose-800" title="Xóa câu này">🗑</button>
     </div>
    </div>

    <div>
     <label class="block text-[11px] font-bold text-slate-600 mb-1">Nội dung câu hỏi <span class="text-rose-600">*</span></label>
     <textarea bind:value={q.text} rows="2" placeholder="Nhập câu hỏi..." class="w-full text-sm bg-white border border-slate-200 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-rose-200"></textarea>
    </div>

    {#if q.qtype === 'multiple_choice'}
     <div class="grid grid-cols-1 sm:grid-cols-2 gap-2">
      {#each q.options as opt, oi}
       <div class="flex items-center gap-2 bg-white border border-slate-200 rounded-md px-2 py-1.5">
        <input
         type="radio"
         name="qmf-correct-{i}"
         checked={q.correct === oi}
         onclick={() => { q.correct = oi; }}
         class="w-4 h-4 accent-emerald-600"
         title="Đáp án đúng"
        />
        <span class="text-xs font-bold text-slate-500 w-4">{LETTERS[oi]}.</span>
        <input bind:value={q.options[oi]} placeholder="Đáp án {LETTERS[oi]}" class="flex-1 text-sm focus:outline-none bg-transparent" />
       </div>
      {/each}
     </div>
     <p class="text-[11px] text-slate-500">Tick vào radio để chọn đáp án đúng.</p>
     <div>
      <label class="block text-[11px] font-bold text-slate-600 mb-1">Giải thích (không bắt buộc)</label>
      <input bind:value={q.explanation} placeholder="Giải thích đáp án..." class="w-full text-sm bg-white border border-slate-200 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-rose-200" />
     </div>
    {:else}
     <div>
      <label class="block text-[11px] font-bold text-slate-600 mb-1">Gợi ý đáp án (không bắt buộc)</label>
      <textarea bind:value={q.hint} rows="2" placeholder="Gợi ý / đáp án mẫu cho giáo viên chấm..." class="w-full text-sm bg-white border border-slate-200 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-rose-200"></textarea>
     </div>
    {/if}
   </div>
  {/each}
 </div>

 {#if msg}
  <div class="p-3 rounded-md text-xs font-bold text-center {msgOk ? 'bg-emerald-50 text-emerald-800 border border-emerald-200' : 'bg-rose-50 text-rose-800 border border-rose-200'}">
   {msg}
  </div>
 {/if}

 <div class="flex justify-end gap-3 pt-2">
  <button
   onclick={submit}
   disabled={saving}
   class="px-6 py-2.5 rounded-md bg-rose-600 hover:bg-rose-700 text-white font-bold text-sm shadow-sm disabled:opacity-50"
  >
   {saving ? '⏳ Đang lưu...' : '💾 Lưu Quiz'}
  </button>
 </div>
</div>
