<!-- src/lib/components/ui/PlacementTest.svelte — Phase 3 (2026-09-30)
 Test xep lop 3 phut: 10 cau tu /api/exams/guest (khong can login),
 ket qua CEFR + thanh tien do 4 ky nang + goi y lo trinh + CTA Zalo.
 Logic cham thi giu nguyen server-side (khong cham o client). -->
<script>
 import { onMount } from 'svelte';
 import UiButton from './UiButton.svelte';
 import { SITE_CONTACT } from '$lib/site.js';
 import { speakWord } from '$lib/speech.js';

 const GRADES = [
 {
 key: 'lop_1',
 label: 'Lớp 1',
 curricula: [{ key: 'primary_english', label: 'Tiếng Anh Tiểu học' }]
 },
 {
 key: 'lop_2',
 label: 'Lớp 2',
 curricula: [{ key: 'primary_english', label: 'Tiếng Anh Tiểu học' }]
 },
 {
 key: 'lop_3',
 label: 'Lớp 3',
 curricula: [{ key: 'primary_english', label: 'Tiếng Anh Tiểu học' }]
 },
 {
 key: 'lop_4',
 label: 'Lớp 4',
 curricula: [{ key: 'primary_english', label: 'Tiếng Anh Tiểu học' }]
 },
 {
 key: 'lop_5',
 label: 'Lớp 5',
 curricula: [{ key: 'primary_english', label: 'Tiếng Anh Tiểu học' }]
 },
 {
 key: 'lop_6',
 label: 'Lớp 6',
 curricula: [{ key: 'global_success', label: 'Global Success' }]
 },
 {
 key: 'lop_7',
 label: 'Lớp 7 (THCS)',
 curricula: [
 { key: 'global_success', label: 'Global Success' },
 { key: 'friends_plus', label: 'Friends Plus' },
 { key: 'smart_world', label: 'i-Learn Smart World' }
 ]
 },
 {
 key: 'lop_8',
 label: 'Lớp 8',
 curricula: [{ key: 'global_success', label: 'Global Success' }]
 },
 {
 key: 'lop_9',
 label: 'Lớp 9',
 curricula: [{ key: 'global_success', label: 'Ôn thi vào 10' }]
 },
 {
 key: 'lop_10',
 label: 'Lớp 10',
 curricula: [{ key: 'thpt_foundation', label: 'Nền tảng THPT' }]
 },
 {
 key: 'lop_11',
 label: 'Lớp 11',
 curricula: [{ key: 'thpt_foundation', label: 'Nền tảng THPT' }]
 },
 {
 key: 'lop_12',
 label: 'Lớp 12 (THPT)',
 curricula: [{ key: 'thpt_qg', label: 'Ôn thi THPT Quốc Gia' }]
 }
 ];

 const SKILL_LABELS = { grammar: 'Ngữ pháp', vocabulary: 'Từ vựng', listening: 'Nghe', reading_cloze: 'Đọc hiểu' };
 const TEST_SECONDS = 180; // 3 phut

 let step = $state('pick'); // pick | doing | result
 let grade = $state('lop_7');
 let curriculum = $state('global_success');
 let loading = $state(false);
 let error = $state('');
 let session = $state(null);
 let answers = $state({});
 let currentIdx = $state(0);
 let remain = $state(TEST_SECONDS);
 let timer = $state(null);
 let result = $state(null);
 let abandonConfirming = $state(false);

 const curricula = $derived(GRADES.find((g) => g.key === grade)?.curricula || []);
 const questions = $derived(session?.questions || []);
 const currentQ = $derived(questions[currentIdx]);

 function selectGrade(g) {
 grade = g;
 curriculum = GRADES.find((x) => x.key === g)?.curricula[0]?.key || '';
 }

 async function start() {
 loading = true;
 error = '';
 try {
 const res = await fetch('/api/exams/guest', {
 method: 'POST',
 headers: { 'Content-Type': 'application/json' },
 body: JSON.stringify({ action: 'start', grade, curriculum, duration_type: '15m', guest_role: 'student', candidate_name: 'Khách xếp lớp' })
 });
 const data = await res.json();
 if (!res.ok || !data.success) throw new Error(data.error || 'Không khởi tạo được bài test.');
 session = data;
 answers = {};
 currentIdx = 0;
 remain = TEST_SECONDS;
 step = 'doing';
 abandonConfirming = false;
 if (typeof document !== 'undefined') document.body.style.overflow = 'hidden';
 clearInterval(timer);
 timer = setInterval(() => {
 remain -= 1;
 if (remain <= 0) submit();
 }, 1000);
 } catch (e) {
 error = e.message;
 } finally {
 loading = false;
 }
 }

 // Bỏ test giữa chừng: xác nhận 2 bước trên nút rồi về màn hình chọn
 function abandonPlacement() {
 if (!abandonConfirming) {
 abandonConfirming = true;
 setTimeout(() => { abandonConfirming = false; }, 4000);
 return;
 }
 abandonConfirming = false;
 clearInterval(timer);
 step = 'pick';
 result = null;
 session = null;
 answers = {};
 if (typeof document !== 'undefined') document.body.style.overflow = '';
 }

 function answerCurrent(val) {
 if (!currentQ) return;
 answers = { ...answers, [currentQ.id]: val };
 }

 function next() {
 if (currentIdx < questions.length - 1) currentIdx += 1;
 }
 function prev() {
 if (currentIdx > 0) currentIdx -= 1;
 }

 async function submit() {
 clearInterval(timer);
 if (step !== 'doing') return;
 loading = true;
 error = '';
 try {
 const payloadAnswers = Object.fromEntries(questions.map((q) => [q.id, answers[q.id] ?? '']));
 const res = await fetch('/api/exams/guest', {
 method: 'POST',
 headers: { 'Content-Type': 'application/json' },
 body: JSON.stringify({ action: 'submit', guest_session_id: session.guest_session_id, guest_token: session.guest_token, answers: payloadAnswers })
 });
 const data = await res.json();
 if (!res.ok || !data.success) throw new Error(data.error || 'Chấm bài thất bại.');
 result = data.result;
 step = 'result';
 } catch (e) {
 error = e.message;
 step = 'doing';
 } finally {
 loading = false;
 }
 }

 onMount(() => () => clearInterval(timer));

 // Gop diem theo ky nang tu item_feedback
 const skillBars = $derived.by(() => {
 if (!result?.item_feedback) return [];
 const agg = {};
 for (const it of result.item_feedback) {
 const k = it.skill || 'grammar';
 agg[k] = agg[k] || { total: 0, correct: 0 };
 agg[k].total += 1;
 if (it.is_correct) agg[k].correct += 1;
 }
 return Object.entries(agg).map(([k, v]) => ({
 key: k,
 label: SKILL_LABELS[k] || k,
 pct: Math.round((v.correct / v.total) * 100)
 }));
 });

 const roadmapHint = $derived.by(() => {
 const lvl = result?.cefr_level || 'A1';
 const map = {
 A1: { text: 'Lộ trình 6 tháng: Nền tảng A1 → A2 (Lớp 7 Chuyên sâu)', href: '/courses' },
 A2: { text: 'Lộ trình 6 tháng: A2 → B1, sẵn sàng vào 10', href: '/courses' },
 B1: { text: 'Lộ trình: B1 → B2 (Lớp 9 vào 10 / IELTS Foundation)', href: '/courses' },
 B2: { text: 'Lộ trình: B2 → C1 (IELTS 6.0+ / HSG)', href: '/courses' },
 C1: { text: 'Lộ trình: C1 — luyện đề chuyên sâu & IELTS 7.0+', href: '/courses' }
 };
 return map[lvl] || map.A1;
 });

 const mm = $derived(String(Math.floor(remain / 60)).padStart(2, '0'));
 const ss = $derived(String(remain % 60).padStart(2, '0'));
 const answeredCount = $derived(Object.keys(answers).filter((k) => answers[k] !== '' && answers[k] != null).length);
