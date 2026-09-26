<script>
  import { onMount } from 'svelte';
  import { loginUser, registerUser, getCurrentUser, isLoggedIn } from '$lib/unifiedStore';
  import { playAudioFeedback } from '$lib/speech.js';

  let { isOpen = $bindable(false), canDismiss = false } = $props();

  let activeTab = $state('login'); // 'login' | 'register'
  let identifier = $state('');
  let password = $state('');
  let errorMessage = $state('');
  let successMessage = $state('');
  let isLoading = $state(false);

  // Register multi-step state
  // Step 1: 'role' (Chọn role trước: Học sinh / Phụ huynh / Giáo viên)
  // Step 2: 'credentials' (Nhập username trước / password / tên / SĐT)
  // Step 3: 'class_popup' (Popup chọn Lớp bắt buộc, không để mặc định)
  let regStep = $state('role'); 
  let regRole = $state('student'); // Default to student, but user selects
  let regUsername = $state('');
  let regPassword = $state('');
  let regName = $state('');
  let regPhone = $state('');
  let regLinkedChild = $state('');
  let regSpecialty = $state('Tiếng Anh THCS & THPT');
  let regSelectedGrade = $state(''); // Must select actively

  const availableClasses = [
    {
      category: 'Tiểu Học (Lớp 1 - 5)',
      icon: '🎒',
      items: [
        { id: 'Lớp 1', title: 'Lớp 1', sub: 'Global Success & Phonics Phát Âm' },
        { id: 'Lớp 2', title: 'Lớp 2', sub: 'Global Success & Từ Vựng Trực Quan' },
        { id: 'Lớp 3', title: 'Lớp 3', sub: 'Global Success & Giao Tiếp Nhập Môn' },
        { id: 'Lớp 4', title: 'Lớp 4', sub: 'Global Success & Phản Xạ Nghe Nói' },
        { id: 'Lớp 5', title: 'Lớp 5', sub: 'Ôn Thi Chuyển Cấp Lên Lớp 6 Chất Lượng Cao' }
      ]
    },
    {
      category: 'THCS (Lớp 6 - 9)',
      icon: '🌱',
      items: [
        { id: 'Lớp 6', title: 'Lớp 6', sub: 'Global Success & Ngữ Pháp Nền Tảng' },
        { id: 'Lớp 7', title: 'Lớp 7', sub: 'Global Success Chuyên Sâu & Test 15-45p' },
        { id: 'Lớp 8', title: 'Lớp 8', sub: 'Global Success & Viết Luận Đoạn Văn' },
        { id: 'Lớp 9', title: 'Lớp 9', sub: 'Luyện Thi Vào 10 & Chuyên Anh Toàn Diện' }
      ]
    },
    {
      category: 'THPT & Đại Học (Lớp 10 - 12)',
      icon: '🏢',
      items: [
        { id: 'Lớp 10', title: 'Lớp 10', sub: 'Chương Trình GDPT 2018 Mới' },
        { id: 'Lớp 11', title: 'Lớp 11', sub: 'Đọc Hiểu Học Thuật & Ngữ Pháp Nâng Cao' },
        { id: 'Lớp 12', title: 'Lớp 12', sub: 'Chiến Dịch Ôn Thi Tốt Nghiệp THPTQG 2026' }
      ]
    },
    {
      category: 'Chứng Chỉ Quốc Tế & Du Học',
      icon: '🌍',
      items: [
        { id: 'Luyện Thi IELTS', title: 'IELTS Academic', sub: 'Mục Tiêu Band 6.5 - 8.0+ 4 Kỹ Năng' },
        { id: 'Luyện Thi TOEIC / TOEFL', title: 'TOEIC / TOEFL', sub: 'Thang 990 / TOEFL iBT Du Học' },
        { id: 'Chứng chỉ Cambridge / VSTEP', title: 'Cambridge KET/PET', sub: 'B1, B2 VSTEP Đạt Chuẩn Đầu Ra' }
      ]
    }
  ];

  async function handleLogin(e) {
    if (e) e.preventDefault();
    errorMessage = '';
    successMessage = '';
    isLoading = true;

    try {
      const res = await loginUser(identifier, password);
      if (res.success) {
        successMessage = `Xin chào ${res.user.name}! Đăng nhập thành công.`;
        playAudioFeedback(true);
        setTimeout(() => {
          isOpen = false;
          isLoading = false;
          window.location.reload();
        }, 300);
      } else {
        errorMessage = res.error || 'Đăng nhập không thành công!';
        playAudioFeedback(false);
        isLoading = false;
      }
    } catch (err) {
      errorMessage = err.message || 'Lỗi hệ thống';
      isLoading = false;
    }
  }

  function handleSelectRole(role) {
    regRole = role;
    regStep = 'credentials';
    errorMessage = '';
  }

  function handleCredentialsNext(e) {
    if (e) e.preventDefault();
    errorMessage = '';

    if (!regUsername.trim()) {
      errorMessage = 'Vui lòng nhập Tên đăng nhập (Username)!';
      return;
    }
    if (!regPassword.trim()) {
      errorMessage = 'Vui lòng nhập Mật khẩu!';
      return;
    }
    if (!regName.trim()) {
      errorMessage = 'Vui lòng nhập Họ và Tên!';
      return;
    }

    // Advance to mandatory class selection popup
    regStep = 'class_popup';
    regSelectedGrade = ''; // Force active selection
  }

  function handleFinalizeRegister() {
    if (!regSelectedGrade) {
      errorMessage = 'Bắt buộc chọn đúng Lớp học của bạn trước khi hoàn tất đăng ký!';
      return;
    }

    errorMessage = '';
    successMessage = '';
    isLoading = true;

    try {
      const res = registerUser({
        usernameOrPhone: regUsername.trim(),
        name: regName.trim(),
        password: regPassword.trim(),
        role: regRole,
        grade: regSelectedGrade,
        target: regRole === 'parent' ? `Đồng hành cùng con lớp ${regSelectedGrade}` : (regRole === 'teacher' ? regSpecialty : `Chương trình đào tạo ${regSelectedGrade}`),
        linkedStudentPhoneOrId: regRole === 'parent' ? regLinkedChild : ''
      });

      if (res.success) {
        successMessage = `🎉 Chúc mừng ${res.user.name}! Tài khoản dùng thử (Trial) đã được khởi tạo thành công với Lớp: ${regSelectedGrade}. Đang chờ Leader Cô Dung duyệt chính thức!`;
        playAudioFeedback(true);
        setTimeout(() => {
          isOpen = false;
          isLoading = false;
          window.location.reload();
        }, 1200);
      } else {
        errorMessage = res.error || 'Đăng ký không thành công!';
        playAudioFeedback(false);
        isLoading = false;
      }
    } catch (err) {
      errorMessage = err.message || 'Lỗi hệ thống';
      isLoading = false;
    }
  }


  function resetRegisterFlow() {
    regStep = 'role';
    regRole = 'student';
    regUsername = '';
    regPassword = '';
    regName = '';
    regPhone = '';
    regLinkedChild = '';
    regSelectedGrade = '';
    errorMessage = '';
  }
