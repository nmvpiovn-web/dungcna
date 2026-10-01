<script>
  import { onMount } from 'svelte';
  import { page } from '$app/state';
  import { speakWord, playAudioFeedback } from '$lib/speech.js';
  import {
    getCurrentUser,
    isLoggedIn,
    getLinkedStudentForParent,
    getSimilarProfileRecommendations,
    getStudentStars,
    isSuperAdmin,
    isTeacherOrAdmin,
    getAuthToken,
    getUserEnrolledGrades,
    isCurriculumEnrolled,
    requestUnlockClass
  } from '$lib/unifiedStore';
  import ParentTestOcrModal from '$lib/components/ParentTestOcrModal.svelte';

  // Academic Warmth UI (Phase 1)
  import IntentHero from '$lib/components/ui/IntentHero.svelte';
  import NeedQuiz from '$lib/components/ui/NeedQuiz.svelte';
  import StatCounter from '$lib/components/ui/StatCounter.svelte';
  import RoadmapPath from '$lib/components/ui/RoadmapPath.svelte';
  import FaqAccordion from '$lib/components/ui/FaqAccordion.svelte';
  import PriceCard from '$lib/components/ui/PriceCard.svelte';
  import UiButton from '$lib/components/ui/UiButton.svelte';
  import SectionHeading from '$lib/components/ui/SectionHeading.svelte';
  import EmptyState from '$lib/components/ui/EmptyState.svelte';
  import StreakBadge from '$lib/components/ui/StreakBadge.svelte';
  import XpPill from '$lib/components/ui/XpPill.svelte';

  let { data } = $props();

  let currentUser = $state(typeof window !== 'undefined' ? getCurrentUser() : null);
  let linkedChild = $state(typeof window !== 'undefined' && currentUser?.role === 'parent' ? getLinkedStudentForParent(currentUser) : null);
  let childRecommendations = $state([]);
  let studentStars = $state(850);
  let activeCurriculumTab = $state('all');

  // Reactively sync with URL ?tab= from navigation menu (Lộ trình dropdown)
  $effect(() => {
    const tabParam = page.url.searchParams.get('tab');
    if (tabParam) {
      activeCurriculumTab = tabParam;
      if (typeof window !== 'undefined') {
        const target = document.getElementById('curriculum-section');
        if (target) {
          target.scrollIntoView({ behavior: 'smooth' });
        }
      }
    }
  });
  let showOcrModal = $state(false);
  let parentTestRecords = $state([]);
  let unlockNotice = $state('');
  let isRequestingUnlock = $state(false);
  let showLockedCurricula = $state(false);

  let recordsError = $state('');
  let recordsRequest = 0;
  async function loadParentRecords() {
    const requestId = ++recordsRequest;
    const actorId = currentUser?.id;
    const childId = linkedChild?.id;
    parentTestRecords = [];
    recordsError = '';
    if (currentUser?.role !== 'parent' || !childId) return;
    try {
      const token = getAuthToken();
      const res = await fetch(`/api/parents/tests?student_id=${encodeURIComponent(childId)}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {}
      });
      const result = await res.json();
      if (requestId !== recordsRequest || currentUser?.id !== actorId || linkedChild?.id !== childId) return;
      if (!res.ok || !result.success) throw new Error(result.error || 'Không thể tải hồ sơ bài thi.');
      parentTestRecords = (result.records || []).map(record => ({ ...record, student_name: linkedChild.name }));
    } catch (error) {
      if (requestId === recordsRequest) recordsError = error.message || 'Không thể tải hồ sơ bài thi.';
    }
  }
  async function removeParentRecord(id) {
    try {
      const token = getAuthToken();
      const res = await fetch(`/api/parents/tests?id=${encodeURIComponent(id)}`, {
        method: 'DELETE', headers: token ? { Authorization: `Bearer ${token}` } : {}
      });
      const result = await res.json();
      if (!res.ok || !result.success) throw new Error(result.error || 'Không thể xóa hồ sơ.');
      await loadParentRecords();
    } catch (error) { recordsError = error.message || 'Không thể xóa hồ sơ.'; }
  }

  // Phonics sample for primary kids
  const primaryPhonics = [
    { word: 'Apple', ipa: '/ˈæpl/', meaning: 'Quả táo', emoji: '🍎' },
    { word: 'Cat', ipa: '/kæt/', meaning: 'Con mèo', emoji: '🐱' },
    { word: 'Dog', ipa: '/dɔːɡ/', meaning: 'Chú chó', emoji: '🐶' },
    { word: 'Elephant', ipa: '/ˈelɪfənt/', meaning: 'Con voi', emoji: '🐘' },
    { word: 'Sun', ipa: '/sʌn/', meaning: 'Mặt trời', emoji: '☀️' },
    { word: 'Star', ipa: '/stɑːr/', meaning: 'Ngôi sao', emoji: '⭐' }
  ];

  function extractStars(val) {
    if (typeof val === 'number') return val;
    if (val && typeof val.stars_balance === 'number') return val.stars_balance;
    return 850;
  }

  onMount(() => {
    currentUser = getCurrentUser();
    if (currentUser) {
      if (currentUser.role === 'parent') {
        linkedChild = getLinkedStudentForParent(currentUser);
        if (linkedChild) {
          childRecommendations = getSimilarProfileRecommendations(linkedChild);
          studentStars = extractStars(getStudentStars(linkedChild.id));
          loadParentRecords();
        }
      } else if (currentUser.role === 'student') {
        studentStars = extractStars(getStudentStars(currentUser.id));
        childRecommendations = getSimilarProfileRecommendations(currentUser);
      }

      // Auto-set curriculum tab based on user's grade / role
      const g = (currentUser.grade || '').toLowerCase();
      if (/lớp [1-5](?![0-9])|tiểu học/i.test(g)) {
        activeCurriculumTab = 'primary';
      } else if (/lớp [6-9](?![0-9])|thcs/i.test(g)) {
        activeCurriculumTab = 'secondary';
      } else if (/lớp 1[0-2]|thpt|đại học/i.test(g)) {
        activeCurriculumTab = 'high_school';
      } else if (/ielts|toeic|toefl|cambridge|vstep/i.test(g)) {
        activeCurriculumTab = 'certificate';
      } else if (currentUser.role === 'teacher') {
        activeCurriculumTab = 'pedagogy';
      }
    }

    const handleAuth = (e) => {
      ++recordsRequest;
      parentTestRecords = [];
      linkedChild = null;
      showOcrModal = false;
      currentUser = e.detail || getCurrentUser();
      if (currentUser?.role === 'parent') {
        linkedChild = getLinkedStudentForParent(currentUser);
        if (linkedChild) {
          studentStars = extractStars(getStudentStars(linkedChild.id));
          loadParentRecords();
        }
      } else if (currentUser?.role === 'student') {
        studentStars = extractStars(getStudentStars(currentUser.id));
      }
    };

    const handleRecordsUpdate = () => {
      if (linkedChild) {
        loadParentRecords();
      }
    };

    const handleLinkedChildChange = (event) => {
      const nextChild = event?.detail?.student;
      if (currentUser?.role !== 'parent' || !nextChild?.id) return;
      ++recordsRequest;
      parentTestRecords = [];
      recordsError = '';
      linkedChild = nextChild;
    };

    window.addEventListener('tienganh:auth-change', handleAuth);
    window.addEventListener('tienganh:parent-records-change', handleRecordsUpdate);
    window.addEventListener('tienganh:linked-child-change', handleLinkedChildChange);
    return () => {
      window.removeEventListener('tienganh:auth-change', handleAuth);
      window.removeEventListener('tienganh:parent-records-change', handleRecordsUpdate);
      window.removeEventListener('tienganh:linked-child-change', handleLinkedChildChange);
    };
  });

  const categoryLabels = [
    { key: 'all', label: 'Tất Cả Lộ Trình', sub: 'K12 & Quốc Tế', icon: '🌟' },
    { key: 'primary', label: 'Tiểu Học (Lớp 1 - 5)', sub: 'Phonics, Cambridge Starters/Movers/Flyers', icon: '🎒' },
    { key: 'secondary', label: 'THCS (Lớp 6 - 9)', sub: 'Global Success, KET & Luyện Thi Vào 10', icon: '🌱' },
    { key: 'high_school', label: 'THPT (Lớp 10 - 12)', sub: 'Nền Tảng & Nâng Cao Chuyên Sâu', icon: '🏢' },
    { key: 'exam_prep', label: 'Ôn Thi Đại Học', sub: 'THPT QG & Đánh Giá Năng Lực', icon: '🔥' },
    { key: 'certificate', label: 'Chứng Chỉ Quốc Tế', sub: 'IELTS • TOEIC • TOEFL iBT', icon: '🌍' },
    { key: 'pedagogy', label: 'Sư Phạm & Giáo Án 5512', sub: 'Phương Pháp Bản Ngữ & Co-Teaching', icon: '👨‍🏫' }
  ];

  let filteredCurricula = $derived(
    data.curricula.filter(c => activeCurriculumTab === 'all' || c.category === activeCurriculumTab)
  );

  let targetStudentUser = $derived(
    currentUser?.role === 'parent' ? (linkedChild || getLinkedStudentForParent(currentUser)) : (currentUser?.role === 'student' ? currentUser : null)
  );

  let enrolledGrades = $derived(
    targetStudentUser ? getUserEnrolledGrades(targetStudentUser) : (currentUser?.role === 'student' ? getUserEnrolledGrades(currentUser) : [])
  );

  let studentEnrolledCurricula = $derived.by(() => {
    const student = targetStudentUser || (currentUser?.role === 'student' ? currentUser : null);
    if (!student) return [];
    return data.curricula.filter(c => isCurriculumEnrolled(student, c));
  });

  let studentLockedCurricula = $derived.by(() => {
    const student = targetStudentUser || (currentUser?.role === 'student' ? currentUser : null);
    if (!student) return [];
    return data.curricula.filter(c => !isCurriculumEnrolled(student, c));
  });

  async function handleRequestUnlock(curr) {
    if (!targetStudentUser) return;
    isRequestingUnlock = true;
    try {
      await requestUnlockClass(targetStudentUser.id, curr.title);
      playAudioFeedback('success');
      unlockNotice = `✅ Đã gửi yêu cầu đăng ký thêm "${curr.title}" đến Cô Dung! Cô giáo sẽ xem xét và mở khóa vào tài khoản của em.`;
      setTimeout(() => unlockNotice = '', 7000);
    } catch {
      unlockNotice = '⚠️ Có lỗi khi gửi yêu cầu. Vui lòng liên hệ trực tiếp Cô Dung qua Zalo.';
      setTimeout(() => unlockNotice = '', 5000);
    } finally {
      isRequestingUnlock = false;
    }
  }

  let userGrade = $derived.by(() => {
    if (!currentUser) return '';
    if (currentUser.grade) return currentUser.grade;
    try {
      const meta = typeof currentUser.metadata === 'string' ? JSON.parse(currentUser.metadata) : (currentUser.metadata || {});
      return meta.grade || '';
    } catch {
      return '';
    }
  });

  let userRole = $derived(currentUser?.role || '');

  let isPrimaryStudent = $derived(
    userRole === 'student' && (/lớp [1-5]/i.test(userGrade) || /tiểu học/i.test(userGrade))
  );

  // ===== Phase 1 content (Academic Warmth) =====
  const heroIntents = [
    { key: 'student', emoji: '🎒', title: 'Em là học sinh', desc: 'Chơi game học từ vựng, luyện đề, tích sao đổi học phí.', cta: '🎮 Chơi & học ngay', href: '/games' },
    { key: 'parent', emoji: '👨‍👩‍👧', title: 'Tôi là phụ huynh', desc: 'Test xếp lớp miễn phí cho con, nhận báo cáo tiến bộ qua Zalo.', cta: '📝 Test xếp lớp 3 phút', href: '/exam#placement' },
    { key: 'teacher', emoji: '👩‍🏫', title: 'Tôi là giáo viên', desc: 'Quản lý lớp, chấm bài, gửi báo cáo phụ huynh.', cta: '🛠️ Mở bảng điều khiển', href: '/cpanel' }
  ];

  // ===== NeedQuiz: chon khoi lop -> goi y lo trinh (khong can login) =====
  const quizGrades = [
    { key: 'g1-5', label: 'Lớp 1 – 5', suggestion: 'Tiếng Anh tiểu học: phonics + từ vựng theo chủ đề', detail: 'Học qua game, bài hát và truyện tranh — 2 buổi/tuần.', href: '/courses' },
    { key: 'g6-9', label: 'Lớp 6 – 9', suggestion: 'THCS: ngữ pháp nền + luyện đề Global Success', detail: 'Bám sát SGK, ngân hàng đề 15p – 45p, báo cáo Zalo hằng tuần.', href: '/courses' },
    { key: 'g10-12', label: 'Lớp 10 – 12', suggestion: 'THPT: ôn thi tốt nghiệp & vào 10/ĐH', detail: 'Chiến thuật giải đề, chấm writing theo rubric, cam kết đầu ra.', href: '/courses' },
    { key: 'ielts', label: 'IELTS / TOEIC', suggestion: 'Chứng chỉ quốc tế: IELTS Foundation band 5.5 → 6.5+', detail: '4 kỹ năng, mock test định kỳ, GV bản ngữ + chuyên ngữ.', href: '/bang-gia' }
  ];

  const proofStats = [
    { value: data.stats?.totalQuestions ?? 1375, suffix: '', label: 'Câu hỏi ngân hàng đề', icon: '📝' },
    { value: data.stats?.totalWords ?? 222, suffix: '', label: 'Từ vựng minh họa', icon: '🔤' },
    { value: data.stats?.totalCurricula ?? data.curricula?.length ?? 0, suffix: '', label: 'Chương trình học K12', icon: '📚' },
    { value: 100, suffix: '', label: 'Sao = 1.000đ trừ học phí', icon: '⭐' }
  ];

  const painPoints = [
    {
      emoji: '😟',
      pain: 'Con sợ tiếng Anh, học trước quên sau',
      fix: 'Flashcards SRS nhắc ôn đúng lúc + game từ vựng mỗi ngày 10 phút, con học như chơi.',
      href: '/tools'
    },
    {
      emoji: '💸',
      pain: 'Đóng tiền học thêm mà không biết con tiến bộ ra sao',
      fix: 'Đánh giá năng lực 5 kỹ năng + báo cáo gửi Zalo phụ huynh mỗi tuần. Minh bạch từng điểm số.',
      href: '/evaluations'
    },
    {
      emoji: '👥',
      pain: 'Lớp đông, cô không kèm sát từng bạn',
      fix: 'Nhóm nhỏ 1:1 hoặc 1:3 — cô Dung theo sát từng học viên, lộ trình cá nhân hóa sau test xếp lớp.',
      href: '/bang-gia'
    }
  ];

  const roadmapNodes = [
    { label: 'Mất gốc', sub: 'Phục hồi nền tảng', status: 'done' },
    { label: 'A1 → A2', sub: 'Lớp 6–7 Global Success', status: 'current' },
    { label: 'B1', sub: 'Lớp 8–9, luyện vào 10', status: 'locked' },
    { label: 'B2', sub: 'IELTS Foundation', status: 'locked' },
    { label: 'C1', sub: 'IELTS 6.5+, HSG', status: 'locked' }
  ];

  // Gia that tu /courses (kiem chung 2026-09-30)
  const priceTeaser = [
    {
      title: 'Lớp 7 · A2 → B1',
      gradeBand: 'THCS',
      price: 1200000,
      unit: 'tháng',
      oldPrice: 1500000,
      features: ['Bám sát Global Success 7', 'Ngân hàng đề 15p – 45p', 'Báo cáo Zalo hằng tuần'],
      gifts: ['Miễn phí test xếp lớp đầu vào'],
      href: '/bang-gia'
    },
    {
      title: 'Lớp 9 · B1 → B2',
      gradeBand: 'Luyện vào 10',
      price: 1500000,
      unit: 'tháng',
      oldPrice: 1800000,
      features: ['Luyện đề thi vào 10 các tỉnh', 'Đánh giá năng lực 5 kỹ năng', 'Kèm 1:3 sát sao'],
      gifts: ['Tặng bộ đề vào 10 (PDF)'],
      href: '/bang-gia'
    },
    {
      title: 'IELTS Foundation',
      gradeBand: 'Chứng chỉ',
      price: 1800000,
      unit: 'tháng',
      oldPrice: 2200000,
      features: ['4 kỹ năng Nghe–Nói–Đọc–Viết', 'Mock test định kỳ', 'Lộ trình band 5.5 → 6.5+'],
      gifts: ['Tặng 1 buổi mock test 1:1'],
      href: '/bang-gia'
    }
  ];

  const hofCommitments = [
    { emoji: '🎯', title: 'Lộ trình cá nhân', desc: '100% học viên có roadmap riêng sau test xếp lớp 3 phút — không học chung một khuôn.' },
    { emoji: '📈', title: 'Báo cáo minh bạch', desc: 'Điểm số, streak, huy hiệu CEFR được gửi Zalo cho phụ huynh mỗi tuần.' },
    { emoji: '🏅', title: 'Huy hiệu theo chuẩn CEFR', desc: 'Từ A1 đến C1 — mỗi mốc là một huy hiệu con có thể khoe với cả nhà.' },
    { emoji: '👩‍🏫', title: 'Nhóm nhỏ 1:1 / 1:3', desc: 'Cô Dung theo sát từng học viên, không bỏ sót bạn nào.' }
  ];

  const faqItems = [
    {
      q: 'Test xếp lớp mất bao lâu? Có cần đăng ký tài khoản không?',
      a: 'Chỉ 3 phút với 10 câu hỏi, hoàn toàn miễn phí và không cần đăng nhập. Kết quả cho biết ngay trình độ CEFR (A1–C1), điểm mạnh/yếu từng kỹ năng và lộ trình học gợi ý.'
    },
    {
      q: 'Con bị mất gốc tiếng Anh có học được không?',
      a: 'Được. Sau test xếp lớp, con sẽ có lộ trình "phục hồi nền tảng" riêng: bắt đầu từ phát âm – từ vựng cơ bản, học qua game và flashcards SRS mỗi ngày 10–15 phút trước khi vào chương trình chính khóa.'
    },
    {
      q: 'Lớp học có bao nhiêu bạn?',
      a: 'Lớp nhóm nhỏ 1:1 hoặc 1:3 để cô kèm sát từng bạn. Phụ huynh liên hệ Zalo để được tư vấn hình thức học phù hợp với lịch của con.'
    },
    {
      q: 'Phụ huynh theo dõi tiến bộ của con bằng cách nào?',
      a: 'Báo cáo học tập (điểm số, streak ngày học, huy hiệu CEFR) được gửi qua Zalo mỗi tuần. Ngoài ra phụ huynh có thể xem bảng điểm chi tiết tại mục Đánh giá năng lực và hồ sơ bài thi của con ngay trên trang này khi đăng nhập.'
    },
    {
      q: 'Cơ chế tích Sao đổi học phí hoạt động thế nào?',
      a: 'Học viên tích Sao khi hoàn thành bài tập, game từ vựng và giữ streak ngày học. Cứ 100 Sao = 1.000đ được trừ trực tiếp vào học phí tháng sau.'
    },
    {
      q: 'Học phí tính như thế nào? Có ưu đãi gì không?',
      a: 'Học phí tính theo tháng, từ 1.200.000đ/tháng tùy lớp. Đóng theo học kỳ hoặc năm được giảm thêm, xem chi tiết tại trang Bảng giá. Ưu đãi khai giảng: giảm 15–20% + tặng bộ đề PDF.'
    }
  ];
</script>

<div class="max-w-7xl mx-auto px-3 sm:px-4 pb-24 lg:pb-10 space-y-10 sm:space-y-14">

  <!-- ===== Logged-in compact strip (giữ logic business) ===== -->
  {#if currentUser}
    <section class="flex flex-wrap items-center gap-2 sm:gap-3 rounded-2xl bg-surface-0 border border-line px-4 py-3 shadow-sm">
      <span class="text-xl">{currentUser.role === 'parent' ? '👨‍👩‍👧' : currentUser.role === 'teacher' ? '👩‍🏫' : '🎒'}</span>
      <div class="min-w-0">
        <div class="text-sm font-extrabold text-ink-900 truncate">Chào {currentUser.name || 'bạn'}! 👋</div>
        {#if currentUser.role === 'parent' && linkedChild}
          <div class="text-xs text-ink-500">Đang theo dõi: <b class="text-ink-900">{linkedChild.name}</b></div>
        {/if}
      </div>
      <div class="ml-auto flex items-center gap-2">
        {#if currentUser.role === 'student' || linkedChild}
          <StreakBadge />
          <XpPill />
        {/if}
        <span class="hidden sm:inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-brand-50 border border-brand-200 text-brand-700 text-xs font-extrabold">
          ⭐ {studentStars.toLocaleString('vi-VN')} Sao
        </span>
      </div>
    </section>
  {/if}

  <!-- ===== 1. Intent Hero ===== -->
  <IntentHero
    eyebrow="TIẾNG ANH CÔ DUNG • NĂM HỌC 2026"
    headline="Con bạn đang học lớp mấy?"
    subline="Chọn đúng vai trò — chúng tôi đưa bạn đến đúng nơi trong 1 chạm: test xếp lớp miễn phí, game học từ vựng, ngân hàng đề thi và báo cáo Zalo cho phụ huynh."
    intents={heroIntents}
  />

  <!-- ===== 2. Need Quiz ===== -->
  <NeedQuiz grades={quizGrades} />

  <!-- ===== 3. Proof bar (số liệu thật) ===== -->
  <section>
    <SectionHeading eyebrow="Con số biết nói" title="Học liệu thật, đo được" center />
    <div class="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
      {#each proofStats as s}
        <StatCounter {...s} />
      {/each}
    </div>
  </section>

  <!-- ===== 4. Pain points ===== -->
  <section>
    <SectionHeading eyebrow="Thấu hiểu phụ huynh" title="3 nỗi lo thường gặp — và cách chúng tôi giải" center />
    <div class="grid md:grid-cols-3 gap-3 sm:gap-4">
      {#each painPoints as p}
        <div class="rounded-3xl bg-surface-0 border border-line p-5 shadow-sm flex flex-col gap-3">
          <div class="text-3xl">{p.emoji}</div>
          <div class="font-extrabold text-ink-900 text-sm sm:text-base leading-snug">"{p.pain}"</div>
          <div class="text-sm text-ink-500 leading-relaxed flex-1">{p.fix}</div>
          <a href={p.href} class="text-sm font-extrabold text-brand-600 hover:text-brand-700">Tìm hiểu thêm →</a>
        </div>
      {/each}
    </div>
  </section>

  <!-- ===== 5. Roadmap ===== -->
  <section class="rounded-3xl bg-surface-0 border border-line p-5 sm:p-8 shadow-sm">
    <SectionHeading eyebrow="Lộ trình rõ ràng" title="Từ mất gốc đến IELTS: mỗi bước đều có đích" />
    <RoadmapPath nodes={roadmapNodes} />
    <div class="mt-4 flex flex-wrap gap-3">
      <UiButton href="/exam#placement">📝 Test xem con đang ở đâu</UiButton>
      <UiButton href="/courses" variant="ghost">Xem chương trình →</UiButton>
    </div>
  </section>

  <!-- ===== 6. Pricing teaser ===== -->
  <section>
    <SectionHeading eyebrow="Học phí minh bạch" title="Chọn lớp theo đúng trình độ của con" center actionLabel="Xem bảng giá đầy đủ →" actionHref="/bang-gia" />
    <div class="grid md:grid-cols-3 gap-3 sm:gap-4">
      {#each priceTeaser as c}
        <PriceCard {...c} />
      {/each}
    </div>
    <p class="text-center text-xs text-ink-500 mt-4">💡 Đóng theo học kỳ/năm được giảm thêm. Giá đã gồm toàn bộ học liệu & báo cáo Zalo.</p>
  </section>

  <!-- ===== 7. Hall of Fame teaser (trung thực: cam kết chương trình) ===== -->
  <section class="rounded-3xl hof-gradient text-white p-6 sm:p-10 shadow-sm relative overflow-hidden">
    <div class="absolute -right-16 -top-16 w-64 h-64 rounded-full bg-white/15 blur-2xl pointer-events-none"></div>
    <div class="absolute -left-20 -bottom-20 w-72 h-72 rounded-full bg-cyan-200/40 blur-3xl pointer-events-none"></div>
    <div class="relative z-10">
      <SectionHeading eyebrow="Hall of Fame" title="Điều chúng tôi cam kết với mỗi học viên" dark />
      <div class="grid sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 mt-2">
        {#each hofCommitments as h}
          <div class="rounded-2xl hof-card p-4">
            <div class="text-2xl mb-2">{h.emoji}</div>
            <div class="font-extrabold text-sm mb-1">{h.title}</div>
            <div class="text-xs text-white/85 leading-relaxed">{h.desc}</div>
          </div>
        {/each}
      </div>
      <div class="mt-6 text-center">
        <a href="/hall-of-fame" class="inline-flex items-center gap-2 px-6 py-3 rounded-2xl bg-white text-cyan-800 font-extrabold text-sm shadow-sm hover:scale-[1.03] transition-transform">
          🏆 Khám phá Hall of Fame
        </a>
      </div>
    </div>
  </section>

  <!-- ===== 8. Curriculum explorer (giữ logic enrollment/unlock) ===== -->
  <section id="curriculum-section" class="scroll-mt-24">
    <SectionHeading eyebrow="Chương trình học" title="Lộ trình K12 & chứng chỉ quốc tế" sub="Chọn đúng cấp học của con — tài khoản đã đăng ký lớp sẽ thấy nút vào học." />
    <div class="flex flex-wrap gap-2 mb-5">
      {#each categoryLabels as cat}
        <button
          type="button"
          onclick={() => activeCurriculumTab = cat.key}
          class={`px-3.5 py-2 rounded-xl text-xs sm:text-sm font-extrabold border transition-all ${activeCurriculumTab === cat.key ? 'bg-brand-600 border-brand-600 dark:bg-brand-700 dark:border-brand-700 text-white shadow-sm' : 'bg-surface-0 border-line text-ink-900 hover:border-brand-200'}`}
        >
          {cat.icon} {cat.label}
        </button>
      {/each}
    </div>

    {#if unlockNotice}
      <div class="mb-4 p-3 rounded-2xl bg-success-600/10 border border-success-600/30 text-sm font-bold text-ink-900">{unlockNotice}</div>
    {/if}

    {#if filteredCurricula.length === 0}
      <EmptyState icon="📚" title="Chưa có chương trình" desc="Danh mục này đang được cập nhật. Quay lại sau nhé!" />
    {:else}
      <div class="grid sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
        {#each filteredCurricula as curr (curr.id || curr.title)}
          {@const enrolled = targetStudentUser ? isCurriculumEnrolled(targetStudentUser, curr) : false}
          <div class="rounded-3xl bg-surface-0 border border-line p-5 shadow-sm flex flex-col gap-3 hover:shadow-md transition-shadow">
            <div class="flex items-start justify-between gap-2">
              <div class="text-3xl">{curr.icon || '📘'}</div>
              {#if enrolled}
                <span class="px-2 py-0.5 rounded-full bg-success-600/10 border border-success-600/30 text-success-600 text-[11px] font-extrabold">✓ Đã đăng ký</span>
              {:else if targetStudentUser}
                <span class="px-2 py-0.5 rounded-full bg-surface-1 border border-line text-ink-500 text-[11px] font-extrabold">🔒 Chưa mở</span>
              {/if}
            </div>
            <div>
              <div class="font-extrabold text-ink-900 text-sm sm:text-base">{curr.title}</div>
              <div class="text-xs text-ink-500 mt-0.5">{curr.grade_range || curr.subtitle || ''}</div>
            </div>
            {#if curr.description}
              <p class="text-xs text-ink-500 leading-relaxed line-clamp-3 flex-1">{curr.description}</p>
            {/if}
            <div class="flex gap-2 pt-1">
              {#if enrolled}
                <UiButton size="sm" href={`/courses/${curr.slug || curr.id}`}>▶️ Vào học</UiButton>
              {:else if targetStudentUser}
                <UiButton size="sm" variant="ghost" onclick={() => handleRequestUnlock(curr)} disabled={isRequestingUnlock}>
                  {isRequestingUnlock ? 'Đang gửi...' : '🔓 Xin mở lớp'}
                </UiButton>
              {:else}
                <UiButton size="sm" href="/courses">Xem chi tiết →</UiButton>
              {/if}
            </div>
          </div>
        {/each}
      </div>
    {/if}

    <!-- Phonics sample cho tiểu học -->
    {#if isPrimaryStudent}
      <div class="mt-8 rounded-3xl bg-surface-0 border border-line p-5 sm:p-6 shadow-sm">
        <SectionHeading eyebrow="Chơi mà học" title="🔤 Thử đọc theo cô nhé!" />
        <div class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2.5">
          {#each primaryPhonics as w}
            <button
              type="button"
              onclick={() => speakWord(w.word)}
              class="rounded-2xl bg-surface-1 border border-line p-3 text-center hover:border-brand-200 hover:shadow-sm transition-all"
            >
              <div class="text-3xl mb-1">{w.emoji}</div>
              <div class="font-extrabold text-sm text-ink-900">{w.word}</div>
              <div class="text-[11px] text-ink-500">{w.ipa}</div>
              <div class="text-[11px] font-bold text-brand-600">{w.meaning}</div>
            </button>
          {/each}
        </div>
      </div>
    {/if}
  </section>

  <!-- ===== 9. Parent test records (giữ logic OCR) ===== -->
  {#if currentUser?.role === 'parent' && linkedChild}
    <section class="rounded-3xl bg-surface-0 border border-line p-5 sm:p-6 shadow-sm">
      <div class="flex flex-wrap items-center justify-between gap-3 mb-4">
        <SectionHeading eyebrow="Hồ sơ học tập" title={`📁 Bài thi của ${linkedChild.name}`} />
        <UiButton size="sm" variant="accent" onclick={() => showOcrModal = true}>📸 Chụp bài thi mới</UiButton>
      </div>
      {#if recordsError}
        <div class="mb-3 text-sm font-bold text-danger-600">{recordsError}</div>
      {/if}
      {#if parentTestRecords.length === 0}
        <EmptyState icon="📄" title="Chưa có bài thi nào" desc="Chụp ảnh bài kiểm tra của con để lưu điểm và theo dõi tiến bộ theo thời gian." actionLabel="📸 Chụp bài thi đầu tiên" onaction={() => showOcrModal = true} />
      {:else}
        <ul class="divide-y divide-[rgb(var(--line-rgb)/0.6)]">
          {#each parentTestRecords.slice(0, 5) as r}
            <li class="flex items-center gap-3 py-3">
              <span class="text-2xl">📝</span>
              <div class="flex-1 min-w-0">
                <div class="text-sm font-bold text-ink-900 truncate">{r.title || r.test_name || 'Bài kiểm tra'}</div>
                <div class="text-xs text-ink-500">{r.created_at ? new Date(r.created_at).toLocaleDateString('vi-VN') : ''}{r.score != null ? ` • Điểm: ${r.score}` : ''}</div>
              </div>
              <button type="button" onclick={() => removeParentRecord(r.id)} class="text-xs font-bold text-danger-600 hover:underline">Xóa</button>
            </li>
          {/each}
        </ul>
      {/if}
    </section>
  {/if}

  <!-- ===== 10. FAQ ===== -->
  <section>
    <SectionHeading eyebrow="Hỏi đáp" title="Phụ huynh hay hỏi gì?" center />
    <FaqAccordion items={faqItems} />
  </section>

</div>


{#if showOcrModal && linkedChild}
  <ParentTestOcrModal student={linkedChild} onclose={() => showOcrModal = false} />
{/if}
