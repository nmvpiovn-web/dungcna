<script>
  import RoadmapCard from '$lib/components/ui/RoadmapCard.svelte';
  import SectionHeading from '$lib/components/ui/SectionHeading.svelte';
  import UiButton from '$lib/components/ui/UiButton.svelte';

  // Du lieu that tu trang courses cu (kiem chung 2026-09-30)
  const courses = [
    {
      id: 'g7-chuyen',
      title: 'Tiếng Anh Lớp 7 - Chuyên Sâu & Luyện Đề',
      gradeBand: 'Lớp 7',
      level: 'A2 - B1',
      description: 'Chương trình phát triển toàn diện 4 kỹ năng, làm chủ 12 chuyên đề ngữ pháp trọng tâm và chuẩn bị cho các kỳ thi học sinh giỏi, khảo sát chất lượng.',
      duration: '3 buổi/tuần • 90 phút/buổi',
      price: 1200000,
      features: ['Chuẩn đề 40 câu 50 phút 2025', 'Ngân hàng đề thi D1 cá nhân hóa', 'Đánh giá phát âm bản ngữ AI', 'Theo dõi điểm tích lũy Sao']
    },
    {
      id: 'g8-nangcao',
      title: 'Tiếng Anh Lớp 8 - Nâng Cao & Tư Duy Phản Xạ',
      gradeBand: 'Lớp 8',
      level: 'B1',
      description: 'Mở rộng vốn từ vựng học thuật Oxford 3000, kỹ năng đọc hiểu bài dài, phân tích cấu trúc phức và thuyết trình tiếng Anh tự tin.',
      duration: '3 buổi/tuần • 90 phút/buổi',
      price: 1350000,
      features: ['FTS5 Vocabulary Vault', 'Viết luận ngắn Academic', 'Rèn luyện phản xạ Speaking 1-1', 'Báo cáo học vụ tự động cho phụ huynh']
    },
    {
      id: 'g9-vaolop10',
      title: 'Tiếng Anh Lớp 9 - Ôn Thi Vào 10',
      gradeBand: 'Lớp 9',
      level: 'B1 - B2',
      description: 'Luyện chiến thuật giải đề thi vào 10 chuyên và công lập, bao phủ 100% dạng bài ngữ âm, từ vựng, đọc hiểu và sửa lỗi sai.',
      duration: '3 buổi/tuần • 105 phút/buổi',
      price: 1500000,
      features: ['Bộ đề thi thử thực chiến', 'Chiến thuật bẫy trắc nghiệm', 'Chấm bài viết chi tiết theo rubric', 'Cam kết đầu ra chuẩn Bộ GD']
    },
    {
      id: 'ielts-foundation',
      title: 'IELTS Foundation (Band 4.5 - 6.0)',
      gradeBand: 'Lớp 7 - 9',
      level: 'B1+ → B2',
      description: 'Xây dựng nền tảng học thuật chuẩn quốc tế Cambridge, làm quen bài thi IELTS Academic cả 4 kỹ năng Nghe - Nói - Đọc - Viết.',
      duration: '2 buổi/tuần • 120 phút/buổi',
      price: 1800000,
      features: ['Giáo viên bản ngữ + GV chuyên ngữ', 'Mock Test IELTS định kỳ', 'Kế hoạch học tập cá nhân hóa', 'Hỗ trợ kho tài liệu Second Brain']
    }
  ];
</script>

<div class="max-w-6xl mx-auto px-3 sm:px-4 py-6 sm:py-8 pb-24 lg:pb-10 space-y-8">
  <SectionHeading
    eyebrow="Hệ Thống Đào Tạo K12 Chuẩn Bộ GD&ĐT"
    title="Chương trình khóa học & lộ trình phát triển"
    sub="Phương pháp giảng dạy hiện đại kết hợp hệ sinh thái học tập số: ngân hàng đề thi, sổ học vụ điện tử và bảng sao tích lũy."
    center
  />

  <div class="grid grid-cols-1 md:grid-cols-2 gap-3 sm:gap-4">
    {#each courses as course}
      <RoadmapCard
        title={course.title}
        gradeBand={course.gradeBand}
        level={course.level}
        description={course.description}
        duration={course.duration}
        features={course.features}
        price={course.price}
        cta="Xem bảng giá"
        href="/bang-gia"
      />
    {/each}
  </div>

  <div class="flex flex-wrap items-center justify-center gap-3">
    <UiButton href="/exam">🎯 Làm bài thi thử 40 câu</UiButton>
    <UiButton href="/pedagogy" variant="ghost">Xem phương pháp giảng dạy →</UiButton>
  </div>

  <!-- Cam kết học vụ -->
  <section class="rounded-3xl bg-surface-0 border border-line p-6 sm:p-8 shadow-sm">
    <h3 class="font-heading text-lg font-extrabold text-ink-900 mb-4 text-center sm:text-left">
      Cam Kết Học Vụ & Minh Bạch Tài Chính
    </h3>
    <div class="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4">
      <div class="p-4 rounded-2xl bg-surface-1 border border-line">
        <h4 class="font-extrabold text-sm text-ink-900 mb-1">📝 Luyện đề 40 câu chuẩn 2025</h4>
        <p class="text-xs text-ink-500 leading-relaxed">Mọi đề thi đều có ma trận: 14 Nhận biết, 14 Thông hiểu, 8 Vận dụng, 4 Vận dụng cao.</p>
      </div>
      <div class="p-4 rounded-2xl bg-surface-1 border border-line">
        <h4 class="font-extrabold text-sm text-ink-900 mb-1">⭐ Đổi Sao trừ học phí</h4>
        <p class="text-xs text-ink-500 leading-relaxed">Mỗi 100 Sao tích lũy từ chuyên cần và điểm thi được khấu trừ trực tiếp 1.000đ trên phiếu học phí.</p>
      </div>
      <div class="p-4 rounded-2xl bg-surface-1 border border-line">
        <h4 class="font-extrabold text-sm text-ink-900 mb-1">📊 Sổ học vụ số minh bạch</h4>
        <p class="text-xs text-ink-500 leading-relaxed">Phụ huynh theo dõi trực tiếp nhận xét của giáo viên, lịch dạy thay và biên lai học phí theo thời gian thực.</p>
      </div>
    </div>
  </section>
</div>

