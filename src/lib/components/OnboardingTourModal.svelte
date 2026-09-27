<script>
  let { isOpen = $bindable(false), currentUser = null } = $props();

  let activeTab = $state('vision'); // 'vision' | 'student' | 'parent' | 'teacher' | 'admin'

  function handleClose() {
    isOpen = false;
    try {
      localStorage.setItem('tienganh_tour_completed', 'true');
    } catch {}
  }
</script>

<svelte:window onkeydown={(e) => { if (e.key === 'Escape' && isOpen) handleClose(); }} />

{#if isOpen}
  <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_noninteractive_element_interactions -->
  <div
    class="fixed inset-0 z-[110] flex items-center justify-center p-3 sm:p-4 bg-slate-950/80 backdrop-blur-md animate-in fade-in duration-200"
    onclick={(e) => { if (e.target === e.currentTarget) handleClose(); }}
    role="dialog"
    aria-modal="true"
    tabindex="-1"
  >
    <div class="w-full max-w-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
      <!-- Header -->
      <div class="flex-shrink-0 bg-slate-900 px-5 py-4 flex items-center justify-between text-white border-b border-slate-800">
        <div class="flex items-center gap-2.5">
          <span class="text-2xl">🎓</span>
          <div>
            <h2 class="text-sm sm:text-base font-semibold text-white">Hướng Dẫn Hệ Thống &amp; Tầm Nhìn Sư Phạm</h2>
            <div class="text-[11px] text-slate-400">Tiếng Anh Cô Dung • Hệ Thống Khảo Thí &amp; Đào Tạo K12 Chuẩn 2026</div>
          </div>
        </div>
        <button
          onclick={handleClose}
          class="w-7 h-7 rounded-md bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white flex items-center justify-center text-xs font-semibold transition-colors"
          title="Đóng"
        >
          ✕
        </button>
      </div>

      <!-- Navigation Tabs -->
      <div class="flex-shrink-0 flex overflow-x-auto border-b border-slate-200 dark:border-slate-800 bg-slate-100/90 dark:bg-slate-950/80 p-1.5 text-xs font-semibold gap-1">
        <button
          onclick={() => activeTab = 'vision'}
          class="px-3 py-1.5 rounded-md transition-colors whitespace-nowrap {activeTab === 'vision' ? 'bg-white dark:bg-slate-800 text-sky-700 dark:text-sky-300 shadow-xs' : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'}"
        >
          🌟 Tầm Nhìn Sư Phạm
        </button>
        <button
          onclick={() => activeTab = 'student'}
          class="px-3 py-1.5 rounded-md transition-colors whitespace-nowrap {activeTab === 'student' ? 'bg-white dark:bg-slate-800 text-emerald-700 dark:text-emerald-300 shadow-xs' : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'}"
        >
          🎒 Học Sinh
        </button>
        <button
          onclick={() => activeTab = 'parent'}
          class="px-3 py-1.5 rounded-md transition-colors whitespace-nowrap {activeTab === 'parent' ? 'bg-white dark:bg-slate-800 text-purple-700 dark:text-purple-300 shadow-xs' : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'}"
        >
          👨‍👩‍👧 Phụ Huynh
        </button>
        <button
          onclick={() => activeTab = 'teacher'}
          class="px-3 py-1.5 rounded-md transition-colors whitespace-nowrap {activeTab === 'teacher' ? 'bg-white dark:bg-slate-800 text-teal-700 dark:text-teal-300 shadow-xs' : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'}"
        >
          👩‍🏫 Giáo Viên
        </button>
        <button
          onclick={() => activeTab = 'admin'}
          class="px-3 py-1.5 rounded-md transition-colors whitespace-nowrap {activeTab === 'admin' ? 'bg-white dark:bg-slate-800 text-amber-700 dark:text-amber-300 shadow-xs' : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'}"
        >
          👑 Ban Quản Trị
        </button>
      </div>

      <!-- Tab Content Area -->
      <div class="flex-1 overflow-y-auto p-5 space-y-4 text-xs text-slate-700 dark:text-slate-300 leading-relaxed min-h-0">
        {#if activeTab === 'vision'}
          <div class="space-y-3">
            <div class="p-3.5 rounded-lg bg-sky-50 dark:bg-sky-950/40 border border-sky-200 dark:border-sky-800/60 space-y-1.5">
              <div class="font-semibold text-sky-800 dark:text-sky-300 text-sm flex items-center gap-1.5">
                <span>🎯</span>
                <span>Tầm Nhìn &amp; Mô Hình Đào Tạo K12 Toàn Diện 2026</span>
              </div>
              <p class="text-[11px] text-slate-600 dark:text-slate-400">
                (Trích dẫn nguồn: Tài liệu điều phối đào tạo <em>CODEX_COORDINATION.md</em> &amp; Kế hoạch GDPT 2018).
              </p>
            </div>

            <div class="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
              <div class="p-3 rounded-lg bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 space-y-1">
                <div class="font-semibold text-slate-900 dark:text-white">1. Chuẩn Hóa GDPT 2018 &amp; Thi Vào 10</div>
                <p class="text-[11px] text-slate-600 dark:text-slate-400">
                  Bám sát chương trình Global Success, Friends Plus từ Lớp 3 đến Lớp 12, chiến dịch ôn thi vào 10 Chuyên và Tốt Nghiệp THPTQG 2026.
                </p>
              </div>

              <div class="p-3 rounded-lg bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 space-y-1">
                <div class="font-semibold text-slate-900 dark:text-white">2. Khảo Thí Quốc Tế &amp; Phonics</div>
                <p class="text-[11px] text-slate-600 dark:text-slate-400">
                  Học sinh được trang bị nền tảng ngữ âm Phonics chuẩn Cambridge, lộ trình tiếp cận IELTS 6.5 - 7.5 và các chứng chỉ KET/PET.
                </p>
              </div>

              <div class="p-3 rounded-lg bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 space-y-1">
                <div class="font-semibold text-slate-900 dark:text-white">3. Co-Teaching Bản Ngữ &amp; Kèm Sát</div>
                <p class="text-[11px] text-slate-600 dark:text-slate-400">
                  Giáo viên bản ngữ phối hợp cùng trợ giảng Việt Nam, ghi nhận chuyên cần và bài tập từng buổi học rõ ràng.
                </p>
              </div>

              <div class="p-3 rounded-lg bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 space-y-1">
                <div class="font-semibold text-slate-900 dark:text-white">4. Đổi Sao Trừ Học Phí Minh Bạch</div>
                <p class="text-[11px] text-slate-600 dark:text-slate-400">
                  Học sinh đạt điểm cao và làm bài tập chuyên cần được thưởng Sao để quy đổi trực tiếp giảm trừ học phí cho phụ huynh.
                </p>
              </div>
            </div>

            <div class="p-3 rounded-lg bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800/40 text-[11px] text-amber-800 dark:text-amber-300">
              📌 <strong>Lưu ý xác thực:</strong> Cổng thanh toán tự động (SePay/MoMo/VNPay) và OCR nhận diện PDF hiện ở trạng thái <em>Chờ Phê Duyệt / Hoàn Thiện Tiếp Theo</em> theo yêu cầu của Master Plan.
            </div>
          </div>
        {:else if activeTab === 'student'}
          <div class="space-y-3">
            <h3 class="font-semibold text-slate-900 dark:text-white text-sm">Học Sinh: Trải Nghiệm Học Tập Đa Giác Quan</h3>
            <ul class="space-y-2 list-disc list-inside text-slate-600 dark:text-slate-300">
              <li><strong>Phòng Thi &amp; Test Nhanh 15 Phút:</strong> Làm bài khảo sát định kỳ, tính giờ tự động và xem lời giải thích chi tiết.</li>
              <li><strong>Từ Điển Phonics &amp; Âm Thanh:</strong> Tra cứu hơn 2.500 từ vựng với phiên âm IPA và phát âm chuẩn bản ngữ.</li>
              <li><strong>Flashcard 3D &amp; Game Từ Vựng:</strong> Lật thẻ ôn tập thông minh Spaced Repetition và tham gia Đấu Trường Game.</li>
              <li><strong>Tích Lũy Sao:</strong> Mỗi điểm 9-10 hoặc chuỗi chuyên cần được cộng 10-20 Sao vào ví cá nhân.</li>
            </ul>
          </div>
        {:else if activeTab === 'parent'}
          <div class="space-y-3">
            <h3 class="font-semibold text-slate-900 dark:text-white text-sm">Phụ Huynh: Theo Dõi Sát Sao Tiến Trình Của Con</h3>
            <ul class="space-y-2 list-disc list-inside text-slate-600 dark:text-slate-300">
              <li><strong>Sổ Phụ Huynh Trực Tuyến:</strong> Xem bảng điểm, lịch thi, nhận xét của giáo viên sau từng buổi học.</li>
              <li><strong>Thông Báo Đón Con 10 Phút:</strong> Nhận tin nhắn thông báo lớp sắp tan để sắp xếp thời gian đón con chu đáo.</li>
              <li><strong>Học Phí &amp; Trừ Điểm Sao:</strong> Minh bạch học phí theo tháng, khấu trừ chính xác số Sao con đạt được.</li>
            </ul>
          </div>
        {:else if activeTab === 'teacher'}
          <div class="space-y-3">
            <h3 class="font-semibold text-slate-900 dark:text-white text-sm">Giáo Viên &amp; Trợ Giảng: Sổ Nghiệp Vụ Tinh Gọn</h3>
            <ul class="space-y-2 list-disc list-inside text-slate-600 dark:text-slate-300">
              <li><strong>Điểm Danh &amp; Giao Bài:</strong> Điểm danh nhanh theo ca, ghi nhận lý do vắng và giao bài tập kèm hạn nộp.</li>
              <li><strong>Chấm Bài &amp; Nhận Xét:</strong> Nhập điểm và lời phê năng lực định kỳ theo chuẩn Công văn 5512.</li>
              <li><strong>Đơn Nghỉ Phép &amp; Dạy Thay:</strong> Quy trình phê duyệt dạy thay 2 bước đảm bảo an toàn ca học.</li>
            </ul>
          </div>
        {:else if activeTab === 'admin'}
          <div class="space-y-3">
            <h3 class="font-semibold text-slate-900 dark:text-white text-sm">Ban Quản Trị &amp; Leader (Cô Dung)</h3>
            <ul class="space-y-2 list-disc list-inside text-slate-600 dark:text-slate-300">
              <li><strong>Trung Tâm Báo Cáo Leader:</strong> Quét tự động nhắc nhở chuyên cần, cảnh báo học phí và tiến độ nộp bài.</li>
              <li><strong>Xét Duyệt Tuyển Dụng:</strong> Thẩm định hồ sơ giáo viên ứng tuyển, xếp lịch phỏng vấn và buổi dạy thử.</li>
              <li><strong>Bảo Mật Cơ Sở Dữ Liệu:</strong> Sao lưu snapshot tự động và kiểm soát phân quyền RBAC đa cấp.</li>
            </ul>
          </div>
        {/if}
      </div>

      <!-- Footer Action -->
      <div class="flex-shrink-0 bg-slate-50 dark:bg-slate-950/80 border-t border-slate-200 dark:border-slate-800 p-4 flex items-center justify-between">
        <span class="text-[11px] text-slate-500">
          Bạn có thể mở lại hướng dẫn này bất kỳ lúc nào từ chân trang.
        </span>
        <button
          onclick={handleClose}
          class="px-5 py-2 rounded-md font-semibold bg-sky-600 hover:bg-sky-700 text-white text-xs transition-colors shadow-xs"
        >
          Tôi Đã Hiểu &amp; Bắt Đầu Khám Phá ➔
        </button>
      </div>
    </div>
  </div>
{/if}
