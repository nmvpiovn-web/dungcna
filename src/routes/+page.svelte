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
    getParentTestRecords,
    deleteParentTestRecord,
    getUserEnrolledGrades,
    isCurriculumEnrolled,
    requestUnlockClass
  } from '$lib/unifiedStore';
  import ParentTestOcrModal from '$lib/components/ParentTestOcrModal.svelte';

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
  let selectedPrimaryWord = $state(null);
  let starRewardNotice = $state(false);
  let showOcrModal = $state(false);
  let parentTestRecords = $state([]);
  let unlockNotice = $state('');
  let isRequestingUnlock = $state(false);
  let showLockedCurricula = $state(false);

  // Phonics card sample for primary kids
  const primaryPhonics = [
    { word: 'Apple', ipa: '/ˈæpl/', meaning: 'Quả táo', emoji: '🍎', color: 'from-rose-500 to-red-600' },
    { word: 'Cat', ipa: '/kæt/', meaning: 'Con mèo', emoji: '🐱', color: 'from-amber-500 to-orange-600' },
    { word: 'Dog', ipa: '/dɔːɡ/', meaning: 'Chú chó', emoji: '🐶', color: 'from-blue-500 to-indigo-600' },
    { word: 'Elephant', ipa: '/ˈelɪfənt/', meaning: 'Con voi', emoji: '🐘', color: 'from-teal-500 to-emerald-600' },
    { word: 'Sun', ipa: '/sʌn/', meaning: 'Mặt trời', emoji: '☀️', color: 'from-yellow-400 to-amber-500' },
    { word: 'Star', ipa: '/stɑːr/', meaning: 'Ngôi sao', emoji: '⭐', color: 'from-purple-500 to-violet-600' }
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
          parentTestRecords = getParentTestRecords(linkedChild.id);
        }
      } else if (currentUser.role === 'student') {
        studentStars = extractStars(getStudentStars(currentUser.id));
        childRecommendations = getSimilarProfileRecommendations(currentUser);
      }

      // Auto-set curriculum tab based on user's grade / role
      const g = (currentUser.grade || '').toLowerCase();
      if (/lớp [1-5]|tiểu học/i.test(g)) {
        activeCurriculumTab = 'primary';
      } else if (/lớp [6-9]|thcs/i.test(g)) {
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
      currentUser = e.detail || getCurrentUser();
      if (currentUser?.role === 'parent') {
        linkedChild = getLinkedStudentForParent(currentUser);
        if (linkedChild) {
          studentStars = extractStars(getStudentStars(linkedChild.id));
          parentTestRecords = getParentTestRecords(linkedChild.id);
        }
      } else if (currentUser?.role === 'student') {
        studentStars = extractStars(getStudentStars(currentUser.id));
      }
    };

    const handleRecordsUpdate = () => {
      if (linkedChild) {
        parentTestRecords = getParentTestRecords(linkedChild.id);
      }
    };

    window.addEventListener('tienganh:auth-change', handleAuth);
    window.addEventListener('tienganh:parent-records-change', handleRecordsUpdate);
    return () => {
      window.removeEventListener('tienganh:auth-change', handleAuth);
      window.removeEventListener('tienganh:parent-records-change', handleRecordsUpdate);
    };
  });

  const categoryLabels = [
    { key: 'all', label: 'Tất Cả Lộ Trình (19 Môn)', icon: '🌟' },
    { key: 'primary', label: 'Tiểu Học (Lớp 1 - 5)', icon: '🎒' },
    { key: 'secondary', label: 'THCS (Lớp 6 - 9)', icon: '🌱' },
    { key: 'high_school', label: 'THPT (Lớp 10 - 12)', icon: '🏢' },
    { key: 'exam_prep', label: 'Ôn Thi Đại Học', icon: '🔥' },
    { key: 'certificate', label: 'IELTS • TOEIC • TOEFL', icon: '🌍' },
    { key: 'pedagogy', label: 'Phương Pháp Bản Ngữ & 5512', icon: '👨‍🏫' }
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

  let isTeacher = $derived(
    userRole === 'teacher' || (!isSuperAdmin(currentUser) && currentUser?.role === 'teacher')
  );

  let isParent = $derived(
    userRole === 'parent'
  );

  let isPrimaryStudent = $derived(
    userRole === 'student' && (/lớp [1-5]/i.test(userGrade) || /tiểu học/i.test(userGrade))
  );

  let isSecondaryStudent = $derived(
    userRole === 'student' && (/lớp [6-9]/i.test(userGrade) || /thcs/i.test(userGrade))
  );

  let isHighSchoolStudent = $derived(
    userRole === 'student' && (
      /lớp 1[0-2]|thpt|đại học|thptqg/i.test(userGrade) ||
      /ielts|toeic|toefl/i.test(userGrade)
    )
  );

  let isCertificateOrGeneralStudent = $derived(
    userRole === 'student' && !isPrimaryStudent && !isSecondaryStudent && !isHighSchoolStudent
  );

  function playPhonics(card) {
    selectedPrimaryWord = card.word;
    speakWord(card.word, 0.8);
    playAudioFeedback('flip');
    studentStars += 5;
    starRewardNotice = true;
    setTimeout(() => {
      starRewardNotice = false;
    }, 2500);
  }
</script>

<div class="space-y-10">

  <!-- ========================================================================= -->
  <!-- ROLE SPECIFIC SECTION 1: PARENT VIEW ("SỔ PHỤ HUYNH THÔNG MINH") -->
  <!-- ========================================================================= -->
  {#if currentUser?.role === 'parent'}
    <div class="rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-6 sm:p-8 shadow-xl">
      <div class="flex flex-col md:flex-row md:items-center justify-between gap-6 pb-6 border-b border-purple-100 dark:border-purple-900/40">
        <div class="space-y-2">
          <div class="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-semibold bg-purple-600 text-white tracking-wider">
            <span>👨‍👩‍👧 SỔ PHỤ HUYNH THÔNG MINH</span>
          </div>
          <h1 class="text-2xl sm:text-3xl font-heading font-semibold text-slate-900 dark:text-white">
            Kính chào Quý Phụ Huynh {currentUser.name}!
          </h1>
          <p class="text-xs sm:text-sm text-slate-600 dark:text-slate-300">
            Theo dõi tiến trình học tập, chuyên cần, sao thưởng và phân tích năng khiếu của con tại Hệ thống Tiếng Anh Cô Dung.
          </p>
        </div>

        {#if linkedChild}
          <div class="p-4 rounded-2xl bg-white dark:bg-slate-800/90 border border-purple-200 dark:border-purple-700/50 shadow-md flex items-center gap-4">
            <img src={linkedChild.avatar} alt={linkedChild.name} class="w-14 h-14 rounded-2xl object-cover border-2 border-purple-400" />
            <div>
              <div class="text-xs text-purple-600 dark:text-purple-300 font-bold uppercase">Học Viên Liên Kết</div>
              <div class="text-base font-heading font-semibold text-slate-900 dark:text-white">{linkedChild.name}</div>
              <div class="text-xs text-slate-700 dark:text-slate-300 font-medium">
                {(() => {
                  try {
                    const m = typeof linkedChild.metadata === 'string' ? JSON.parse(linkedChild.metadata) : linkedChild.metadata;
                    return `${m.grade || 'Lớp 1'} • ${m.school || 'Tiểu Học'}`;
                  } catch { return 'Lớp 1'; }
                })()}
              </div>
            </div>
          </div>
        {/if}
      </div>

      <!-- Child Progress Snapshot & Tuition Discount -->
      <div class="grid grid-cols-1 sm:grid-cols-3 gap-4 my-6">
        <div class="p-5 rounded-2xl bg-white dark:bg-slate-800/80 border border-slate-200 dark:border-slate-800 shadow-sm flex items-center gap-4">
          <div class="w-12 h-12 rounded-2xl bg-amber-500/10 text-amber-600 dark:text-amber-400 flex items-center justify-center text-2xl font-bold">
            ⭐
          </div>
          <div>
            <div class="text-xs text-slate-700 dark:text-slate-300 font-bold uppercase">Sao Thưởng Hiện Có</div>
            <div class="text-xl font-heading font-semibold text-slate-900 dark:text-white">{studentStars} Sao</div>
            <div class="text-[11px] text-emerald-700 dark:text-emerald-400 font-bold">
              Đổi được {(studentStars * 10).toLocaleString('vi-VN')} VNĐ trừ học phí
            </div>
          </div>
        </div>

        <div class="p-5 rounded-2xl bg-white dark:bg-slate-800/80 border border-slate-200 dark:border-slate-800 shadow-sm flex items-center gap-4">
          <div class="w-12 h-12 rounded-2xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 flex items-center justify-center text-2xl font-bold">
            📈
          </div>
          <div>
            <div class="text-xs text-slate-700 dark:text-slate-300 font-bold uppercase">Chuyên Cần &amp; Kỷ Luật</div>
            <div class="text-xl font-heading font-semibold text-emerald-600 dark:text-emerald-400">100%</div>
            <div class="text-[11px] text-slate-700 dark:text-slate-300 font-medium">Đầy đủ tất cả buổi học &amp; BTVN</div>
          </div>
        </div>

        <div class="p-5 rounded-2xl bg-white dark:bg-slate-800/80 border border-slate-200 dark:border-slate-800 shadow-sm flex items-center gap-4">
          <div class="w-12 h-12 rounded-2xl bg-purple-500/10 text-purple-600 dark:text-purple-400 flex items-center justify-center text-2xl font-bold">
            🧠
          </div>
          <div>
            <div class="text-xs text-slate-700 dark:text-slate-300 font-bold uppercase">Thiên Hướng Năng Khiếu</div>
            <div class="text-base font-heading font-semibold text-purple-700 dark:text-purple-300">Phản Xạ &amp; Phát Âm Chuẩn</div>
            <div class="text-[11px] text-slate-700 dark:text-slate-300 font-medium">Đánh giá bởi GV Bản Ngữ &amp; Cô Dung</div>
          </div>
        </div>
      </div>

      <!-- CHILD TEST RECORDS TRACKER (WITH CAMERA / OCR CAPTURE) -->
      <div class="my-6 p-6 rounded-2xl bg-purple-50/50 dark:bg-purple-950/20 border border-purple-200 dark:border-purple-800/50 space-y-4">
        <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <div class="flex items-center gap-2">
              <span class="text-xl">📸</span>
              <h3 class="text-base font-heading font-semibold text-slate-900 dark:text-white">
                Sổ Điểm &amp; Bài Kiểm Tra Của Con (Hỗ Trợ Quét OCR)
              </h3>
            </div>
            <p class="text-xs text-slate-600 dark:text-slate-400 mt-0.5">
              Phụ huynh có thể chụp ảnh bài thi giấy trên lớp để hệ thống tự động nhận diện điểm số hoặc nhập thủ công.
            </p>
          </div>

          <div class="flex items-center gap-2">
            <button
              type="button"
              onclick={() => showOcrModal = true}
              class="px-4 py-2 rounded-xl bg-sky-600 hover:bg-sky-500 text-white font-medium text-xs shadow-sm transition-all flex items-center gap-1.5"
            >
              <span>📷 Chụp Ảnh Bài Thi (OCR)</span>
            </button>
            <button
              type="button"
              onclick={() => showOcrModal = true}
              class="px-3.5 py-2 rounded-xl bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-200 font-bold text-xs hover:border-purple-500 transition-all flex items-center gap-1"
            >
              <span>✍️ Nhập Điểm</span>
            </button>
          </div>
        </div>

        {#if parentTestRecords.length === 0}
          <div class="p-6 text-center rounded-xl bg-white/70 dark:bg-slate-900/60 border border-purple-100 dark:border-purple-900 text-xs text-slate-700 dark:text-slate-300 font-medium">
            Chưa có bài kiểm tra nào được lưu. Bấm nút <strong>"Chụp Ảnh Bài Thi (OCR)"</strong> ở trên để cập nhật bài thi đầu tiên của con!
          </div>
        {:else}
          <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
            {#each parentTestRecords as record}
              <div class="p-4 rounded-xl bg-white dark:bg-slate-900 border border-purple-100 dark:border-purple-800/40 shadow-sm space-y-2 relative group">
                <div class="flex items-start justify-between gap-2">
                  <div>
                    <div class="flex items-center gap-1.5 mb-1">
                      <span class="text-[10px] font-bold px-2 py-0.5 rounded-full {record.ocr_status === 'ocr_verified' ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 border border-emerald-300/40' : 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300'}">
                        {record.ocr_status === 'ocr_verified' ? '📸 OCR Đã Quét' : '✍️ Nhập Tay'}
                      </span>
                      <span class="text-[11px] text-slate-600 dark:text-slate-300 font-medium">{record.test_date}</span>
                    </div>
                    <h4 class="font-bold text-sm text-slate-900 dark:text-white leading-tight">
                      {record.test_name}
                    </h4>
                  </div>

                  <div class="text-right">
                    <div class="text-xl font-heading font-semibold text-purple-700 dark:text-purple-300">
                      {record.score}<span class="text-xs text-slate-600 dark:text-slate-400 font-medium">/{record.max_score}</span>
                    </div>
                  </div>
                </div>

                {#if record.teacher_feedback}
                  <div class="p-2 rounded-lg bg-slate-50 dark:bg-slate-800/80 text-[11px] text-slate-700 dark:text-slate-300 italic border-l-2 border-purple-500">
                    "{record.teacher_feedback}"
                  </div>
                {/if}

                <div class="flex items-center justify-between pt-1 text-[11px] text-slate-600 dark:text-slate-300 font-medium">
                  <span>Học sinh: {record.student_name}</span>
                  <button
                    type="button"
                    onclick={() => {
                      deleteParentTestRecord(record.id);
                      parentTestRecords = getParentTestRecords(linkedChild?.id);
                    }}
                    class="text-rose-500 hover:text-rose-700 transition-colors"
                    title="Xóa bản ghi này"
                  >
                    🗑️ Xóa
                  </button>
                </div>
              </div>
            {/each}
          </div>
        {/if}
      </div>

      <!-- Peer Similarity Recommendations for Parent -->
      <div class="mt-6 pt-6 border-t border-purple-100 dark:border-purple-900/40 space-y-4">
        <div class="flex items-center justify-between">
          <div class="flex items-center gap-2">
            <span class="text-lg">💡</span>
            <h3 class="text-base font-heading font-semibold text-slate-900 dark:text-white">
              Gợi Ý Đồng Hành Dành Cho Con (Dựa Trên Hồ Sơ Tương Đồng)
            </h3>
          </div>
          <span class="text-xs text-purple-600 dark:text-purple-400 font-bold bg-purple-100 dark:bg-purple-950 px-2.5 py-1 rounded-full">
            Dữ liệu tổng hợp từ các bạn cùng tiến
          </span>
        </div>

        <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
          {#each childRecommendations as rec}
            <div class="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-purple-200/80 dark:border-purple-800/50 shadow-sm space-y-2">
              <div class="flex items-center justify-between">
                <span class="text-[10px] font-medium uppercase px-2 py-0.5 rounded-full bg-purple-100 dark:bg-purple-900/60 text-purple-700 dark:text-purple-300">
                  {rec.tag}
                </span>
                <span class="text-[11px] font-bold text-emerald-600 dark:text-emerald-400">
                  ✨ {rec.highlight}
                </span>
              </div>
              <h4 class="text-sm font-bold text-slate-900 dark:text-white">{rec.title}</h4>
              <p class="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">{rec.content}</p>
            </div>
          {/each}
        </div>

        <div class="pt-2 flex flex-wrap items-center gap-3">
          <a
            href="/evaluations"
            class="px-5 py-2.5 rounded-xl bg-purple-600 hover:bg-purple-500 text-white font-bold text-xs shadow-md transition-all flex items-center gap-2"
          >
            <span>📊 Xem Toàn Bộ Đánh Giá Năng Lực Của Con</span>
          </a>
          <a
            href="/exam"
            class="px-5 py-2.5 rounded-xl bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-200 font-bold text-xs hover:border-purple-500 transition-all flex items-center gap-2"
          >
            <span>📝 Cùng Con Thi Thử 15 Phút</span>
          </a>
        </div>
      </div>
    </div>

  <!-- ========================================================================= -->
  <!-- ROLE SPECIFIC SECTION: TEACHER VIEW ("CỔNG GIÁO VIÊN & ĐIỀU PHỐI LỚP HỌC") -->
  <!-- ========================================================================= -->
  {:else if isTeacher}
    <div class="rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-6 sm:p-8 shadow-xl">
      <div class="flex flex-col md:flex-row md:items-center justify-between gap-6 pb-6 border-b border-teal-100 dark:border-teal-900/40">
        <div class="space-y-2">
          <div class="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-semibold bg-teal-600 text-white tracking-wider">
            <span>👨‍🏫 CỔNG GIÁO VIÊN &amp; ĐIỀU PHỐI LỚP HỌC</span>
          </div>
          <h1 class="text-2xl sm:text-3xl font-heading font-semibold text-slate-900 dark:text-white">
            Kính chào Thầy/Cô {currentUser.name}! 🌟
          </h1>
          <p class="text-xs sm:text-sm text-slate-600 dark:text-slate-300">
            Hệ thống Tiếng Anh Cô Dung: Quản lý thời khóa biểu, điểm danh, sổ đầu bài, đánh giá học sinh và báo cáo Leader.
          </p>
        </div>

        <div class="flex items-center gap-3">
          <a
            href="/schedule"
            class="px-4 py-2.5 rounded-xl bg-teal-600 hover:bg-teal-500 text-white font-medium text-xs shadow-md shadow-teal-600/25 transition-all hover:scale-105 flex items-center gap-2"
          >
            <span>📅 Điểm Danh &amp; Lịch Dạy</span>
          </a>
          <a
            href="/admin"
            class="px-4 py-2.5 rounded-xl bg-white dark:bg-slate-800 border border-teal-300 dark:border-teal-700 text-teal-700 dark:text-teal-300 font-bold text-xs hover:bg-teal-50 transition-all flex items-center gap-1.5"
          >
            <span>⚙️ Teacher CP &amp; Sổ Đầu Bài</span>
          </a>
        </div>
      </div>

      <!-- Quick Metrics Grid -->
      <div class="grid grid-cols-1 sm:grid-cols-3 gap-4 my-6">
        <a
          href="/schedule"
          class="p-5 rounded-2xl bg-white dark:bg-slate-800/80 border border-slate-200 dark:border-slate-800 shadow-sm hover:border-teal-500 transition-all flex items-center gap-4 group"
        >
          <div class="w-12 h-12 rounded-2xl bg-teal-500/10 text-teal-600 dark:text-teal-400 flex items-center justify-center text-2xl font-bold group-hover:scale-110 transition-transform">
            ⏱️
          </div>
          <div>
            <div class="text-xs text-slate-700 dark:text-slate-300 font-bold uppercase">Ca Dạy &amp; Lịch Học</div>
            <div class="text-base font-heading font-semibold text-slate-900 dark:text-white">Điểm danh 1 chạm</div>
            <div class="text-[11px] text-teal-700 dark:text-teal-400 font-bold">Tự động báo phụ huynh đón 10p</div>
          </div>
        </a>

        <a
          href="/evaluations"
          class="p-5 rounded-2xl bg-white dark:bg-slate-800/80 border border-slate-200 dark:border-slate-800 shadow-sm hover:border-purple-500 transition-all flex items-center gap-4 group"
        >
          <div class="w-12 h-12 rounded-2xl bg-purple-500/10 text-purple-600 dark:text-purple-400 flex items-center justify-center text-2xl font-bold group-hover:scale-110 transition-transform">
            📝
          </div>
          <div>
            <div class="text-xs text-slate-700 dark:text-slate-300 font-bold uppercase">Đánh Giá Năng Lực</div>
            <div class="text-base font-heading font-semibold text-slate-900 dark:text-white">Nhận xét học viên</div>
            <div class="text-[11px] text-purple-700 dark:text-purple-400 font-bold">Đồng bộ Zalo Bot &amp; Leader</div>
          </div>
        </a>

        <a
          href="/pedagogy"
          class="p-5 rounded-2xl bg-white dark:bg-slate-800/80 border border-slate-200 dark:border-slate-800 shadow-sm hover:border-emerald-500 transition-all flex items-center gap-4 group"
        >
          <div class="w-12 h-12 rounded-2xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 flex items-center justify-center text-2xl font-bold group-hover:scale-110 transition-transform">
            📚
          </div>
          <div>
            <div class="text-xs text-slate-700 dark:text-slate-300 font-bold uppercase">Giáo Án 5512 &amp; Bản Ngữ</div>
            <div class="text-base font-heading font-semibold text-slate-900 dark:text-white">Kho Học Liệu Chuẩn</div>
            <div class="text-[11px] text-emerald-700 dark:text-emerald-400 font-bold">Phương pháp Co-Teaching 2026</div>
          </div>
        </a>
      </div>
    </div>

  <!-- ========================================================================= -->
  <!-- ROLE SPECIFIC SECTION 2: PRIMARY STUDENTS (LỚP 1 - 5) -->
  <!-- ========================================================================= -->
  {:else if isPrimaryStudent}
    <div class="rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-6 sm:p-8 shadow-xl">
      <div class="flex flex-col md:flex-row md:items-center justify-between gap-6 pb-6 border-b border-amber-200/60 dark:border-amber-900/40">
        <div class="space-y-2">
          <div class="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-semibold bg-amber-500 text-white tracking-wider shadow-sm">
            <span>🎒 GÓC HỌC TẬP TIỂU HỌC VUI VẺ ({userGrade})</span>
          </div>
          <h1 class="text-2xl sm:text-4xl font-heading font-semibold text-slate-900 dark:text-white">
            Xin chào {currentUser.name}! 🌟
          </h1>
          <p class="text-xs sm:text-sm text-slate-600 dark:text-slate-300">
            Hôm nay bạn nhỏ cùng luyện đọc Phonics, tích thật nhiều Sao thưởng để giảm học phí nhé!
          </p>
        </div>

        <!-- Star Piggy Bank -->
        <div class="p-4 rounded-2xl bg-amber-500 text-white shadow-lg flex items-center gap-4 relative overflow-hidden">
          <div class="text-4xl animate-bounce">⭐</div>
          <div>
            <div class="text-[11px] font-bold uppercase tracking-wider text-amber-100">Ví Sao Thưởng Của Bé</div>
            <div class="text-2xl font-heading font-semibold">{studentStars} Sao</div>
            <div class="text-[11px] font-bold text-amber-100">
              = {(studentStars * 10).toLocaleString('vi-VN')}đ trừ học phí
            </div>
          </div>
        </div>
      </div>

      {#if starRewardNotice}
        <div class="p-3 my-4 rounded-2xl bg-emerald-500 text-white text-xs font-bold flex items-center justify-center gap-2 shadow-lg animate-in zoom-in-95 duration-200">
          <span>🎉 Hoan hô! Bé vừa phát âm xuất sắc và nhận thêm 5 Sao thưởng! (+5 ⭐)</span>
        </div>
      {/if}

      <!-- Interactive Phonics Sound Pad -->
      <div class="mt-6 space-y-4">
        <div class="flex items-center justify-between">
          <div>
            <h3 class="text-lg font-heading font-semibold text-slate-900 dark:text-white flex items-center gap-2">
              <span>🔊</span> <span>Bảng Âm Phonics 1 Chạm (Bấm Để Nghe &amp; Tích Sao)</span>
            </h3>
            <p class="text-xs text-slate-500 dark:text-slate-400">Giọng chuẩn Anh - Mỹ bản ngữ, bấm vào hình để nghe đọc mẫu:</p>
          </div>
        </div>

        <div class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-3">
          {#each primaryPhonics as card}
            <button
              type="button"
              onclick={() => playPhonics(card)}
              class="p-4 rounded-2xl bg-white dark:bg-slate-800 border-2 {selectedPrimaryWord === card.word ? 'border-amber-500 shadow-amber-500/20' : 'border-slate-200 dark:border-slate-700'} hover:border-amber-400 shadow-md transition-all hover:scale-105 active:scale-95 text-center flex flex-col items-center justify-between group"
            >
              <div class="text-4xl group-hover:scale-110 transition-transform">{card.emoji}</div>
              <div class="mt-2 font-heading font-semibold text-base text-slate-900 dark:text-white">{card.word}</div>
              <div class="text-[11px] text-amber-600 dark:text-amber-400 font-mono font-bold">{card.ipa}</div>
              <div class="text-[11px] text-slate-500 dark:text-slate-400">{card.meaning}</div>
              <div class="mt-2 text-[10px] text-emerald-600 dark:text-emerald-400 font-medium flex items-center gap-0.5">
                <span>🔊 Bấm nghe</span>
              </div>
            </button>
          {/each}
        </div>

        <!-- Quick Primary Games Launcher -->
        <div class="pt-4 grid grid-cols-1 sm:grid-cols-3 gap-3">
          <a
            href="/games"
            class="p-4 rounded-2xl bg-sky-600 text-white shadow-md hover:scale-[1.02] transition-all flex items-center gap-3"
          >
            <span class="text-3xl">🎮</span>
            <div>
              <div class="font-bold text-sm">Trò Chơi Nối Từ</div>
              <div class="text-xs text-emerald-100">Ghép hình và từ vựng nhận sao</div>
            </div>
          </a>

          <a
            href="/flashcards"
            class="p-4 rounded-2xl bg-slate-700 text-white shadow-md hover:scale-[1.02] transition-all flex items-center gap-3"
          >
            <span class="text-3xl">🎴</span>
            <div>
              <div class="font-bold text-sm">Thẻ Flashcard Hình Ảnh</div>
              <div class="text-xs text-indigo-100">Từ vựng Cambridge Starters</div>
            </div>
          </a>

          <a
            href="/exam"
            class="p-4 rounded-2xl bg-amber-600 text-white shadow-md hover:scale-[1.02] transition-all flex items-center gap-3"
          >
            <span class="text-3xl">⚡</span>
            <div>
              <div class="font-bold text-sm">Đố Vui 5 Phút Có Thưởng</div>
              <div class="text-xs text-amber-100">Kiểm tra nhanh nhận 50 sao</div>
            </div>
          </a>
        </div>
      </div>
    </div>

  <!-- ========================================================================= -->
  <!-- ROLE SPECIFIC SECTION 3: SECONDARY STUDENTS (LỚP 6 - 9) -->
  <!-- ========================================================================= -->
  {:else if isSecondaryStudent}
    <div class="rounded-3xl bg-gradient-to-br from-teal-50 via-white to-slate-50 dark:from-slate-900 dark:via-teal-950/20 dark:to-slate-950 border border-teal-200 dark:border-teal-800/40 p-6 sm:p-8 shadow-xl">
      <div class="flex flex-col md:flex-row md:items-center justify-between gap-6 pb-6 border-b border-teal-200/60 dark:border-teal-900/40">
        <div class="space-y-2">
          <div class="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-semibold bg-teal-600 text-white tracking-wider">
            <span>🌱 KHỐI TRUNG HỌC CƠ SỞ ({userGrade})</span>
          </div>
          <h1 class="text-2xl sm:text-3xl font-heading font-semibold text-slate-900 dark:text-white">
            Chào mừng {currentUser.name}! Chinh Phục Điểm 9+ Cùng Cô Dung 🎯
          </h1>
          <p class="text-xs sm:text-sm text-slate-600 dark:text-slate-300">
            Chương trình Global Success &amp; Friends Plus 2026. Luyện đề 15p - 45p và bứt phá chứng chỉ Cambridge KET / PET.
          </p>
        </div>

        <div class="p-4 rounded-2xl bg-white dark:bg-slate-800 border border-teal-200 dark:border-teal-700 shadow-sm flex items-center gap-4">
          <div class="text-3xl">⭐</div>
          <div>
            <div class="text-xs text-slate-700 dark:text-slate-300 font-bold uppercase">Sao Thưởng &amp; Giảm Học Phí</div>
            <div class="text-xl font-heading font-semibold text-emerald-600 dark:text-emerald-400">{studentStars} Sao</div>
            <div class="text-[11px] text-emerald-700 dark:text-emerald-300 font-bold">={(studentStars * 10).toLocaleString('vi-VN')} VNĐ trừ học phí</div>
          </div>
        </div>
      </div>

      <!-- Quick 15m/45m Secondary Launchers -->
      <div class="grid grid-cols-1 sm:grid-cols-3 gap-4 mt-6">
        <a
          href="/exam"
          class="p-5 rounded-2xl bg-white dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 hover:border-emerald-500 shadow-sm hover:shadow-md transition-all flex items-center gap-4"
        >
          <div class="w-12 h-12 rounded-xl bg-red-500/10 text-red-600 dark:text-red-400 flex items-center justify-center text-2xl font-bold">
            ⚡
          </div>
          <div>
            <div class="font-bold text-sm text-slate-900 dark:text-white">Kiểm Tra Nhanh 15 Phút</div>
            <div class="text-xs text-slate-700 dark:text-slate-300 font-medium">10 câu trắc nghiệm ngữ pháp Unit</div>
          </div>
        </a>

        <a
          href="/exam"
          class="p-5 rounded-2xl bg-white dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 hover:border-indigo-500 shadow-sm hover:shadow-md transition-all flex items-center gap-4"
        >
          <div class="w-12 h-12 rounded-xl bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 flex items-center justify-center text-2xl font-bold">
            ⏱️
          </div>
          <div>
            <div class="font-bold text-sm text-slate-900 dark:text-white">Đề Thi 1 Tiết 45 Phút</div>
            <div class="text-xs text-slate-700 dark:text-slate-300 font-medium">Chuẩn ma trận Giữa kỳ / Cuối kỳ Bộ GD</div>
          </div>
        </a>

        <a
          href="/dictionary"
          class="p-5 rounded-2xl bg-white dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 hover:border-teal-500 shadow-sm hover:shadow-md transition-all flex items-center gap-4"
        >
          <div class="w-12 h-12 rounded-xl bg-teal-500/10 text-teal-600 dark:text-teal-400 flex items-center justify-center text-2xl font-bold">
            📖
          </div>
          <div>
            <div class="font-bold text-sm text-slate-900 dark:text-white">Từ Vựng Cambridge KET/PET</div>
            <div class="text-xs text-slate-700 dark:text-slate-300 font-medium">Tra cứu nhanh &amp; nội suy câu ví dụ</div>
          </div>
        </a>
      </div>
    </div>

  <!-- ========================================================================= -->
  <!-- ROLE SPECIFIC SECTION 4: HIGH SCHOOL / IELTS / TOEIC (LỚP 10 - 12) -->
  <!-- ========================================================================= -->
  {:else if isHighSchoolStudent}
    <div class="rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-6 sm:p-8 shadow-xl">
      <div class="flex flex-col md:flex-row md:items-center justify-between gap-6 pb-6 border-b border-indigo-200/60 dark:border-indigo-900/40">
        <div class="space-y-2">
          <div class="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-semibold bg-indigo-600 text-white tracking-wider">
            <span>🔥 ÔN THI ĐẠI HỌC THPTQG 2026 &amp; IELTS BAND 7.5+</span>
          </div>
          <h1 class="text-2xl sm:text-3xl font-heading font-semibold text-slate-900 dark:text-white">
            Chiến Dịch Chinh Phục Điểm 10 ĐH &amp; IELTS Cùng Cô Dung 🏛️
          </h1>
          <p class="text-xs sm:text-sm text-slate-600 dark:text-slate-300">
            Học viên: <strong>{currentUser.name}</strong> • Khóa: {userGrade} • Phòng thi bấm giờ tự động theo lộ trình chuẩn quốc tế.
          </p>
        </div>

        <div class="flex items-center gap-3">
          <a
            href="/exam"
            class="px-5 py-3 rounded-2xl bg-indigo-600 hover:bg-indigo-500 text-white font-medium text-xs shadow-lg shadow-indigo-600/25 transition-all hover:scale-105"
          >
            🚀 Vào Phòng Thi Thử Bấm Giờ
          </a>
        </div>
      </div>

      <!-- Academic Modules Grid -->
      <div class="grid grid-cols-1 sm:grid-cols-4 gap-4 mt-6">
        <div class="p-4 rounded-2xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 shadow-sm text-center">
          <div class="text-2xl mb-1">🎧</div>
          <div class="font-bold text-xs text-slate-900 dark:text-white">IELTS Listening</div>
          <div class="text-[11px] text-indigo-600 dark:text-indigo-400 font-bold">Audio bản ngữ chuẩn</div>
        </div>

        <div class="p-4 rounded-2xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 shadow-sm text-center">
          <div class="text-2xl mb-1">📖</div>
          <div class="font-bold text-xs text-slate-900 dark:text-white">Reading Skimming</div>
          <div class="text-[11px] text-teal-600 dark:text-teal-400 font-bold">Kỹ thuật dò từ khóa nhanh</div>
        </div>

        <div class="p-4 rounded-2xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 shadow-sm text-center">
          <div class="text-2xl mb-1">✍️</div>
          <div class="font-bold text-xs text-slate-900 dark:text-white">Writing Task 1 &amp; 2</div>
          <div class="text-[11px] text-amber-600 dark:text-amber-400 font-bold">Dàn ý &amp; từ vựng C1/C2</div>
        </div>

        <div class="p-4 rounded-2xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 shadow-sm text-center">
          <div class="text-2xl mb-1">🗣️</div>
          <div class="font-bold text-xs text-slate-900 dark:text-white">Speaking Simulator</div>
          <div class="text-[11px] text-rose-600 dark:text-rose-400 font-bold">Giáo viên bản ngữ phản xạ</div>
        </div>
      </div>
    </div>

  <!-- ========================================================================= -->
  <!-- ROLE SPECIFIC SECTION 5: CERTIFICATE & GENERAL STUDENTS (CAMBRIDGE, IELTS, VSTEP) -->
  <!-- ========================================================================= -->
  {:else if isCertificateOrGeneralStudent || userRole === 'student'}
    <div class="rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-6 sm:p-8 shadow-xl">
      <div class="flex flex-col md:flex-row md:items-center justify-between gap-6 pb-6 border-b border-emerald-200/60 dark:border-emerald-900/40">
        <div class="space-y-2">
          <div class="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-semibold bg-emerald-600 text-white tracking-wider">
            <span>🎒 GÓC HỌC TẬP HỌC SINH ({userGrade || 'Chương Trình Chuẩn'})</span>
          </div>
          <h1 class="text-2xl sm:text-3xl font-heading font-semibold text-slate-900 dark:text-white">
            Chào mừng {currentUser.name}! Chúc Bạn Học Tập Tiến Bộ Vượt Bậc 🎯
          </h1>
          <p class="text-xs sm:text-sm text-slate-600 dark:text-slate-300">
            Khóa học: <strong>{userGrade || 'Chương trình Tiếng Anh Cô Dung'}</strong> • Làm bài kiểm tra định kỳ 15p - 45p và tích lũy Sao đổi giảm trừ học phí!
          </p>
        </div>

        <div class="p-4 rounded-2xl bg-white dark:bg-slate-800 border border-emerald-200 dark:border-emerald-700 shadow-sm flex items-center gap-4 flex-shrink-0">
          <div class="text-3xl animate-bounce">⭐</div>
          <div>
            <div class="text-xs text-slate-700 dark:text-slate-300 font-bold uppercase">Sao Thưởng Của Bạn</div>
            <div class="text-xl font-heading font-semibold text-emerald-600 dark:text-emerald-400">{studentStars} Sao</div>
            <div class="text-[11px] text-emerald-700 dark:text-emerald-300 font-bold">={(studentStars * 10).toLocaleString('vi-VN')} VNĐ trừ học phí</div>
          </div>
        </div>
      </div>

      <!-- Quick Action Modules Grid -->
      <div class="grid grid-cols-1 sm:grid-cols-3 gap-4 mt-6">
        <a
          href="/exam"
          class="p-5 rounded-2xl bg-white dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 hover:border-emerald-500 shadow-sm hover:shadow-md transition-all flex items-center gap-4"
        >
          <div class="w-12 h-12 rounded-xl bg-red-500/10 text-red-600 dark:text-red-400 flex items-center justify-center text-2xl font-bold">
            ⚡
          </div>
          <div>
            <div class="font-bold text-sm text-slate-900 dark:text-white">Luyện Đề 15 Phút Có Thưởng</div>
            <div class="text-xs text-slate-700 dark:text-slate-300 font-medium">Kiểm tra từ vựng &amp; phản xạ nhận sao</div>
          </div>
        </a>

        <a
          href="/exam"
          class="p-5 rounded-2xl bg-white dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 hover:border-indigo-500 shadow-sm hover:shadow-md transition-all flex items-center gap-4"
        >
          <div class="w-12 h-12 rounded-xl bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 flex items-center justify-center text-2xl font-bold">
            ⏱️
          </div>
          <div>
            <div class="font-bold text-sm text-slate-900 dark:text-white">Đề Thi 1 Tiết 45 Phút</div>
            <div class="text-xs text-slate-700 dark:text-slate-300 font-medium">Chuẩn khung năng lực Cambridge &amp; BGD</div>
          </div>
        </a>

        <a
          href="/dictionary"
          class="p-5 rounded-2xl bg-white dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 hover:border-teal-500 shadow-sm hover:shadow-md transition-all flex items-center gap-4"
        >
          <div class="w-12 h-12 rounded-xl bg-teal-500/10 text-teal-600 dark:text-teal-400 flex items-center justify-center text-2xl font-bold">
            📖
          </div>
          <div>
            <div class="font-bold text-sm text-slate-900 dark:text-white">Từ Điển Phát Âm Phonics</div>
            <div class="text-xs text-slate-700 dark:text-slate-300 font-medium">Tra cứu nhanh &amp; luyện phát âm bản ngữ</div>
          </div>
        </a>
      </div>
    </div>

  <!-- ========================================================================= -->
  <!-- DEFAULT / GUEST / ALL HERO BANNER (REFINED FIGMA / LOVABLE DESIGN) -->
  <!-- ========================================================================= -->
  {:else}
    <div class="rounded-3xl bg-white dark:bg-slate-900/90 border border-slate-200 dark:border-slate-800 p-8 sm:p-12 shadow-xl relative overflow-hidden">
      <!-- Subtle background ambient gradient -->
      <div class="absolute -right-20 -top-20 w-80 h-80 rounded-full bg-emerald-500/5 dark:bg-emerald-500/10 blur-3xl pointer-events-none"></div>
      <div class="absolute -left-20 -bottom-20 w-80 h-80 rounded-full bg-teal-500/5 dark:bg-cyan-500/10 blur-3xl pointer-events-none"></div>

      <div class="relative z-10 max-w-4xl space-y-6">
        <div class="flex flex-wrap items-center gap-2">
          <span class="px-3 py-1 rounded-full text-xs font-semibold bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border border-emerald-500/30 tracking-wider">
            TIẾNG ANH CÔ DUNG • CHƯƠNG TRÌNH 2026
          </span>
          <span class="px-3 py-1 rounded-full text-xs font-bold bg-indigo-500/10 text-indigo-700 dark:text-indigo-400 border border-indigo-500/30">
            K12 Toàn Cấp (Lớp 1 - 12) • Ôn Thi ĐH • IELTS • TOEIC
          </span>
          <span class="px-3 py-1 rounded-full text-xs font-bold bg-amber-500/10 text-amber-700 dark:text-amber-300 border border-amber-500/30">
            ⭐ 100 Sao = 1.000đ Trừ Học Phí
          </span>
        </div>

        <h1 class="text-3xl sm:text-5xl font-heading font-semibold text-slate-900 dark:text-white tracking-tight leading-tight">
          Học Viện Tiếng Anh Cô Dung <br />
          <span class="text-sky-600 dark:text-sky-400">
            Đào Tạo &amp; Lộ Trình Chuẩn Quốc Tế
          </span>
        </h1>

        <p class="text-sm sm:text-base text-slate-600 dark:text-slate-300 max-w-2xl leading-relaxed">
          Nền tảng học Tiếng Anh bám sát chương trình Giáo khoa hiện hành 2026 kết hợp giáo viên bản ngữ,
          ngân hàng đề kiểm tra 15p - 45p, cơ chế tích Sao đổi học phí và hệ thống báo cáo đa chiều cho phụ huynh qua Zalo.
        </p>

        <!-- Action Launchers -->
        <div class="flex flex-wrap items-center gap-3 pt-2">
          <a
            href="/exam"
            class="px-6 py-3.5 rounded-2xl bg-sky-600 hover:bg-sky-500 text-white font-medium text-xs sm:text-sm shadow-sm transition-all hover:scale-105 flex items-center gap-2"
          >
            <span>⚡ Thi Thử Nhanh 15 Phút</span>
          </a>

          <a
            href="/exam"
            class="px-6 py-3.5 rounded-2xl bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 font-medium text-xs sm:text-sm border border-slate-300 dark:border-slate-700 shadow-sm transition-all hover:scale-105 flex items-center gap-2"
          >
            <span>⏱️ Đề 1 Tiết 45 Phút Chuẩn Bộ</span>
          </a>

          <a
            href="/evaluations"
            class="px-5 py-3.5 rounded-2xl bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 text-purple-700 dark:text-purple-300 font-bold text-xs sm:text-sm border border-slate-300 dark:border-slate-700 shadow-sm transition-all flex items-center gap-2"
          >
            <span>📊 Đánh Giá Năng Lực Học Viên</span>
          </a>

          <a
            href="/pedagogy"
            class="px-5 py-3.5 rounded-2xl bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 text-teal-700 dark:text-teal-400 font-bold text-xs sm:text-sm border border-slate-300 dark:border-slate-700 shadow-sm transition-all flex items-center gap-2"
          >
            <span>👨‍🏫 Cẩm Nang Bản Ngữ &amp; 5512</span>
          </a>
        </div>
      </div>
    </div>
  {/if}

  <!-- QUICK STATS COUNTER BAR (CLEAN FIGMA STYLE) -->
  <div class="grid grid-cols-2 md:grid-cols-4 gap-4">
    <div class="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 flex items-center gap-4 shadow-sm">
      <div class="w-12 h-12 rounded-xl bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 flex items-center justify-center text-2xl font-bold">
        📚
      </div>
      <div>
        <div class="text-2xl font-heading font-semibold text-slate-900 dark:text-white">{data.curricula.length}</div>
        <div class="text-[11px] text-slate-700 dark:text-slate-300 font-medium uppercase">Cấp Bậc &amp; Chương Trình</div>
      </div>
    </div>

    <div class="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 flex items-center gap-4 shadow-sm">
      <div class="w-12 h-12 rounded-xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 flex items-center justify-center text-2xl font-bold">
        📝
      </div>
      <div>
        <div class="text-2xl font-heading font-semibold text-slate-900 dark:text-white">{data.exams.length}</div>
        <div class="text-[11px] text-slate-700 dark:text-slate-300 font-medium uppercase">Bộ Đề Thi 15p - 45p</div>
      </div>
    </div>

    <div class="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 flex items-center gap-4 shadow-sm">
      <div class="w-12 h-12 rounded-xl bg-purple-500/10 text-purple-600 dark:text-purple-400 flex items-center justify-center text-2xl font-bold">
        📊
      </div>
      <div>
        <div class="text-2xl font-heading font-semibold text-slate-900 dark:text-white">{data.evaluations.length}</div>
        <div class="text-[11px] text-slate-700 dark:text-slate-300 font-medium uppercase">Hồ Sơ Năng Khiếu</div>
      </div>
    </div>

    <div class="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 flex items-center gap-4 shadow-sm">
      <div class="w-12 h-12 rounded-xl bg-amber-500/10 text-amber-600 dark:text-amber-400 flex items-center justify-center text-2xl font-bold">
        ⭐
      </div>
      <div>
        <div class="text-2xl font-heading font-semibold text-amber-600 dark:text-amber-400">100 : 1.000</div>
        <div class="text-[11px] text-slate-700 dark:text-slate-300 font-medium uppercase">Tỷ Lệ Đổi Học Phí</div>
      </div>
    </div>
  </div>

  <!-- NOTIFICATION BANNER FOR CLASS UNLOCK REQUEST -->
  {#if unlockNotice}
    <div class="p-4 rounded-2xl bg-emerald-600 text-white font-bold text-xs shadow-xl animate-in slide-in-from-top-2 flex items-center justify-between gap-3">
      <div class="flex items-center gap-2">
        <span class="text-xl">🔔</span>
        <span>{unlockNotice}</span>
      </div>
      <button onclick={() => unlockNotice = ''} class="text-white hover:opacity-80 text-sm">✕</button>
    </div>
  {/if}

  <!-- CURRICULUM SECTION: ROLE ISOLATED -->
  {#if targetStudentUser || currentUser?.role === 'student'}
    <!-- ================= STUDENT / PARENT VIEW: ONLY ENROLLED CLASSES SHOWN ================= -->
    <div class="space-y-6">
      <!-- Section 1: Active Enrolled Curriculum -->
      <div class="rounded-3xl bg-white dark:bg-slate-900 border-2 border-sky-500/50 p-6 sm:p-8 shadow-xl">
        <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-6 border-b border-emerald-200/60 dark:border-emerald-900/40">
          <div>
            <div class="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-semibold bg-emerald-600 text-white tracking-wider shadow-sm">
              <span>📚 LỚP HỌC CHÍNH KHÓA ĐÃ GHI DANH</span>
            </div>
            <h2 class="text-2xl sm:text-3xl font-heading font-semibold text-slate-900 dark:text-white mt-2">
              Khóa Học Của Em: {enrolledGrades.join(' • ') || 'Lớp 7'} 🎓
            </h2>
            <p class="text-xs sm:text-sm text-slate-600 dark:text-slate-300 mt-1">
              Học viên: <strong class="text-emerald-700 dark:text-emerald-400">{(targetStudentUser || currentUser)?.name || 'Học viên'}</strong> • 
              Hệ thống được thiết kế độc quyền riêng cho khối lớp của em. Hoàn thành đề thi và từ vựng mỗi ngày để nhận Sao!
            </p>
          </div>

          <div class="px-4 py-2.5 rounded-2xl bg-white dark:bg-slate-800 border border-emerald-200 dark:border-emerald-700/60 shadow-sm flex items-center gap-3 flex-shrink-0">
            <span class="text-2xl">🛡️</span>
            <div>
              <div class="text-[10px] font-bold text-slate-400 uppercase">Quyền Truy Cập</div>
              <div class="text-xs font-medium text-emerald-600 dark:text-emerald-400">Đã Khóa Các Khối Khác</div>
            </div>
          </div>
        </div>

        <!-- Enrolled Curricula Cards Grid (Only enrolled classes appear here!) -->
        <div class="grid grid-cols-1 md:grid-cols-2 gap-5 mt-6">
          {#each studentEnrolledCurricula as curr}
            <div class="rounded-2xl bg-white dark:bg-slate-800 border-2 border-emerald-500 p-6 shadow-md flex flex-col justify-between group hover:shadow-xl transition-all">
              <div class="space-y-4">
                <div class="flex items-center justify-between">
                  <div class="flex items-center gap-3">
                    <span class="text-3xl p-3 rounded-2xl bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-200 dark:border-emerald-800">
                      {curr.icon || '🚀'}
                    </span>
                    <div>
                      <span class="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-medium bg-emerald-100 text-emerald-800 dark:bg-emerald-900/60 dark:text-emerald-300 border border-emerald-300/40 uppercase">
                        <span>✓</span> <span>Đang Theo Học</span>
                      </span>
                      <h3 class="font-heading font-semibold text-xl text-slate-900 dark:text-white mt-1">
                        {curr.title}
                      </h3>
                    </div>
                  </div>
                  <span class="text-xs font-mono font-bold text-emerald-600 dark:text-emerald-400">
                    GDPT 2026
                  </span>
                </div>

                <p class="text-xs sm:text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
                  {curr.description}
                </p>

                <div class="flex flex-wrap items-center gap-2 pt-1 text-[11px] font-semibold text-slate-500 dark:text-slate-400">
                  <span class="px-2.5 py-1 rounded-lg bg-slate-100 dark:bg-slate-700/60 text-slate-700 dark:text-slate-300">
                    📖 12 Units Chuẩn Bộ
                  </span>
                  <span class="px-2.5 py-1 rounded-lg bg-slate-100 dark:bg-slate-700/60 text-slate-700 dark:text-slate-300">
                    ⚡ Đề 15p &amp; 45p
                  </span>
                  <span class="px-2.5 py-1 rounded-lg bg-slate-100 dark:bg-slate-700/60 text-slate-700 dark:text-slate-300">
                    🎙️ Luyện Phát Âm
                  </span>
                </div>
              </div>

              <!-- Quick Learning Actions for Enrolled Grade -->
              <div class="mt-6 pt-4 border-t border-slate-100 dark:border-slate-700/60 flex flex-wrap items-center gap-2">
                <a
                  href="/exam"
                  class="flex-1 min-w-[140px] px-4 py-2.5 rounded-xl bg-sky-600 hover:bg-sky-500 text-white font-bold text-xs text-center shadow-md shadow-emerald-600/20 transition-all flex items-center justify-center gap-1.5"
                >
                  <span>🚀 Vào Học Ngay</span>
                  <span>➔</span>
                </a>
                <a
                  href="/exam"
                  class="px-3.5 py-2.5 rounded-xl bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600 text-slate-800 dark:text-slate-200 font-bold text-xs text-center transition-all flex items-center gap-1"
                >
                  <span>⏱️ Làm Test 15p</span>
                </a>
                <a
                  href="/dictionary"
                  class="px-3.5 py-2.5 rounded-xl bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600 text-slate-800 dark:text-slate-200 font-bold text-xs text-center transition-all flex items-center gap-1"
                >
                  <span>📖 Từ Điển</span>
                </a>
              </div>
            </div>
          {/each}
        </div>
      </div>

      <!-- Section 2: Other Locked Classes (Chỉ Được Set Thêm Sau) -->
      <div class="rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-6 sm:p-8 shadow-sm space-y-4">
        <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div class="flex items-start gap-3">
            <div class="w-10 h-10 rounded-2xl bg-amber-500/10 text-amber-600 dark:text-amber-400 flex items-center justify-center text-xl flex-shrink-0">
              🔒
            </div>
            <div>
              <div class="flex items-center gap-2">
                <h3 class="font-heading font-semibold text-base sm:text-lg text-slate-900 dark:text-white">
                  Các Khối Lớp &amp; Chương Trình Khác ({studentLockedCurricula.length} Môn)
                </h3>
                <span class="text-[10px] font-medium px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-700 dark:text-amber-300 border border-amber-300/40 uppercase">
                  Chỉ Được Set Thêm Sau
                </span>
              </div>
              <p class="text-xs text-slate-500 dark:text-slate-400 mt-0.5 leading-relaxed">
                Học sinh chỉ được học đúng lớp đã đăng ký. Bạn chưa được phân bổ vào các lớp này.
                Nếu muốn học vượt cấp (Lớp 8, 9...), luyện thi chứng chỉ (IELTS, TOEIC...) hoặc chuyển lớp, hãy gửi yêu cầu để Leader Cô Dung duyệt và set thêm vào tài khoản của bạn.
              </p>
            </div>
          </div>

          <button
            onclick={() => showLockedCurricula = !showLockedCurricula}
            class="px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 font-bold text-xs flex items-center justify-center gap-2 transition-all flex-shrink-0"
          >
            <span>{showLockedCurricula ? '▲ Thu Gọn' : '▼ Xem Các Lớp Khác & Yêu Cầu Mở'}</span>
          </button>
        </div>

        {#if showLockedCurricula}
          <div class="pt-4 border-t border-slate-100 dark:border-slate-800 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 animate-in fade-in duration-200">
            {#each studentLockedCurricula as curr}
              <div class="rounded-2xl bg-slate-50/80 dark:bg-slate-950/60 border border-slate-200 dark:border-slate-800 p-5 flex flex-col justify-between opacity-80 hover:opacity-100 transition-all">
                <div class="space-y-2">
                  <div class="flex items-center justify-between">
                    <span class="text-2xl p-2 rounded-xl bg-slate-200/60 dark:bg-slate-800 text-slate-500">
                      🔒 {curr.icon || '📖'}
                    </span>
                    <span class="text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-200 text-slate-600 dark:bg-slate-800 dark:text-slate-400 uppercase">
                      Chưa Mở Khóa
                    </span>
                  </div>

                  <div>
                    <h4 class="font-heading font-semibold text-sm text-slate-800 dark:text-slate-200">
                      {curr.title}
                    </h4>
                    <p class="text-xs text-slate-500 dark:text-slate-400 mt-1 line-clamp-2">
                      {curr.description}
                    </p>
                  </div>
                </div>

                <div class="mt-4 pt-3 border-t border-slate-200/60 dark:border-slate-800/80 flex items-center justify-between">
                  <button
                    onclick={() => handleRequestUnlock(curr)}
                    disabled={isRequestingUnlock}
                    class="w-full py-2 px-3 rounded-xl bg-amber-500/10 hover:bg-amber-500/20 text-amber-700 dark:text-amber-300 font-bold text-xs border border-amber-300/40 transition-all flex items-center justify-center gap-1.5"
                  >
                    <span>➕ Báo Cô Dung Mở Thêm Lớp Này</span>
                  </button>
                </div>
              </div>
            {/each}
          </div>
        {/if}
      </div>
    </div>
  {:else}
    <!-- ================= TEACHER / ADMIN / GUEST VIEW: FULL CATALOG EXPLORER ================= -->
    <div id="curriculum-section" class="space-y-6 scroll-mt-20">
      <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div class="flex items-center gap-2">
            <span class="text-xs font-bold text-emerald-600 dark:text-emerald-400 uppercase tracking-wider">HỆ THỐNG PHÂN CẤP ĐÀO TẠO</span>
            {#if isTeacherOrAdmin(currentUser)}
              <span class="text-[10px] font-medium px-2 py-0.5 rounded-full bg-purple-500/10 text-purple-700 dark:text-purple-300 border border-purple-500/30">
                👨‍🏫 Toàn Quyền Quản Lý 19 Khối Lớp
              </span>
            {/if}
          </div>
          <h2 class="text-2xl font-heading font-semibold text-slate-900 dark:text-white mt-0.5">Khung Chương Trình Toàn Cấp K12 &amp; Lộ Trình 2026</h2>
        </div>

        <!-- Category Filter Tabs -->
        <div class="flex items-center gap-1.5 overflow-x-auto pb-1">
          {#each categoryLabels as tab}
            <button
              onclick={() => activeCurriculumTab = tab.key}
              class="px-3.5 py-2 rounded-xl text-xs font-bold transition-all whitespace-nowrap {activeCurriculumTab === tab.key ? 'bg-emerald-600 text-white shadow-md' : 'bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-200 hover:text-emerald-700 dark:hover:text-white border border-slate-300 dark:border-slate-700'}"
            >
              <span>{tab.icon}</span>
              <span class="ml-1">{tab.label}</span>
            </button>
          {/each}
        </div>
      </div>

      <!-- Curricula Cards Grid -->
      <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {#each filteredCurricula as curr}
          <div class="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 p-5 hover:border-emerald-500/60 dark:hover:border-emerald-500/50 hover:shadow-lg transition-all flex flex-col justify-between shadow-sm group">
            <div class="space-y-3">
              <div class="flex items-center justify-between">
                <span class="text-2xl p-2.5 rounded-2xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 group-hover:scale-110 transition-transform">
                  {curr.icon || '📖'}
                </span>
                <span class="text-[10px] font-bold px-2 py-0.5 rounded-full uppercase {curr.category === 'primary' ? 'bg-amber-500/10 text-amber-700 dark:text-amber-300 border border-amber-300/40' : curr.category === 'secondary' ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border border-emerald-300/40' : curr.category === 'high_school' ? 'bg-blue-500/10 text-blue-700 dark:text-blue-300 border border-blue-300/40' : 'bg-purple-500/10 text-purple-700 dark:text-purple-300 border border-purple-300/40'}">
                  {curr.category}
                </span>
              </div>

              <div>
                <h3 class="font-heading font-medium text-base text-slate-900 dark:text-white group-hover:text-emerald-600 dark:group-hover:text-emerald-400 transition-colors">
                  {curr.title}
                </h3>
                <p class="text-xs text-slate-700 dark:text-slate-300 mt-1 leading-relaxed line-clamp-3 font-normal">
                  {curr.description}
                </p>
              </div>
            </div>

            <div class="mt-4 pt-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between">
              <a
                href="/exam"
                class="text-xs font-bold text-emerald-600 dark:text-emerald-400 hover:text-emerald-700 dark:hover:text-emerald-300 flex items-center gap-1"
              >
                <span>Vào Làm Bài Test</span>
                <span>➔</span>
              </a>
              <span class="text-[11px] text-slate-600 dark:text-slate-400 font-mono font-medium">Mã: {curr.code}</span>
            </div>
          </div>
        {/each}
      </div>
    </div>
  {/if}

  <!-- MULTIDIMENSIONAL STUDENT EVALUATION HIGHLIGHT -->
  <div class="rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-8 shadow-sm">
    <div class="flex flex-col lg:flex-row items-center justify-between gap-8">
      <div class="space-y-4 max-w-xl">
        <span class="px-2.5 py-0.5 rounded-full text-xs font-bold bg-purple-500/10 text-purple-700 dark:text-purple-300 border border-purple-500/30">
          ĐẶC QUYỀN GIÁO VIÊN &amp; PHỤ HUYNH
        </span>
        <h2 class="text-2xl md:text-3xl font-heading font-semibold text-slate-900 dark:text-white leading-snug">
          Phân Tích Năng Khiếu Đa Chiều &amp; Báo Cáo Sớm Cho Phụ Huynh
        </h2>
        <p class="text-xs sm:text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
          Không chỉ dừng ở con điểm số khô khan! Hệ thống tự động phân loại học sinh theo 5 thiên hướng năng lực:
          <strong>Nghe - Nói giao tiếp</strong>, <strong>Đọc - Viết học thuật</strong>, <strong>Tư duy Ngữ pháp</strong>, <strong>Năng khiếu toàn diện (Polyglot)</strong> hoặc <strong>Cần củng cố nền tảng</strong>.
          Kế hoạch đồng hành 1-3 tháng cụ thể được sinh ra để gia đình và cô giáo kịp thời hỗ trợ các con.
        </p>

        <div class="pt-2 flex flex-wrap items-center gap-3">
          <a
            href="/evaluations"
            class="px-5 py-2.5 rounded-xl bg-purple-600 hover:bg-purple-500 text-white font-bold text-xs shadow-md flex items-center gap-2"
          >
            <span>📊 Mở Hồ Sơ Đánh Giá Học Viên</span>
          </a>
          {#if isTeacherOrAdmin(currentUser)}
            <a
              href="/admin"
              class="px-5 py-2.5 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 font-bold text-xs border border-slate-200 dark:border-slate-700"
            >
              <span>⚙️ Quản Trị Cấp Cao (Admin CP)</span>
            </a>
          {/if}
        </div>
      </div>

      <!-- Visual Aptitude Badges Preview Box -->
      <div class="w-full lg:w-96 p-6 rounded-2xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 space-y-3">
        <div class="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-2">5 Thiên Hướng Năng Lực Chuẩn:</div>
        
        <div class="p-2.5 rounded-xl bg-blue-500/10 border border-blue-500/20 text-blue-700 dark:text-blue-300 text-xs font-bold flex items-center gap-2">
          <span>🎧</span>
          <span>Thiên hướng Nghe - Nói Phản Xạ</span>
        </div>
        <div class="p-2.5 rounded-xl bg-purple-500/10 border border-purple-500/20 text-purple-700 dark:text-purple-300 text-xs font-bold flex items-center gap-2">
          <span>📖</span>
          <span>Thiên hướng Đọc - Viết Học Thuật</span>
        </div>
        <div class="p-2.5 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-700 dark:text-amber-300 text-xs font-bold flex items-center gap-2">
          <span>🧠</span>
          <span>Tư Duy Ngữ Pháp &amp; Phân Tích Logic</span>
        </div>
        <div class="p-2.5 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-700 dark:text-emerald-300 text-xs font-bold flex items-center gap-2">
          <span>🌟</span>
          <span>Năng Khiếu Ngôn Ngữ Toàn Diện (Polyglot)</span>
        </div>
        <div class="p-2.5 rounded-xl bg-orange-500/10 border border-orange-500/20 text-orange-700 dark:text-orange-300 text-xs font-bold flex items-center gap-2">
          <span>🛡️</span>
          <span>Cần Củng Cố Nền Tảng Cơ Bản</span>
        </div>
      </div>
    </div>
  </div>

  <!-- Parent Test OCR / Upload Modal -->
  <ParentTestOcrModal
    bind:isOpen={showOcrModal}
    student={linkedChild}
    onSaved={() => {
      if (linkedChild) parentTestRecords = getParentTestRecords(linkedChild.id);
    }}
  />

</div>
