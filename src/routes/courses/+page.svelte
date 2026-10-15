<script>
  import { onMount } from 'svelte';
  import { getCurrentUser, getUserEnrolledGrades } from '$lib/unifiedStore';
  import RoadmapCard from '$lib/components/ui/RoadmapCard.svelte';
  import SectionHeading from '$lib/components/ui/SectionHeading.svelte';
  import UiButton from '$lib/components/ui/UiButton.svelte';

  let currentUser = $state(typeof window !== 'undefined' ? getCurrentUser() : null);

  onMount(() => {
    currentUser = getCurrentUser();
  });

  // Du lieu that tu trang courses cu (kiem chung 2026-09-30)
  const courses = [
    {
      id: 'primary-k15',
      title: 'Tiếng Anh Tiểu Học (Lớp 1 - Lớp 5) Global Success & Cambridge',
      gradeBand: 'Lớp 1 - 5',
      grades: [1, 2, 3, 4, 5],
      level: 'Starters • Movers • Flyers (Pre-A1 → A2)',
      description: 'Xây dựng nền tảng ngữ âm Phonics, phản xạ giao tiếp tự nhiên và bám sát SGK Global Success cho học sinh Lớp 1 đến Lớp 5.',
      duration: '2 - 3 buổi/tuần • 90 phút/buổi',
      price: 1000000,
      features: ['Phonics & Phát âm chuẩn bản ngữ', 'Trò chơi từ vựng tương tác', 'Đề kiểm tra định kỳ Lớp 1 - 5', 'Tích lũy Sao đổi học phí']
    },
    {
      id: 'g6-nangcao',
      title: 'Tiếng Anh Lớp 6 - Nền Tảng THCS & Giao Tiếp',
      gradeBand: 'Lớp 6',
      grades: [6],
      level: 'A1 - A2',
      description: 'Làm chủ ngữ pháp trọng tâm Lớp 6 Global Success / Friends Plus / Smart World, rèn kỹ năng nghe nói và tự tin vượt qua các kỳ thi học kỳ.',
      duration: '3 buổi/tuần • 90 phút/buổi',
      price: 1150000,
      features: ['Bám sát 3 bộ sách GDPT 2018', 'Luyện nghe - nói phản xạ', 'Ngân hàng đề kiểm tra 15p & 45p', 'Sổ đầu bài điện tử kết nối Zalo']
    },
    {
      id: 'g7-chuyen',
      title: 'Tiếng Anh Lớp 7 - Chuyên Sâu & Luyện Đề',
      gradeBand: 'Lớp 7',
      grades: [7],
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
      grades: [8],
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
      grades: [9],
      level: 'B1 - B2',
      description: 'Luyện chiến thuật giải đề thi vào 10 chuyên và công lập, bao phủ 100% dạng bài ngữ âm, từ vựng, đọc hiểu và sửa lỗi sai.',
      duration: '3 buổi/tuần • 105 phút/buổi',
      price: 1500000,
      features: ['Bộ đề thi thử thực chiến', 'Chiến thuật bẫy trắc nghiệm', 'Chấm bài viết chi tiết theo rubric', 'Cam kết đầu ra chuẩn Bộ GD']
    },
    {
      id: 'thpt-k1012',
      title: 'Tiếng Anh THPT (Lớp 10 - 12) & Luyện Thi Tốt Nghiệp THPT QG',
      gradeBand: 'Lớp 10 - 12',
      grades: [10, 11, 12],
      level: 'B1+ → B2+',
      description: 'Nắm vững ngữ pháp học thuật, đọc hiểu chuyên sâu và luyện đề chuẩn ma trận Tốt Nghiệp THPT Quốc Gia 2026.',
      duration: '3 buổi/tuần • 105 phút/buổi',
      price: 1600000,
      features: ['Chuẩn ma trận đề thi THPT QG 2026', 'Luyện giải đề 40 câu 50 phút', 'Từ vựng học thuật CEFR B2', 'Theo dõi tiến độ từng chuyên đề']
    },
    {
      id: 'ielts-foundation',
      title: 'IELTS Foundation & TOEIC 4 Kỹ Năng (Band 4.5 - 6.5+)',
      gradeBand: 'Chứng Chỉ Quốc Tế',
      grades: ['ielts', 'toeic'],
      level: 'B1+ → C1',
      description: 'Xây dựng nền tảng học thuật chuẩn quốc tế Cambridge & ETS, làm quen bài thi IELTS Academic / TOEIC cả 4 kỹ năng Nghe - Nói - Đọc - Viết.',
      duration: '2 buổi/tuần • 120 phút/buổi',
      price: 1800000,
      features: ['Giáo viên bản ngữ + GV chuyên ngữ', 'Mock Test IELTS / TOEIC định kỳ', 'Kế hoạch học tập cá nhân hóa', 'Hỗ trợ kho tài liệu Second Brain']
    }
  ];

  let visibleCourses = $derived.by(() => {
    if (currentUser?.role !== 'student') return courses;
    const enrolled = getUserEnrolledGrades(currentUser);
    if (!enrolled.length) return courses;
    return courses.filter((course) =>
      enrolled.some((g) => {
        const clean = String(g || '').toLowerCase().trim();
        const m = clean.match(/(\d{1,2})/);
        if (m && course.grades.includes(Number(m[1]))) return true;
        if (clean.includes('ielts') && course.grades.includes('ielts')) return true;
        if (clean.includes('toeic') && course.grades.includes('toeic')) return true;
        return false;
      })
    );
  });
</script>

<div class="max-w-6xl mx-auto px-3 sm:px-4 py-6 sm:py-8 pb-24 lg:pb-10 space-y-8">
  <SectionHeading
    eyebrow="Hệ Thống Đào Tạo K12 Chuẩn Bộ GD&ĐT"
    title={currentUser?.role === 'student' && currentUser?.grade ? `Chương trình học ${currentUser.grade} của em` : 'Chương trình khóa học & lộ trình phát triển'}
    sub="Phương pháp giảng dạy hiện đại kết hợp hệ sinh thái học tập số: ngân hàng đề thi, sổ học vụ điện tử và bảng sao tích lũy."
    center
  />

  <div class="grid grid-cols-1 md:grid-cols-2 gap-3 sm:gap-4">
    {#each visibleCourses as course}
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
    <UiButton href="/exam">🎯 Vào phòng thi trực tuyến</UiButton>
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

