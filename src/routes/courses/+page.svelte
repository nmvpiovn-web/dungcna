<script>
  import { onMount } from 'svelte';

  const courses = [
    {
      id: 'g7-chuyen',
      title: 'Tiếng Anh Lớp 7 - Chuyên Sâu & Luyện Đề Bộ GD&ĐT 2025',
      grade: 'Lớp 7',
      level: 'A2 - B1',
      description: 'Chương trình phát triển toàn diện 4 kỹ năng, làm chủ 12 chuyên đề ngữ pháp trọng tâm và chuẩn bị cho các kỳ thi học sinh giỏi, khảo sát chất lượng.',
      sessionsPerWeek: 3,
      duration: '90 phút/buổi',
      tuition: '1.200.000đ/tháng',
      highlights: ['Chuẩn đề 40 câu 50 phút 2025', 'Ngân hàng đề thi D1 cá nhân hóa', 'Đánh giá phát âm bản ngữ AI', 'Theo dõi điểm tích lũy Sao']
    },
    {
      id: 'g8-nangcao',
      title: 'Tiếng Anh Lớp 8 - Nâng Cao & Tư Duy Ngôn Ngữ Phản Xạ',
      grade: 'Lớp 8',
      level: 'B1',
      description: 'Mở rộng vốn từ vựng học thuật Oxford 3000, kỹ năng đọc hiểu bài dài, phân tích cấu trúc phức và thuyết trình tiếng Anh tự tin.',
      sessionsPerWeek: 3,
      duration: '90 phút/buổi',
      tuition: '1.350.000đ/tháng',
      highlights: ['FTS5 Vocabulary Vault', 'Viết luận ngắn Academic', 'Rèn luyện phản xạ Speaking 1-1', 'Báo cáo học vụ tự động cho phụ huynh']
    },
    {
      id: 'g9-vaolop10',
      title: 'Tiếng Anh Lớp 9 - Ôn Thi Vào 10 Chuyên & Công Lập',
      grade: 'Lớp 9',
      level: 'B1 - B2',
      description: 'Luyện chiến thuật giải đề thi vào 10 chuyên và công lập top đầu Hà Nội, bao phủ 100% dạng bài ngữ âm, từ vựng, đọc hiểu và sửa lỗi sai.',
      sessionsPerWeek: 3,
      duration: '105 phút/buổi',
      tuition: '1.500.000đ/tháng',
      highlights: ['Bộ đề thi thử thực chiến', 'Chiến thuật bẫy trắc nghiệm', 'Chấm bài viết chi tiết theo rubric', 'Cam kết đầu ra chuẩn Bộ GD']
    },
    {
      id: 'ielts-foundation',
      title: 'IELTS Foundation (Band 4.5 - 6.0) Dành Cho Học Sinh THCS',
      grade: 'Lớp 7 - 9',
      level: 'B1+ to B2',
      description: 'Xây dựng nền tảng học thuật chuẩn quốc tế Cambridge, làm quen bài thi IELTS Academic cả 4 kỹ năng Nghe - Nói - Đọc - Viết.',
      sessionsPerWeek: 2,
      duration: '120 phút/buổi',
      tuition: '1.800.000đ/tháng',
      highlights: ['Giáo viên bản ngữ + GV chuyên ngữ', 'Mock Test IELTS định kỳ', 'Kế hoạch học tập cá nhân hóa', 'Hỗ trợ kho tài liệu Second Brain']
    }
  ];
</script>

<svelte:head>
  <title>Khóa Học Tiếng Anh - Tiếng Anh Cô Dung (timbk.io.vn)</title>
  <meta name="description" content="Chương trình đào tạo Tiếng Anh K12 chuẩn Bộ GD&ĐT 2025 và IELTS Foundation tại Tiếng Anh Cô Dung. Học vụ số minh bạch, cam kết tiến bộ." />
  <link rel="canonical" href="https://timbk.io.vn/courses" />
</svelte:head>