</script>

 {#if step === 'pick'}
 <div class="rounded-3xl bg-surface-0 border border-line shadow-sm p-5 sm:p-7">
 <div class="text-center max-w-lg mx-auto">
 <div class="text-4xl mb-2">📝</div>
 <h3 class="font-heading text-xl sm:text-2xl font-extrabold text-ink-900">Test Xếp Lớp 3 Phút</h3>
 <p class="text-sm text-ink-500 mt-1 mb-5">10 câu trắc nghiệm nhanh — biết ngay trình độ CEFR, không cần đăng nhập.</p>
 <div class="flex flex-col gap-3 text-left">
 <label class="text-xs font-extrabold uppercase tracking-widest text-ink-500">1. Chọn khối lớp</label>
 <div class="grid grid-cols-4 sm:grid-cols-6 gap-2">
 {#each GRADES as g}
 <button type="button" onclick={() => selectGrade(g.key)} class={`px-3 py-2.5 rounded-xl text-sm font-bold border transition-all ${grade === g.key ? 'bg-brand-600 border-brand-600 text-white' : 'bg-surface-1 border-line text-ink-900 hover:border-brand-200'}`}>{g.label}</button>
 {/each}
 </div>
 <label class="text-xs font-extrabold uppercase tracking-widest text-ink-500">2. Chọn chương trình</label>
 <div class="flex flex-wrap gap-2">
 {#each curricula as c}
 <button type="button" onclick={() => (curriculum = c.key)} class={`px-3 py-2 rounded-xl text-sm font-bold border transition-all ${curriculum === c.key ? 'bg-brand-600 border-brand-600 text-white' : 'bg-surface-1 border-line text-ink-900 hover:border-brand-200'}`}>{c.label}</button>
 {/each}
 </div>
 </div>
 {#if error}<div class="mt-4 text-sm font-bold text-danger-600">{error}</div>{/if}
 <div class="mt-6">
 <UiButton size="lg" variant="accent" onclick={start} disabled={loading}>{loading ? 'Đang chuẩn bị đề...' : '🚀 Bắt đầu làm bài'}</UiButton>
 </div>
 </div>
 </div><!-- /pick card -->
 {:else}
 <!-- Popup cô lập khi đang làm bài / xem kết quả (đồng bộ với phòng thi) -->
 <div class="placement-popup-overlay" role="dialog" aria-modal="true" aria-label="Test xếp lớp">
 <div class="placement-popup-inner">
 {#if step === 'doing' && currentQ}
 <div class="max-w-2xl mx-auto">
 <div class="flex items-center justify-between mb-4 gap-2">
 <div class="text-sm font-extrabold text-ink-900">Câu {currentIdx + 1}/{questions.length}</div>
 <div class="flex items-center gap-2">
 <div class={`px-3 py-1 rounded-full text-sm font-extrabold tabular-nums ${remain <= 30 ? 'bg-danger-600/10 text-danger-600' : 'bg-brand-50 text-brand-700 border border-brand-200'}`}>⏱️ {mm}:{ss}</div>
 <button type="button" onclick={abandonPlacement} class={`px-3 py-1 rounded-full text-xs font-bold border transition-all ${abandonConfirming ? 'bg-danger-600 border-danger-600 text-white' : 'bg-surface-1 border-line text-ink-500 hover:border-danger-600 hover:text-danger-600'}`}>{abandonConfirming ? '⚠️ Chắc chắn bỏ?' : '✕ Bỏ test'}</button>
 </div>
 </div>
 <div class="h-2 rounded-full bg-surface-1 border border-line overflow-hidden mb-5">
 <div class="h-full bg-brand-600 transition-all" style={`width: ${((currentIdx + 1) / questions.length) * 100}%`}></div>
 </div>

 {#if currentQ.passage}
 <div class="mb-4 p-4 rounded-2xl bg-surface-1 border border-line text-sm text-ink-900 leading-relaxed">{currentQ.passage}</div>
 {/if}
 <div class="font-bold text-ink-900 text-base sm:text-lg mb-4">{currentQ.question_text}</div>

 {#if currentQ.type === 'listening' && currentQ.audio_term}
 <button type="button" onclick={() => speakWord(currentQ.audio_term, 0.8)} class="mb-4 inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-brand-50 border border-brand-200 text-brand-700 text-sm font-bold hover:bg-brand-600 hover:text-white transition-colors">
 🔊 Nghe phát âm
 </button>
 {/if}

 {#if currentQ.options}
 <div class="space-y-2">
 {#each currentQ.options as opt}
 <button
 type="button"
 onclick={() => answerCurrent(opt.id)}
 class={`w-full text-left px-4 py-3 rounded-2xl border-2 text-sm font-semibold transition-all ${answers[currentQ.id] === opt.id ? 'border-brand-600 bg-brand-50 text-ink-900' : 'border-line bg-surface-0 text-ink-900 hover:border-brand-200'}`}
 >
 <span class="inline-flex w-7 h-7 mr-2 rounded-full items-center justify-center text-xs font-extrabold {answers[currentQ.id] === opt.id ? 'bg-brand-600 text-white' : 'bg-surface-1 text-ink-500 border border-line'}">{opt.id}</span>
 {opt.text}
 </button>
 {/each}
 </div>
 {:else}
 <input
 type="text"
 value={answers[currentQ.id] || ''}
 oninput={(e) => answerCurrent(e.currentTarget.value)}
 placeholder="Nhập đáp án của bạn..."
 class="w-full px-4 py-3 rounded-2xl border-2 border-line bg-surface-0 text-ink-900 text-sm font-semibold focus:border-brand-600 focus:outline-none"
 />
 {/if}

 <div class="flex items-center justify-between mt-6">
 <UiButton size="sm" variant="ghost" onclick={prev} disabled={currentIdx === 0}>← Câu trước</UiButton>
 <div class="text-xs text-ink-500 font-medium">Đã trả lời {answeredCount}/{questions.length}</div>
 {#if currentIdx < questions.length - 1}
 <UiButton size="sm" onclick={next}>Câu tiếp →</UiButton>
 {:else}
 <UiButton size="sm" variant="accent" onclick={submit} disabled={loading}>{loading ? 'Đang chấm...' : '✅ Nộp bài'}</UiButton>
 {/if}
 </div>
 {#if error}<div class="mt-3 text-sm font-bold text-danger-600 text-center">{error}</div>{/if}
 </div>
 {:else if step === 'result' && result}
 <div class="max-w-2xl mx-auto text-center">
 <div class="text-4xl mb-2">🎉</div>
 <h3 class="font-heading text-xl sm:text-2xl font-extrabold text-ink-900">Kết quả xếp lớp của bạn</h3>
 <div class="inline-flex items-center gap-2 mt-3 px-5 py-2.5 rounded-2xl bg-brand-600 text-white font-heading font-extrabold text-lg shadow-sm">
 Trình độ {result.cefr_level}
 </div>
 <div class="text-sm text-ink-500 mt-2">{result.rank_title} • {result.correct_count}/{result.total_questions} câu đúng ({result.score_10}/10)</div>

 <div class="mt-6 text-left space-y-2.5">
 <div class="text-xs font-extrabold uppercase tracking-widest text-ink-500">Điểm mạnh / yếu theo kỹ năng</div>
 {#each skillBars as s}
 <div>
 <div class="flex justify-between text-xs font-bold text-ink-900 mb-1"><span>{s.label}</span><span>{s.pct}%</span></div>
 <div class="h-2.5 rounded-full bg-surface-1 border border-line overflow-hidden">
 <div class={`h-full rounded-full ${s.pct >= 70 ? 'bg-success-600' : s.pct >= 40 ? 'bg-accent-500' : 'bg-danger-600'}`} style={`width: ${s.pct}%`}></div>
 </div>
 </div>
 {/each}
 </div>

 <div class="mt-5 p-4 rounded-2xl bg-brand-50 border border-brand-200 text-left">
 <div class="text-xs font-extrabold uppercase tracking-widest text-brand-700 mb-1">🗺️ Lộ trình gợi ý</div>
 <div class="text-sm font-bold text-ink-900">{roadmapHint.text}</div>
 <div class="text-xs text-ink-500 mt-1">{result.recommendation}</div>
 </div>

 <div class="flex flex-col sm:flex-row items-center justify-center gap-3 mt-6">
 <UiButton href={roadmapHint.href}>Xem lộ trình chi tiết →</UiButton>
 <a href={SITE_CONTACT.zaloUrl} target="_blank" rel="noopener noreferrer" class="inline-flex items-center gap-1.5 px-5 py-2.5 rounded-xl font-bold text-sm text-white bg-brand-600 hover:bg-brand-700 transition-all">💬 Nhận tư vấn Zalo</a>
 </div>
 <button type="button" onclick={() => { step = 'pick'; result = null; session = null; abandonConfirming = false; if (typeof document !== 'undefined') document.body.style.overflow = ''; }} class="mt-4 px-5 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-white text-sm font-bold transition-all">✓ Đóng</button>
 <button type="button" onclick={() => { step = 'pick'; result = null; session = null; abandonConfirming = false; if (typeof document !== 'undefined') document.body.style.overflow = ''; }} class="mt-2 text-xs font-bold text-ink-500 hover:text-brand-600 underline">Làm lại bài test</button>
 </div>
 {/if}
 </div><!-- /placement-popup-inner -->
 </div><!-- /placement-popup-overlay -->
 {/if}

<style>
 .placement-popup-overlay {
 position: fixed;
 inset: 0;
 z-index: 100;
 overflow-y: auto;
 background: rgba(248, 250, 252, 0.97);
 backdrop-filter: blur(4px);
 animation: placementPopupIn 0.15s ease-out;
 padding-top: env(safe-area-inset-top, 0px);
 padding-bottom: env(safe-area-inset-bottom, 0px);
 }
 .placement-popup-inner {
 min-height: 100%;
 width: 100%;
 max-width: 768px;
 margin: 0 auto;
 padding: 12px;
 padding-top: calc(12px + env(safe-area-inset-top, 0px) + 8px);
 display: flex;
 flex-direction: column;
 justify-content: center;
 }
 @media (min-width: 640px) {
 .placement-popup-inner { padding: 24px; padding-top: calc(24px + env(safe-area-inset-top, 0px) + 8px); }
 }
 @keyframes placementPopupIn {
 from { opacity: 0; }
 to { opacity: 1; }
 }
</style>