</script>

{#if isOpen}
  <div class="fixed inset-0 z-[100] flex items-center justify-center p-3 sm:p-4 bg-slate-950/80 backdrop-blur-md animate-in fade-in duration-200">
    <div class="w-full max-w-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl shadow-2xl overflow-hidden relative font-sans text-slate-800 dark:text-slate-100 flex flex-col max-h-[92dvh] sm:max-h-[85vh]">
      
      <!-- Top Slim Header: Brand + Hotline: 0905 960 437 (Clean & Space-Saving) -->
      <div class="flex-shrink-0 bg-gradient-to-r from-emerald-600 via-teal-600 to-emerald-700 dark:from-emerald-950 dark:via-teal-950 dark:to-slate-900 px-4 py-3 flex items-center justify-between text-white border-b border-emerald-500/30">
        <div class="flex items-center gap-2">
          <span class="text-xl">🎓</span>
          <span class="font-heading font-black text-sm sm:text-base tracking-tight text-white">Tiếng Anh Cô Dung</span>
        </div>

        <div class="flex items-center gap-2">
          <a
            href="tel:0905960437"
            class="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-white/20 hover:bg-white/30 text-white text-xs font-black shadow-sm transition-all hover:scale-105 active:scale-95 border border-white/40"
            title="Gọi Hotline tư vấn"
          >
            <span>📞</span>
            <span>Hotline: 0905 960 437</span>
          </a>

          {#if canDismiss}
            <button
              onclick={() => isOpen = false}
              class="w-7 h-7 rounded-full bg-black/20 hover:bg-black/40 text-emerald-100 hover:text-white flex items-center justify-center text-xs font-bold transition-all ml-1"
              title="Đóng"
            >
              ✕
            </button>
          {/if}
        </div>
      </div>

      <!-- Tab Switcher (Header: Fixed Top) -->
      <div class="flex-shrink-0 flex border-b border-slate-200 dark:border-slate-800 bg-slate-100/90 dark:bg-slate-950/80 p-1.5 text-xs font-bold">
        <button
          onclick={() => { activeTab = 'login'; errorMessage = ''; }}
          class="flex-1 py-2 rounded-xl transition-all {activeTab === 'login' ? 'bg-white dark:bg-emerald-600 text-emerald-700 dark:text-white shadow-sm font-extrabold' : 'text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'}"
        >
          🔑 Đăng Nhập
        </button>
        <button
          onclick={() => { activeTab = 'register'; resetRegisterFlow(); }}
          class="flex-1 py-2 rounded-xl transition-all {activeTab === 'register' ? 'bg-white dark:bg-emerald-600 text-emerald-700 dark:text-white shadow-sm font-extrabold' : 'text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'}"
        >
          ✨ Đăng Ký Mới (Trial)
        </button>
      </div>

      <!-- Scrollable Form Body -->
      <div class="flex-1 overflow-y-auto p-4 sm:p-5 space-y-4 min-h-0">
        <!-- Error / Success Alert -->
        {#if errorMessage}
          <div class="p-3 rounded-2xl bg-rose-500/10 border border-rose-500/30 text-rose-600 dark:text-rose-300 text-xs flex items-center gap-2 animate-in shake duration-200">
            <span>⚠️</span>
            <span>{errorMessage}</span>
          </div>
        {/if}
        {#if successMessage}
          <div class="p-3 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-600 dark:text-emerald-300 text-xs flex items-center gap-2">
            <span>✅</span>
            <span>{successMessage}</span>
          </div>
        {/if}

        <!-- ================= TAB: LOGIN ================= -->
        {#if activeTab === 'login'}
          <form id="login-form" onsubmit={handleLogin} class="space-y-3.5">
            <div>
              <label for="login-id" class="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                Tên Đăng Nhập hoặc Số Điện Thoại:
              </label>
              <div class="relative">
                <input
                  id="login-id"
                  type="text"
                  bind:value={identifier}
                  placeholder="baokhiem / admin / msdung / 0901234567..."
                  required
                  class="w-full bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 focus:border-emerald-500 rounded-xl px-3.5 py-2.5 text-xs text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                />
                <span class="absolute right-3 top-2.5 text-sm text-slate-400">👤</span>
              </div>
            </div>

            <div>
              <label for="login-pass" class="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                Mật Khẩu:
              </label>
              <div class="relative">
                <input
                  id="login-pass"
                  type="password"
                  bind:value={password}
                  placeholder="Mật khẩu của bạn (VD: 123)..."
                  required
                  class="w-full bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 focus:border-emerald-500 rounded-xl px-3.5 py-2.5 text-xs text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                />
                <span class="absolute right-3 top-2.5 text-sm text-slate-400">🔒</span>
              </div>
            </div>
          </form>

            <div class="pt-2 text-center text-[11px] text-slate-500 dark:text-slate-400">
              Chưa có tài khoản? Hãy chuyển sang tab <strong>Đăng Ký</strong> ở phía trên để tạo tài khoản mới.
            </div>

        <!-- ================= TAB: REGISTER (REBUILT 3 STEPS) ================= -->
        {:else}
          <!-- Visual Step Breadcrumb Indicator -->
          <div class="flex items-center justify-between pb-2 border-b border-slate-200 dark:border-slate-800 text-[10px] font-extrabold uppercase tracking-wider">
            <span class="flex items-center gap-1 {regStep === 'role' ? 'text-emerald-600 dark:text-emerald-400 font-black' : 'text-slate-400'}">
              <span class="w-4 h-4 rounded-full flex items-center justify-center text-[9px] {regStep === 'role' ? 'bg-emerald-600 text-white' : 'bg-slate-200 dark:bg-slate-800'}">1</span>
              <span>Chọn Role</span>
            </span>
            <span class="text-slate-300 dark:text-slate-700">➔</span>
            <span class="flex items-center gap-1 {regStep === 'credentials' ? 'text-emerald-600 dark:text-emerald-400 font-black' : 'text-slate-400'}">
              <span class="w-4 h-4 rounded-full flex items-center justify-center text-[9px] {regStep === 'credentials' ? 'bg-emerald-600 text-white' : 'bg-slate-200 dark:bg-slate-800'}">2</span>
              <span>Tài Khoản</span>
            </span>
            <span class="text-slate-300 dark:text-slate-700">➔</span>
            <span class="flex items-center gap-1 {regStep === 'class_popup' ? 'text-emerald-600 dark:text-emerald-400 font-black' : 'text-slate-400'}">
              <span class="w-4 h-4 rounded-full flex items-center justify-center text-[9px] {regStep === 'class_popup' ? 'bg-emerald-600 text-white' : 'bg-slate-200 dark:bg-slate-800'}">3</span>
              <span>Chọn Lớp (*)</span>
            </span>
          </div>

          <!-- STEP 1: CHỌN ROLE TRƯỚC (HỌC SINH / PHỤ HUYNH / GIÁO VIÊN) -->
          {#if regStep === 'role'}
            <div class="space-y-3">
              <div class="text-center space-y-0.5">
                <h3 class="text-sm font-black text-slate-900 dark:text-white">Bạn Đăng Ký Tài Khoản Dưới Vai Trò Nào?</h3>
                <p class="text-[11px] text-slate-500 dark:text-slate-400">Bấm chọn một vai trò bên dưới để hệ thống kích hoạt đúng giao diện:</p>
              </div>

              <div class="space-y-2.5">
                <!-- Role Card 1: Học sinh -->
                <button
                  type="button"
                  onclick={() => handleSelectRole('student')}
                  class="w-full p-3.5 rounded-2xl border text-left transition-all flex items-center gap-3.5 group bg-emerald-50/40 dark:bg-emerald-950/20 border-emerald-300 dark:border-emerald-800/60 hover:border-emerald-500 hover:bg-emerald-50 hover:scale-[1.01]"
                >
                  <div class="w-11 h-11 rounded-2xl bg-emerald-100 dark:bg-emerald-900/60 text-emerald-700 dark:text-emerald-300 flex items-center justify-center text-2xl group-hover:scale-110 transition-transform flex-shrink-0">
                    🎒
                  </div>
                  <div class="flex-1 min-w-0">
                    <div class="font-extrabold text-xs sm:text-sm text-emerald-950 dark:text-emerald-200 flex items-center gap-2">
                      <span>Tôi Là Học Sinh</span>
                      <span class="px-2 py-0.5 rounded-full bg-emerald-500 text-white text-[9px] font-bold">Khuyên Dùng</span>
                    </div>
                    <div class="text-[11px] text-slate-600 dark:text-slate-400 mt-0.5">
                      Vào phòng thi 15p - 45p, học từ vựng, luyện thi IELTS/TOEIC và tích lũy Sao đổi học phí.
                    </div>
                  </div>
                  <div class="text-emerald-600 dark:text-emerald-400 font-extrabold text-sm">➔</div>
                </button>

                <!-- Role Card 2: Phụ huynh -->
                <button
                  type="button"
                  onclick={() => handleSelectRole('parent')}
                  class="w-full p-3.5 rounded-2xl border text-left transition-all flex items-center gap-3.5 group bg-slate-50 dark:bg-slate-950/60 border-slate-200 dark:border-slate-800 hover:border-purple-500 hover:bg-purple-50/50 hover:scale-[1.01]"
                >
                  <div class="w-11 h-11 rounded-2xl bg-purple-100 dark:bg-purple-900/50 text-purple-700 dark:text-purple-300 flex items-center justify-center text-2xl group-hover:scale-110 transition-transform flex-shrink-0">
                    👨‍👩‍👧
                  </div>
                  <div class="flex-1 min-w-0">
                    <div class="font-extrabold text-xs sm:text-sm text-slate-900 dark:text-white group-hover:text-purple-600 dark:group-hover:text-purple-400">
                      Tôi Là Phụ Huynh
                    </div>
                    <div class="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                      Xem sổ theo dõi con, thông báo đón 10 phút, bảng điểm, chuyên cần và học phí trừ Sao.
                    </div>
                  </div>
                  <div class="text-slate-400 group-hover:text-purple-500 font-bold">➔</div>
                </button>

                <!-- Role Card 3: Giáo viên -->
                <button
                  type="button"
                  onclick={() => handleSelectRole('teacher')}
                  class="w-full p-3.5 rounded-2xl border text-left transition-all flex items-center gap-3.5 group bg-slate-50 dark:bg-slate-950/60 border-slate-200 dark:border-slate-800 hover:border-teal-500 hover:bg-teal-50/50 hover:scale-[1.01]"
                >
                  <div class="w-11 h-11 rounded-2xl bg-teal-100 dark:bg-teal-900/50 text-teal-700 dark:text-teal-300 flex items-center justify-center text-2xl group-hover:scale-110 transition-transform flex-shrink-0">
                    👨‍🏫
                  </div>
                  <div class="flex-1 min-w-0">
                    <div class="font-extrabold text-xs sm:text-sm text-slate-900 dark:text-white group-hover:text-teal-600 dark:group-hover:text-teal-400">
                      Tôi Là Giáo Viên / Trợ Giảng
                    </div>
                    <div class="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                      Giảng dạy, quản lý thời khóa biểu, điểm danh, ghi nhận xét sổ đầu bài và khảo thí học sinh.
                    </div>
                  </div>
                  <div class="text-slate-400 group-hover:text-teal-500 font-bold">➔</div>
                </button>
              </div>
            </div>

          <!-- STEP 2: NHẬP USERNAME TRƯỚC / PASSWORD / THÔNG TIN CƠ BẢN -->
          {:else if regStep === 'credentials'}
            <form id="reg-cred-form" onsubmit={handleCredentialsNext} class="space-y-3">
              <div class="flex items-center justify-between pb-1.5 border-b border-slate-200 dark:border-slate-800">
                <div class="flex items-center gap-2">
                  <span class="text-base">
                    {regRole === 'student' ? '🎒' : regRole === 'parent' ? '👨‍👩‍👧' : '👨‍🏫'}
                  </span>
                  <span class="text-xs font-bold text-emerald-600 dark:text-emerald-400 uppercase">
                    Vai trò: {regRole === 'student' ? 'Học sinh' : regRole === 'parent' ? 'Phụ huynh' : 'Giáo viên'}
                  </span>
                </div>
                <button
                  type="button"
                  onclick={() => regStep = 'role'}
                  class="text-[11px] text-slate-500 hover:text-emerald-600 hover:underline font-semibold"
                >
                  ← Đổi vai trò
                </button>
              </div>

              <!-- 1. USERNAME FIRST -->
              <div>
                <label for="reg-username" class="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                  1. Tên Đăng Nhập (Username) (*):
                </label>
                <div class="relative">
                  <input
                    id="reg-username"
                    type="text"
                    bind:value={regUsername}
                    placeholder="VD: baokhiem, minhvu, baonhi..."
                    required
                    class="w-full bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 focus:border-emerald-500 rounded-xl px-3.5 py-2 text-xs text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                  />
                  <span class="absolute right-3 top-2 text-xs text-slate-400">🏷️</span>
                </div>
                <span class="text-[10px] text-slate-400 mt-0.5 block">Viết liền không dấu, dùng để đăng nhập vào app.</span>
              </div>

              <!-- 2. PASSWORD -->
              <div>
                <label for="reg-password" class="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                  2. Mật Khẩu (*):
                </label>
                <div class="relative">
                  <input
                    id="reg-password"
                    type="password"
                    bind:value={regPassword}
                    placeholder="Mật khẩu dễ nhớ (VD: 123456, pass...)"
                    required
                    class="w-full bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 focus:border-emerald-500 rounded-xl px-3.5 py-2 text-xs text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                  />
                  <span class="absolute right-3 top-2 text-xs text-slate-400">🔒</span>
                </div>
                <span class="text-[10px] text-emerald-600 dark:text-emerald-400 mt-0.5 block">✓ Không đòi hỏi ký tự đặc biệt, thuận tiện cho học sinh.</span>
              </div>

              <!-- 3. FULL NAME -->
              <div>
                <label for="reg-fullname" class="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                  3. Họ và Tên (*):
                </label>
                <input
                  id="reg-fullname"
                  type="text"
                  bind:value={regName}
                  placeholder="VD: Nguyễn Bảo Khiêm"
                  required
                  class="w-full bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 focus:border-emerald-500 rounded-xl px-3.5 py-2 text-xs text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                />
              </div>

              <!-- 4. PHONE / ZALO -->
              <div>
                <label for="reg-phone" class="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                  4. Số Điện Thoại / Zalo (Tùy chọn):
                </label>
                <input
                  id="reg-phone"
                  type="tel"
                  bind:value={regPhone}
                  placeholder="0918889999 (Nhận báo cáo điểm &amp; lịch học qua Zalo)"
                  class="w-full bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 focus:border-emerald-500 rounded-xl px-3.5 py-2 text-xs text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                />
              </div>

              <!-- EXTRA ROLE-SPECIFIC FIELDS -->
              {#if regRole === 'parent'}
                <div class="p-3 rounded-2xl bg-purple-50/70 dark:bg-purple-950/20 border border-purple-200 dark:border-purple-800/50 space-y-1">
                  <label for="reg-child-link" class="block text-xs font-bold text-purple-700 dark:text-purple-300">
                    SĐT hoặc Username của con (Liên kết học sinh):
                  </label>
                  <input
                    id="reg-child-link"
                    type="text"
                    bind:value={regLinkedChild}
                    placeholder="VD: 0918889999 hoặc baokhiem"
                    class="w-full bg-white dark:bg-slate-950 border border-purple-300 dark:border-purple-700 rounded-xl px-3 py-1.5 text-xs text-slate-900 dark:text-white"
                  />
                  <span class="text-[10px] text-purple-600 dark:text-purple-400 block">Hệ thống sẽ tự động liên kết để bạn theo dõi điểm và học phí của con.</span>
                </div>
              {:else if regRole === 'teacher'}
                <div class="p-3 rounded-2xl bg-teal-50/70 dark:bg-teal-950/20 border border-teal-200 dark:border-teal-800/50 space-y-1">
                  <label for="reg-spec" class="block text-xs font-bold text-teal-700 dark:text-teal-300">
                    Chuyên Môn / Vai Trò Giảng Dạy:
                  </label>
                  <input
                    id="reg-spec"
                    type="text"
                    bind:value={regSpecialty}
                    placeholder="VD: IELTS 8.0, Trợ giảng ngữ pháp, Bản ngữ..."
                    class="w-full bg-white dark:bg-slate-950 border border-teal-300 dark:border-teal-700 rounded-xl px-3 py-1.5 text-xs text-slate-900 dark:text-white"
                  />
                </div>
              {/if}
            </form>

          <!-- STEP 3: POPUP CHỌN LỚP BẮT BUỘC (KHÔNG ĐỂ MẶC ĐỊNH, YÊU CẦU CHỌN ĐÚNG) -->
          {:else if regStep === 'class_popup'}
            <div class="space-y-3">
              <div class="text-center space-y-1">
                <div class="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20 text-[11px] font-bold">
                  <span>🎯</span>
                  <span>BƯỚC 3 / 3: CHỌN LỚP HỌC CHÍNH XÁC CỦA BẠN (*)</span>
                </div>
                <h3 class="text-sm font-black text-slate-900 dark:text-white">
                  {regRole === 'parent' ? 'Con Bạn Đang Theo Học Lớp Mấy?' : (regRole === 'teacher' ? 'Bạn Đang Phụ Trách Lớp Nào?' : 'Bạn Đang Theo Học Lớp Nào?')}
                </h3>
                <p class="text-xs text-rose-500 font-semibold">
                  ⚠️ Không để mặc định — Bắt buộc chọn đúng khối lớp bên dưới:
                </p>
              </div>

              <!-- Selected Class Indicator Badge & Immediate Direct CTA -->
              {#if regSelectedGrade}
                <div class="p-3 rounded-2xl bg-gradient-to-r from-emerald-500/15 via-teal-500/20 to-emerald-500/15 border-2 border-emerald-500 text-center space-y-2.5 animate-in zoom-in-95 duration-150 shadow-md">
                  <div class="text-xs font-black text-emerald-800 dark:text-emerald-300 flex items-center justify-center gap-1.5">
                    <span>✅ ĐÃ CHỌN:</span>
                    <span class="text-sm underline font-extrabold uppercase bg-emerald-600 text-white px-2.5 py-0.5 rounded-lg shadow-sm">{regSelectedGrade}</span>
                  </div>
                  <button
                    type="button"
                    disabled={isLoading}
                    onclick={handleFinalizeRegister}
                    class="w-full py-3.5 px-4 rounded-xl bg-gradient-to-r from-emerald-600 via-teal-600 to-emerald-600 hover:from-emerald-500 hover:to-teal-500 text-white font-black text-sm shadow-xl shadow-emerald-600/30 transition-all hover:scale-[1.01] active:scale-[0.99] flex items-center justify-center gap-2 ring-2 ring-emerald-400"
                  >
                    <span>{isLoading ? '⏳ Đang khởi tạo tài khoản...' : `👉 BẤM ĐÂY ĐỂ VÀO HỌC ${regSelectedGrade.toUpperCase()} NGAY 🚀`}</span>
                  </button>
                </div>
              {:else}
                <div class="p-2.5 rounded-2xl bg-amber-500/10 border border-amber-400/50 text-amber-700 dark:text-amber-300 text-xs font-bold text-center">
                  👇 Vui lòng bấm chọn 1 khối lớp bên dưới để tiếp tục:
                </div>
              {/if}

              <!-- Categories Grid of Class Options -->
              <div class="space-y-3 pr-1 text-xs">
                {#each availableClasses as group}
                  <div class="space-y-1.5">
                    <div class="font-extrabold text-[11px] text-slate-500 dark:text-slate-400 flex items-center gap-1.5 uppercase tracking-wider">
                      <span>{group.icon}</span>
                      <span>{group.category}</span>
                    </div>

                    <div class="grid grid-cols-2 gap-2">
                      {#each group.items as item}
                        {@const isSelected = regSelectedGrade === item.id}
                        <button
                          type="button"
                          onclick={() => regSelectedGrade = item.id}
                          class="p-2.5 rounded-xl border text-left transition-all {isSelected ? 'bg-emerald-600 text-white border-emerald-500 shadow-md ring-2 ring-emerald-400/50' : 'bg-slate-50 dark:bg-slate-950/80 border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 hover:border-emerald-400 hover:bg-white dark:hover:bg-slate-900'}"
                        >
                          <div class="font-bold flex items-center justify-between">
                            <span>{item.title}</span>
                            {#if isSelected}
                              <span class="text-xs">✓</span>
                            {/if}
                          </div>
                          <div class="text-[10px] mt-0.5 line-clamp-1 opacity-80">
                            {item.sub}
                          </div>
                        </button>
                      {/each}
                    </div>
                  </div>
                {/each}
              </div>

              <div class="text-[10px] text-center text-slate-400 pt-1 pb-2">
                🔒 Tài khoản sau khi đăng ký sẽ hoạt động ở mức <strong>Dùng Thử (Trial)</strong>, sau khi Admin CP hoặc Cô Dung Leader duyệt sẽ kích hoạt chính thức.
              </div>
            </div>
          {/if}
        {/if}
      </div>

      <!-- ================= PERMANENT STICKY ACTION FOOTER BAR ================= -->
      <!-- ACTION BUTTONS ALWAYS VISIBLE HERE - NEVER HIDDEN OR SCROLLED OFF-SCREEN -->
      <div class="flex-shrink-0 bg-white/95 dark:bg-slate-900/95 backdrop-blur-md border-t border-slate-200 dark:border-slate-800 px-4 sm:px-5 py-3.5 shadow-lg z-30">
        {#if activeTab === 'login'}
          <button
            type="submit"
            form="login-form"
            disabled={isLoading}
            class="w-full py-3 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-extrabold text-sm shadow-lg shadow-emerald-600/25 transition-all hover:scale-[1.01] active:scale-[0.99] flex items-center justify-center gap-2"
          >
            <span>{isLoading ? '⏳ Đang đăng nhập...' : '🚀 Đăng Nhập Vào Học'}</span>
          </button>
        {:else}
          {#if regStep === 'role'}
            <div class="text-center text-xs text-emerald-600 dark:text-emerald-400 font-bold py-1">
              👆 Vui lòng bấm chọn 1 trong 3 vai trò ở trên để tiếp tục bước 2
            </div>
          {:else if regStep === 'credentials'}
            <div class="flex items-center gap-2.5">
              <button
                type="button"
                onclick={() => regStep = 'role'}
                class="px-3.5 py-2.5 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 text-xs font-bold flex-shrink-0"
              >
                ← Đổi Vai Trò
              </button>
              <button
                type="submit"
                form="reg-cred-form"
                class="flex-1 py-3 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-extrabold text-xs sm:text-sm shadow-lg shadow-emerald-600/25 transition-all hover:scale-[1.01] active:scale-[0.99] flex items-center justify-center gap-1.5"
              >
                <span>Bước Tiếp Theo: Chọn Lớp Học ➔</span>
              </button>
            </div>
          {:else if regStep === 'class_popup'}
            <div class="flex items-center gap-2.5">
              <button
                type="button"
                onclick={() => regStep = 'credentials'}
                class="px-3.5 py-2.5 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 text-xs font-bold flex-shrink-0"
              >
                ← Quay Lại
              </button>
              <button
                type="button"
                disabled={!regSelectedGrade || isLoading}
                onclick={handleFinalizeRegister}
                class="flex-1 py-3.5 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-extrabold text-xs sm:text-sm shadow-xl shadow-emerald-600/30 transition-all hover:scale-[1.01] active:scale-[0.99] disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-1.5"
              >
                <span>{isLoading ? '⏳ Đang đăng ký...' : '✨ Hoàn Tất & Vào Học (Trial)'}</span>
              </button>
            </div>
          {/if}
        {/if}
      </div>
    </div>
  </div>
{/if}
