<script>
 import { base } from '$app/paths';

 const tools = [
 {
 id: 'dictionary',
 title: 'Từ Điển Cambridge & Phonics IPA',
 description: 'Tra cứu phát âm chuẩn Anh - Mỹ, phiên âm quốc tế IPA, bảng nguyên âm, phụ âm và phân tích ngữ âm tự động.',
 icon: '📖',
 href: '/dictionary',
 tag: 'Phát Âm & IPA',
 tagColor: 'bg-cx-100 text-cx-800 border-cx-200',
 badge: 'Bản Ngữ Chuẩn'
 },
 {
 id: 'flashcards',
 title: 'Flashcard 3D & Ghi Nhớ Lặp Lại (SRS)',
 description: 'Hệ thống thẻ học thông minh lặp lại ngắt quãng (Spaced Repetition), hình ảnh trực quan cho từ vựng K12 và Cambridge.',
 icon: '🗂️',
 href: '/flashcards',
 tag: 'Ghi Nhớ Não Bộ',
 tagColor: 'bg-emerald-100 text-emerald-800 border-emerald-200',
 badge: 'Đa Giác Quan'
 },
 {
 id: 'games',
 title: 'Đấu Trường Trò Chơi Game Hub 2026',
 description: 'Cổng trò chơi tương tác giáo dục: Speed Match, Meteor Rush, Đố vui có thưởng tích Sao đổi trừ học phí hàng tháng.',
 icon: '🎮',
 href: '/games',
 tag: 'Học Qua Trò Chơi',
 tagColor: 'bg-purple-100 text-purple-800 border-purple-200',
 badge: 'Tích Sao Thưởng'
 },
 {
 id: 'grammar',
 title: 'Chuyên Đề Ngữ Pháp & Sơ Đồ Tư Duy Mindmap',
 description: '14 chuyên đề ngữ pháp toàn cấp K12, tổng hợp công thức, bảng thì, cạm bẫy trắc nghiệm và bài tập thực hành kèm đáp án.',
 icon: '📐',
 href: '/grammar',
 tag: 'Ngữ Pháp Cốt Lõi',
 tagColor: 'bg-teal-100 text-teal-800 border-teal-200',
 badge: 'K12 2026'
 },
 {
 id: 'pedagogy',
 title: 'Cẩm Nang Phương Pháp Bản Ngữ & K12 5512',
 description: 'Mô hình giảng dạy Co-Teaching phối hợp Giáo viên Bản ngữ và Giáo viên Chủ nhiệm, chuẩn hóa công văn 5512 Bộ GD&ĐT.',
 icon: '👨‍🏫',
 href: '/pedagogy',
 tag: 'Sư Phạm Chuẩn Bộ',
 tagColor: 'bg-amber-100 text-amber-800 border-amber-200',
 badge: 'Giáo Viên & Lãnh Đạo'
 },
 {
 id: 'exam',
 title: 'Phòng Luyện Đề & Bấm Giờ Tự Động',
 description: 'Kiểm tra nhanh 15 phút, đề 1 tiết 45 phút chuẩn ma trận và phòng thi mô phỏng IELTS 4 kỹ năng có ghi âm và chấm điểm.',
 icon: '⏱️',
 href: '/exam',
 tag: 'Luyện Đề',
 tagColor: 'bg-rose-100 text-rose-800 border-rose-200',
 badge: 'Chấm Tự Động'
 }
 ];
</script>

<svelte:head>
 <title>Bộ Công Cụ Học Tập &amp; Lộ Trình Đa Giác Quan - Tiếng Anh Cô Dung</title>
 <meta name="description" content="Trung tâm công cụ học tập tiếng Anh: Từ điển IPA Cambridge, Flashcards 3D, Game Hub phản xạ từ vựng, Sơ đồ ngữ pháp Mindmap và Phòng thi bấm giờ trực tuyến." />
 <link rel="canonical" href="https://timbk.io.vn/tools" />
</svelte:head>