<div class="max-w-6xl mx-auto px-4 py-8">
  <!-- Header -->
  <header class="mb-10 text-center">
    <div class="inline-flex items-center gap-2 px-3 py-1 bg-sky-50 text-sky-700 border border-sky-200 rounded text-xs font-semibold uppercase tracking-wider mb-3">
      Hệ Thống Đào Tạo K12 Chuẩn Bộ GD&ĐT
    </div>
    <h1 class="text-3xl sm:text-4xl font-bold text-slate-800 tracking-tight mb-3">
      Chương Trình Khóa Học & Lộ Trình Phát Triển
    </h1>
    <p class="text-slate-600 max-w-2xl mx-auto text-base">
      Phương pháp giảng dạy hiện đại kết hợp hệ sinh thái học tập số: ngân hàng khảo thí D1, sổ học vụ điện tử và bảng sao tích lũy.
    </p>
  </header>

  <!-- Audio Drive Sync Status Banner (Transparent Provenance) -->
  <div class="mb-8 p-4 rounded-lg bg-sky-50 dark:bg-sky-950/40 border border-sky-200 dark:border-sky-800 text-sky-900 dark:text-sky-200 text-xs flex items-center justify-between gap-3 shadow-xs">
    <div class="flex items-center gap-2.5">
      <span class="text-lg">🎙️</span>
      <div>
        <div class="font-semibold text-sky-800 dark:text-sky-300">Kho Audio Bài Nghe Google Drive (2.254 tracks)</div>
        <div class="text-[11px] text-sky-700/80 dark:text-sky-400 mt-0.5">
          Hệ thống đang đồng bộ kho âm thanh gốc từ Google Drive về máy chủ. Các bài học hiện sử dụng bài đọc IPA và bản phiên âm chuẩn.
        </div>
      </div>
    </div>
    <span class="px-2 py-0.5 rounded bg-sky-200/80 dark:bg-sky-900/60 text-sky-800 dark:text-sky-300 font-semibold text-[10px] uppercase whitespace-nowrap">
      Đang Đồng Bộ
    </span>
  </div>

  <!-- Courses Grid -->
  <div class="grid grid-cols-1 md:grid-cols-2 gap-6 mb-12">
    {#each courses as course}
      <div class="bg-white border border-slate-200 rounded-lg p-6 shadow-sm hover:border-sky-400 hover:shadow-md transition-all flex flex-col justify-between">
        <div>
          <div class="flex items-center justify-between gap-2 mb-3">
            <span class="px-2.5 py-0.5 bg-slate-100 text-slate-700 border border-slate-200 rounded text-xs font-medium">
              {course.grade}
            </span>
            <span class="text-xs font-semibold text-sky-600 bg-sky-50 px-2 py-0.5 rounded border border-sky-100">
              Trình độ: {course.level}
            </span>
          </div>

          <h2 class="text-xl font-bold text-slate-800 mb-2 leading-snug">
            {course.title}
          </h2>

          <p class="text-slate-600 text-sm mb-4 leading-relaxed">
            {course.description}
          </p>

          <div class="grid grid-cols-2 gap-2 py-3 border-y border-slate-100 text-xs text-slate-600 mb-4 bg-slate-50/50 px-3 rounded">
            <div><strong>Lịch học:</strong> {course.sessionsPerWeek} buổi/tuần</div>
            <div><strong>Thời lượng:</strong> {course.duration}</div>
            <div class="col-span-2"><strong>Học phí chuẩn:</strong> <span class="text-sky-700 font-semibold">{course.tuition}</span> (chưa trừ sao thưởng)</div>
          </div>

          <div class="mb-4">
            <span class="text-xs font-semibold text-slate-500 uppercase tracking-wider block mb-2">Điểm nổi bật:</span>
            <ul class="space-y-1.5">
              {#each course.highlights as h}
                <li class="flex items-center text-xs text-slate-700 gap-2">
                  <span class="w-1.5 h-1.5 bg-sky-500 rounded-full flex-shrink-0"></span>
                  <span>{h}</span>
                </li>
              {/each}
            </ul>
          </div>
        </div>

        <div class="pt-4 border-t border-slate-100 flex items-center justify-between">
          <a href="/exam" class="text-xs font-medium text-slate-600 hover:text-sky-600 transition-colors">
            Làm bài thi thử 40 câu &rarr;
          </a>
          <a href="/pedagogy" class="px-3.5 py-1.5 bg-sky-600 hover:bg-sky-700 text-white text-xs font-semibold rounded transition-colors shadow-sm">
            Xem Phương Pháp
          </a>
        </div>
      </div>
    {/each}
  </div>

  <!-- Educational Commitments -->
  <section class="bg-slate-50 border border-slate-200 rounded-lg p-6 sm:p-8">
    <h3 class="text-lg font-bold text-slate-800 mb-4 text-center sm:text-left">
      Cam Kết Học Vụ & Minh Bạch Tài Chính
    </h3>
    <div class="grid grid-cols-1 sm:grid-cols-3 gap-4 text-sm text-slate-600">
      <div class="p-4 bg-white rounded border border-slate-200">
        <h4 class="font-semibold text-slate-800 mb-1">Khảo Thí 40 Câu 2025</h4>
        <p class="text-xs text-slate-500">Mọi đề thi đều có ma trận 14 Nhận biết, 14 Thông hiểu, 8 Vận dụng, 4 Vận dụng cao.</p>
      </div>
      <div class="p-4 bg-white rounded border border-slate-200">
        <h4 class="font-semibold text-slate-800 mb-1">Đổi Sao Trừ Học Phí</h4>
        <p class="text-xs text-slate-500">Mỗi 100 Sao tích lũy từ chuyên cần và điểm thi được khấu trừ trực tiếp 1.000đ trên phiếu học phí.</p>
      </div>
      <div class="p-4 bg-white rounded border border-slate-200">
        <h4 class="font-semibold text-slate-800 mb-1">Sổ Học Vụ Số Minh Bạch</h4>
        <p class="text-xs text-slate-500">Phụ huynh theo dõi trực tiếp nhận xét của giáo viên, lịch dạy thay và biên lai học phí theo thời gian thực.</p>
      </div>
    </div>
  </section>
</div>
