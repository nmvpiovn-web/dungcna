<script>
 import { playAudioFeedback } from '$lib/speech.js';

 let { data } = $props();

 let searchQuery = $state(data.initialSearch || '');
 let selectedGrade = $state(data.initialGrade || 'all');
 let selectedCategory = $state(data.initialCategory || 'all');
 let expandedTopicId = $state(data.topics[0]?.id || null);

 // Quiz state: { [questionId]: { selected: string, isCorrect: boolean, showExplanation: boolean } }
 let quizAnswers = $state({});

 let filteredTopics = $derived.by(() => {
 return data.topics.filter(t => {
 // Grade filter
 let matchGrade = true;
 if (selectedGrade === 'primary') {
 matchGrade = t.grade_level.includes('Lớp 3') || t.grade_level.includes('Lớp 4') || t.grade_level.includes('Lớp 5');
 } else if (selectedGrade === 'secondary') {
 matchGrade = t.grade_level.includes('Lớp 6') || t.grade_level.includes('Lớp 7') || t.grade_level.includes('Lớp 8') || t.grade_level.includes('Lớp 9');
 } else if (selectedGrade === 'highschool') {
 matchGrade = t.grade_level.includes('Lớp 10') || t.grade_level.includes('Lớp 11') || t.grade_level.includes('Lớp 12');
 }

 // Category filter
 let matchCat = selectedCategory === 'all' || t.category === selectedCategory;

 // Search filter
 const q = searchQuery.toLowerCase().trim();
 let matchSearch = !q || 
 t.topic.toLowerCase().includes(q) || 
 (t.summary && t.summary.toLowerCase().includes(q)) ||
 (t.phonics_rules && t.phonics_rules.toLowerCase().includes(q));

 return matchGrade && matchCat && matchSearch;
 });
 });

 function toggleTopic(id) {
 expandedTopicId = expandedTopicId === id ? null : id;
 }

 function handleSelectOption(qId, selectedOption, correctAnswer) {
 const isCorrect = selectedOption.startsWith(correctAnswer);
 quizAnswers[qId] = {
 selected: selectedOption,
 isCorrect,
 showExplanation: true
 };
 if (isCorrect) {
 playAudioFeedback('correct');
 } else {
 playAudioFeedback('incorrect');
 }
 }
</script>