<div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
 <!-- Hero Banner -->
 <div class="rounded-3xl bg-gradient-to-br from-cx-900 via-indigo-900 to-slate-950 text-white p-8 sm:p-12 shadow-2xl relative overflow-hidden">
 <div class="absolute -right-10 -bottom-10 opacity-10 text-9xl select-none pointer-events-none">🛠️</div>
 <div class="relative z-10 max-w-3xl space-y-4">
 <div class="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-black bg-cx-500/20 text-cx-200 border border-cx-400/30">
 <span>⚡ TRUNG TÂM TIỆN ÍCH HỌC TẬP THẾ HỆ MỚI</span>
 </div>
 <h1 class="text-3xl sm:text-5xl font-heading font-black tracking-tight leading-tight">
 Bộ Công Cụ Học Tập &amp; Lộ Trình Đa Giác Quan
 </h1>
 <p class="text-sm sm:text-base text-slate-200 leading-relaxed font-normal">
 Hệ sinh thái công cụ hỗ trợ học sinh từ Tiểu Học, THCS, THPT đến Luyện thi IELTS/TOEIC. Tích hợp âm thanh bản ngữ, thẻ nhớ phản xạ và phòng thi bấm giờ chuẩn quy cách 2026.
 </p>
 </div>
 </div>

 <!-- Grid of Tools -->
 <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
 {#each tools as tool}
 <div class="rounded-2xl bg-surface-0 border border-line p-6 flex flex-col justify-between shadow-sm hover:shadow-xl hover:border-brand-200 transition-all group">
 <div class="space-y-4">
 <div class="flex items-center justify-between">
 <span class="text-3xl p-3 rounded-2xl bg-surface-1 border border-line group-hover:scale-110 transition-transform">
 {tool.icon}
 </span>
 <span class="text-[11px] font-extrabold px-2.5 py-1 rounded-full border {tool.tagColor}">
 {tool.badge}
 </span>
 </div>

 <div>
 <div class="text-[11px] font-bold text-brand-600 uppercase tracking-wider mb-1">
 {tool.tag}
 </div>
 <h2 class="text-lg font-heading font-black text-ink-900 group-hover:text-brand-600 transition-colors">
 {tool.title}
 </h2>
 <p class="text-xs text-ink-500 mt-2 leading-relaxed font-normal">
 {tool.description}
 </p>
 </div>
 </div>

 <div class="mt-6 pt-4 border-t border-line flex items-center justify-between">
 <a
 href={tool.href}
 class="w-full py-2.5 px-4 rounded-xl bg-brand-600 hover:bg-brand-700 text-white font-bold text-xs shadow-sm transition-all flex items-center justify-center gap-2"
 >
 <span>Mở Công Cụ</span>
 <span>➔</span>
 </a>
 </div>
 </div>
 {/each}
 </div>

 <!-- Quick Access Navigation -->
 <div class="p-6 rounded-2xl bg-surface-1 border border-line flex flex-col sm:flex-row sm:items-center justify-between gap-4">
 <div class="space-y-1">
 <h3 class="font-heading font-bold text-base text-ink-900">
 Cần Hỗ Trợ Kỹ Thuật Hoặc Đề Xuất Công Cụ Mới?
 </h3>
 <p class="text-xs text-ink-500 font-normal">
 Hệ thống được phát triển chuyên biệt theo chương trình GDPT 2026. Mọi thắc mắc vui lòng liên hệ cô Dung.
 </p>
 </div>
 <div class="flex items-center gap-3">
 <a
 href="/courses"
 class="px-4 py-2.5 rounded-xl bg-surface-0 border border-line text-ink-900 font-bold text-xs hover:border-brand-200 transition-all"
 >
 📚 Xem Lộ Trình 19 Khóa Học
 </a>
 <a
 href="/exam"
 class="px-4 py-2.5 rounded-xl bg-brand-600 hover:bg-brand-700 text-white font-bold text-xs shadow-md transition-all"
 >
 ⏱️ Vào Phòng Thi
 </a>
 </div>
 </div>
</div>