<div class="grammar-page max-w-6xl mx-auto px-4 py-8 space-y-8">
 <!-- Header Banner -->
 <div class="header-card bg-gradient-to-r from-teal-700 via-emerald-600 to-indigo-700 text-white rounded-3xl p-6 sm:p-8 shadow-xl relative overflow-hidden">
 <div class="relative z-10 max-w-3xl space-y-3">
 <div class="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/20 backdrop-blur-md text-xs font-bold tracking-wide uppercase">
 <span>📖</span> Cẩm Nang Ngữ Pháp Toàn Diện &amp; Phonics 2026
 </div>
 <h1 class="text-2xl sm:text-4xl font-extrabold tracking-tight leading-tight">
 Ngân Hàng Chuyên Đề Ngữ Pháp &amp; Công Thức Toàn Cấp
 </h1>
 <p class="text-emerald-100 text-sm sm:text-base leading-relaxed">
 Hệ thống hóa toàn bộ 14 chuyên đề ngữ pháp từ Tiểu học đến THPTQG &amp; HSG: Công thức toán học hóa, cạm bẫy thi cử, quy tắc ngữ âm đuôi và bài tập trắc nghiệm giải thích chi tiết.
 </p>
 </div>
 <div class="absolute -right-10 -bottom-10 text-9xl opacity-10 select-none pointer-events-none">
 📐
 </div>
 </div>

 <!-- Search & Filter Controls -->
 <div class="controls-card bg-white border border-slate-200 rounded-2xl p-5 shadow-sm space-y-4">
 <div class="relative">
 <span class="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400">🔍</span>
 <input
 type="text"
 placeholder="Tìm kiếm chuyên đề ngữ pháp, thì, công thức, dấu hiệu nhận biết..."
 bind:value={searchQuery}
 class="w-full pl-11 pr-10 py-3 rounded-xl bg-slate-50 border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 transition-all"
 />
 {#if searchQuery}
 <button
 onclick={() => searchQuery = ''}
 class="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 w-6 h-6 flex items-center justify-center rounded-full hover:bg-slate-200"
 >
 ✕
 </button>
 {/if}
 </div>

 <!-- Filters Row -->
 <div class="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-slate-100">
 <!-- Grade Filter -->
 <div class="flex items-center gap-1.5 flex-wrap">
 <span class="text-xs font-bold text-slate-500 uppercase mr-1">Cấp học:</span>
 <button
 class="px-3 py-1.5 rounded-lg text-xs font-semibold transition-all {selectedGrade === 'all' ? 'bg-emerald-600 text-white shadow-sm' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}"
 onclick={() => selectedGrade = 'all'}
 >
 Tất cả ({data.topics.length})
 </button>
 <button
 class="px-3 py-1.5 rounded-lg text-xs font-semibold transition-all {selectedGrade === 'primary' ? 'bg-emerald-600 text-white shadow-sm' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}"
 onclick={() => selectedGrade = 'primary'}
 >
 🎒 Tiểu Học (Lớp 3-5)
 </button>
 <button
 class="px-3 py-1.5 rounded-lg text-xs font-semibold transition-all {selectedGrade === 'secondary' ? 'bg-emerald-600 text-white shadow-sm' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}"
 onclick={() => selectedGrade = 'secondary'}
 >
 🌱 THCS (Lớp 6-9)
 </button>
 <button
 class="px-3 py-1.5 rounded-lg text-xs font-semibold transition-all {selectedGrade === 'highschool' ? 'bg-emerald-600 text-white shadow-sm' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}"
 onclick={() => selectedGrade = 'highschool'}
 >
 🏢 THPT &amp; HSG (Lớp 10-12)
 </button>
 </div>

 <!-- Category Filter -->
 <div class="flex items-center gap-1.5 flex-wrap">
 <span class="text-xs font-bold text-slate-500 uppercase mr-1">Nhóm:</span>
 <button
 class="px-2.5 py-1 rounded-lg text-xs font-medium transition-all {selectedCategory === 'all' ? 'bg-slate-900 text-white' : 'text-slate-500 hover:bg-slate-100'}"
 onclick={() => selectedCategory = 'all'}
 >
 Tất cả
 </button>
 <button
 class="px-2.5 py-1 rounded-lg text-xs font-medium transition-all {selectedCategory === 'tenses' ? 'bg-slate-900 text-white' : 'text-slate-500 hover:bg-slate-100'}"
 onclick={() => selectedCategory = 'tenses'}
 >
 Thì (Tenses)
 </button>
 <button
 class="px-2.5 py-1 rounded-lg text-xs font-medium transition-all {selectedCategory === 'structures' ? 'bg-slate-900 text-white' : 'text-slate-500 hover:bg-slate-100'}"
 onclick={() => selectedCategory = 'structures'}
 >
 Cấu trúc
 </button>
 <button
 class="px-2.5 py-1 rounded-lg text-xs font-medium transition-all {selectedCategory === 'clauses' ? 'bg-slate-900 text-white' : 'text-slate-500 hover:bg-slate-100'}"
 onclick={() => selectedCategory = 'clauses'}
 >
 Mệnh đề
 </button>
 </div>
 </div>
 </div>

 <!-- Topics Accordion List -->
 <div class="topics-container space-y-4">
 {#if filteredTopics.length === 0}
 <div class="text-center py-16 bg-white border border-slate-200 rounded-2xl">
 <div class="text-5xl mb-3">🔍</div>
 <h3 class="text-base font-bold text-slate-800">Không tìm thấy chuyên đề phù hợp</h3>
 <p class="text-xs text-slate-500 mt-1">Vui lòng thử tìm với từ khóa khác hoặc bỏ bộ lọc cấp học.</p>
 </div>
 {:else}
 {#each filteredTopics as topic, idx}
 <div class="topic-card bg-white border border-slate-200 rounded-2xl shadow-sm transition-all overflow-hidden {expandedTopicId === topic.id ? 'ring-2 ring-emerald-500/50 shadow-md' : 'hover:border-slate-300'}">
 <!-- Card Header (Click to Toggle) -->
 <button
 type="button"
 class="w-full text-left p-5 flex items-center justify-between gap-4 cursor-pointer focus:outline-none"
 onclick={() => toggleTopic(topic.id)}
 >
 <div class="flex items-center gap-3.5">
 <div class="w-9 h-9 rounded-xl bg-emerald-50 text-emerald-700 flex items-center justify-center font-bold text-sm flex-shrink-0">
 {idx + 1}
 </div>
 <div>
 <div class="flex items-center gap-2 flex-wrap">
 <h3 class="font-bold text-base sm:text-lg text-slate-900">
 {topic.topic}
 </h3>
 <span class="px-2 py-0.5 rounded-full text-[10px] font-bold bg-indigo-50 text-indigo-700 border border-indigo-200">
 {topic.cefr_level || 'A2 - B1'}
 </span>
 </div>
 <div class="flex items-center gap-3 text-xs text-slate-500 mt-1 flex-wrap">
 <span>🎯 {topic.grade_level}</span>
 {#if topic.curriculum_unit}
 <span>• 📚 {topic.curriculum_unit}</span>
 {/if}
 </div>
 </div>
 </div>

 <div class="flex items-center gap-2 flex-shrink-0">
 <span class="text-xs text-emerald-600 font-bold hidden sm:inline">
 {expandedTopicId === topic.id ? 'Thu gọn' : 'Xem chi tiết'}
 </span>
 <div class="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center text-slate-500 transition-transform duration-200 {expandedTopicId === topic.id ? 'rotate-180 bg-emerald-100 text-emerald-700' : ''}">
 ▾
 </div>
 </div>
 </button>

 <!-- Expanded Content -->
 {#if expandedTopicId === topic.id}
 <div class="p-5 pt-0 border-t border-slate-100 space-y-6 animate-in fade-in duration-200">
 <!-- Summary -->
 <div class="p-4 rounded-xl bg-slate-50 border border-slate-200/80 text-sm leading-relaxed text-slate-700">
 <strong>💡 Bản chất ngữ pháp:</strong> {topic.summary}
 </div>

 <!-- Formulas Box -->
 {#if topic.formula}
 <div class="space-y-2">
 <h4 class="text-xs font-bold uppercase tracking-wider text-slate-500 flex items-center gap-1.5">
 <span>📐</span> Công Thức Toán Học Hóa
 </h4>
 <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
 {#if typeof topic.formula === 'object'}
 {#each Object.entries(topic.formula) as [fKey, fVal]}
 <div class="p-3.5 rounded-xl bg-emerald-50/70 border border-emerald-200/80">
 <div class="text-[11px] font-bold uppercase text-emerald-800 mb-1">
 {fKey.replace(/_/g, ' ')}
 </div>
 {#if typeof fVal === 'object' && fVal !== null}
 <div class="space-y-1 text-xs font-mono text-emerald-950">
 {#each Object.entries(fVal) as [subK, subV]}
 <div><span class="text-emerald-600 font-bold">{subK}:</span> {subV}</div>
 {/each}
 </div>
 {:else}
 <div class="font-mono text-xs font-bold text-emerald-950">
 {fVal}
 </div>
 {/if}
 </div>
 {/each}
 {/if}
 </div>
 </div>
 {/if}

 <!-- Usage Rules & Signal Words -->
 <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
 <!-- Usage Rules -->
 {#if topic.usage && topic.usage.length > 0}
 <div class="space-y-2">
 <h4 class="text-xs font-bold uppercase tracking-wider text-slate-500 flex items-center gap-1.5">
 <span>📌</span> Quy Tắc Ứng Dụng
 </h4>
 <ul class="space-y-2 text-xs text-slate-700">
 {#each topic.usage as rule}
 <li class="flex items-start gap-2 p-2.5 rounded-lg bg-slate-50">
 <span class="text-emerald-600 font-bold mt-0.5">•</span>
 <span>{rule}</span>
 </li>
 {/each}
 </ul>
 </div>
 {/if}

 <!-- Signal Words -->
 {#if topic.signal_words && topic.signal_words.length > 0}
 <div class="space-y-2">
 <h4 class="text-xs font-bold uppercase tracking-wider text-slate-500 flex items-center gap-1.5">
 <span>🏷️</span> Dấu Hiệu Nhận Biết
 </h4>
 <div class="flex flex-wrap gap-1.5 p-3 rounded-xl bg-slate-50">
 {#each topic.signal_words as sig}
 <span class="px-2.5 py-1 rounded-lg text-xs font-semibold bg-white border border-slate-200 text-slate-800 shadow-2xs">
 {sig}
 </span>
 {/each}
 </div>
 </div>
 {/if}
 </div>

 <!-- Phonics Rules & Pronunciation Connection -->
 {#if topic.phonics_rules}
 <div class="p-4 rounded-xl bg-amber-50 border border-amber-200 space-y-1">
 <div class="text-xs font-bold text-amber-800 uppercase flex items-center gap-1.5">
 <span>🗣️</span> Liên Kết Ngữ Âm &amp; Phát Âm (Phonics Connection)
 </div>
 <div class="text-xs leading-relaxed text-amber-950">
 {topic.phonics_rules}
 </div>
 </div>
 {/if}

 <!-- Common Mistakes Box -->
 {#if topic.common_mistakes}
 <div class="p-4 rounded-xl bg-rose-50 border border-rose-200 space-y-1">
 <div class="text-xs font-bold text-rose-800 uppercase flex items-center gap-1.5">
 <span>⚠️</span> Cạm Bẫy Thường Gặp &amp; Tuyệt Chiêu Tránh Sai
 </div>
 <div class="text-xs leading-relaxed text-rose-950 whitespace-pre-line">
 {topic.common_mistakes}
 </div>
 </div>
 {/if}

 <!-- Examples -->
 {#if topic.examples && topic.examples.length > 0}
 <div class="space-y-2">
 <h4 class="text-xs font-bold uppercase tracking-wider text-slate-500 flex items-center gap-1.5">
 <span>💬</span> Ví Dụ Song Ngữ Minh Họa
 </h4>
 <div class="space-y-2">
 {#each topic.examples as ex}
 <div class="p-3 rounded-xl bg-slate-50 border border-slate-200/60 flex items-center justify-between gap-3">
 <div class="space-y-0.5">
 <div class="text-xs font-semibold text-slate-900">"{ex.en}"</div>
 <div class="text-[11px] text-slate-500">↳ {ex.vi}</div>
 </div>
 </div>
 {/each}
 </div>
 </div>
 {/if}

 <!-- Practice Interactive Mini-Quiz -->
 {#if topic.practice_questions && topic.practice_questions.length > 0}
 <div class="p-5 rounded-2xl bg-indigo-50/60 border border-indigo-200 space-y-4">
 <div class="flex items-center justify-between">
 <h4 class="text-xs font-bold uppercase tracking-wider text-indigo-900 flex items-center gap-1.5">
 <span>✍️</span> Luyện Tập Phản Xạ Ngay Tại Lớp ({topic.practice_questions.length} câu)
 </h4>
 <span class="text-[10px] font-semibold text-indigo-600">Tự động chấm điểm</span>
 </div>

 <div class="space-y-4">
 {#each topic.practice_questions as q, qIdx}
 <div class="p-4 rounded-xl bg-white border border-slate-200 space-y-3">
 <div class="font-bold text-xs sm:text-sm text-slate-900 flex items-start gap-2">
 <span class="text-indigo-600 font-extrabold">Câu {qIdx + 1}:</span>
 <span>{q.prompt}</span>
 </div>

 <!-- Options Grid -->
 <div class="grid grid-cols-1 sm:grid-cols-2 gap-2">
 {#each q.options as opt}
 {@const isSelected = quizAnswers[q.id]?.selected === opt}
 {@const isCorrectOpt = opt.startsWith(q.correct)}
 {@const showStatus = quizAnswers[q.id]?.showExplanation}
 <button
 type="button"
 class="text-left p-2.5 rounded-lg text-xs font-medium border transition-all cursor-pointer {
 showStatus && isCorrectOpt 
 ? 'bg-emerald-100 border-emerald-400 text-emerald-900 font-bold'
 : showStatus && isSelected && !isCorrectOpt
 ? 'bg-rose-100 border-rose-400 text-rose-900 line-through'
 : isSelected
 ? 'bg-indigo-50 border-indigo-400 text-indigo-900'
 : 'bg-slate-50 border-slate-200 text-slate-700 hover:bg-slate-100'
 }"
 onclick={() => handleSelectOption(q.id, opt, q.correct)}
 >
 {opt}
 </button>
 {/each}
 </div>

 <!-- Explanation Callout -->
 {#if quizAnswers[q.id]?.showExplanation}
 <div class="p-3 rounded-lg text-xs leading-relaxed {quizAnswers[q.id]?.isCorrect ? 'bg-emerald-50 text-emerald-900 border border-emerald-200' : 'bg-rose-50 text-rose-900 border border-rose-200'}">
 <span class="font-bold">{quizAnswers[q.id]?.isCorrect ? '✓ Chính xác!' : '✗ Chưa chính xác!'}</span>
 <span class="ml-1">{q.explanation}</span>
 </div>
 {/if}
 </div>
 {/each}
 </div>
 </div>
 {/if}
 </div>
 {/if}
 </div>
 {/each}
 {/if}
 </div>
</div>
