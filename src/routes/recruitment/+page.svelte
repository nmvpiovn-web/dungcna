<svelte:head>
  <title>Tuyển Dụng Giáo Viên Tiếng Anh • Tiếng Anh Cô Dung</title>
  <meta name="description" content="Cổng thông tin tuyển dụng giáo viên cơ hữu và thời vụ dạy thay tại Tiếng Anh Cô Dung Thủ Đức." />
</svelte:head>

<script>
  import { playAudioFeedback } from '$lib/speech';

  let candidateName = $state('');
  let phone = $state('');
  let email = $state('');
  let roleType = $state('lead'); // 'lead' (cơ hữu) | 'contractor' (thời vụ/dạy thay)
  let experienceYears = $state(2);
  let certificates = $state('IELTS 7.5, Cử nhân Sư Phạm Tiếng Anh');
  let cvLink = $state('');
  let availability = $state('Tối thứ 2, 4, 6 (17:30 - 21:00)');
  let notes = $state('');

  let isSubmitting = $state(false);
  let submitSuccess = $state(false);
  let errorMessage = $state('');

  async function handleApply(e) {
    e.preventDefault();
    if (!candidateName.trim() || !phone.trim()) {
      errorMessage = 'Vui lòng điền họ tên và số điện thoại liên hệ.';
      return;
    }

    isSubmitting = true;
    errorMessage = '';

    try {
      const combinedNotes = [
        notes.trim(),
        cvLink.trim() ? `Link CV: ${cvLink.trim()}` : null,
        availability.trim() ? `Lịch rảnh có thể dạy: ${availability.trim()}` : null
      ].filter(Boolean).join('\n');

      const res = await fetch('/api/teachers/workflows', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'candidate_apply',
          candidate_name: candidateName.trim(),
          phone: phone.trim(),
          email: email.trim() || null,
          role_type: roleType,
          experience_years: Number(experienceYears) || 0,
          certificates: certificates.trim(),
          notes: combinedNotes
        })
      });

      const data = await res.json();
      if (data.success) {
        submitSuccess = true;
        playAudioFeedback(true);
      } else {
        errorMessage = data.error || 'Nộp hồ sơ thất bại. Vui lòng thử lại.';
      }
    } catch (err) {
      errorMessage = 'Lỗi kết nối máy chủ: ' + err.message;
    } finally {
      isSubmitting = false;
    }
  }
</script>

<div class="max-w-3xl mx-auto py-8 px-4 space-y-6">
  <!-- Header Banner (Academic Ledger Style) -->
  <header class="bg-slate-900 border border-slate-800 rounded-lg p-6 text-slate-100 shadow-sm space-y-2">
    <div class="text-xs font-semibold text-sky-400 uppercase tracking-wider">
      Cổng Tuyển Dụng Sư Phạm • Tiếng Anh Cô Dung
    </div>
    <h1 class="text-2xl font-semibold text-white">Gia Nhập Đội Ngũ Giáo Viên Tiếng Anh</h1>
    <p class="text-slate-300 text-sm leading-relaxed max-w-2xl">
      Chúng tôi tìm kiếm các Thầy/Cô có chuyên môn vững vàng, phát âm chuẩn quốc tế và đam mê truyền cảm hứng cho học sinh từ Lớp 3 đến Lớp 12 tại cụm trường Đào Sơn Tây - Thủ Đức.
    </p>
  </header>

  {#if submitSuccess}
    <div class="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-8 text-center space-y-4 shadow-sm">
      <div class="w-12 h-12 bg-emerald-50 text-emerald-600 rounded-full flex items-center justify-center mx-auto text-2xl font-bold">
        ✓
      </div>
      <h2 class="text-lg font-semibold text-slate-900 dark:text-white">Nộp Hồ Sơ Ứng Tuyển Thành Công!</h2>
      <p class="text-xs text-slate-600 dark:text-slate-400 max-w-lg mx-auto leading-relaxed">
        Cảm ơn Thầy/Cô <strong>{candidateName}</strong> đã quan tâm. Ban Điều Hành Tiếng Anh Cô Dung sẽ thẩm định hồ sơ chuyên môn và liên hệ qua số điện thoại <strong>{phone}</strong> để xếp lịch phỏng vấn và buổi dạy thử (demo teaching) trong vòng 48 giờ làm việc.
      </p>
      <div class="p-3 bg-slate-50 dark:bg-slate-800/40 rounded border border-slate-200 dark:border-slate-700 text-xs text-slate-500 max-w-md mx-auto">
        Lưu ý an toàn: Tài khoản ứng viên chưa được cấp quyền truy cập hệ thống sổ điểm và giáo án cho đến khi hoàn tất hợp đồng giảng dạy chính thức.
      </div>
      <div class="pt-2">
        <a href="/" class="px-5 py-2.5 rounded-md text-xs font-semibold bg-sky-600 hover:bg-sky-700 text-white transition-colors">
          Trở Về Trang Chủ
        </a>
      </div>
    </div>
  {:else}
    <div class="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-6 shadow-sm space-y-6">
      <div class="border-b border-slate-200 dark:border-slate-800 pb-3">
        <h2 class="text-base font-semibold text-slate-900 dark:text-white">Phiếu Đăng Ký Ứng Tuyển Sư Phạm</h2>
        <p class="text-xs text-slate-500 dark:text-slate-400 mt-0.5">Vui lòng điền thông tin chính xác để bộ phận nhân sự liên hệ phỏng vấn.</p>
      </div>

      {#if errorMessage}
        <div class="p-3 rounded-md text-xs font-semibold bg-rose-50 text-rose-700 border border-rose-200">
          {errorMessage}
        </div>
      {/if}

      <form onsubmit={handleApply} class="space-y-4 text-xs">
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label for="cand-name" class="block font-semibold text-slate-700 dark:text-slate-300 mb-1">Họ và tên (*):</label>
            <input 
              id="cand-name"
              type="text" 
              required
              bind:value={candidateName}
              placeholder="VD: Nguyễn Văn Anh"
              class="w-full p-2.5 rounded-md bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-slate-900 dark:text-white font-medium"
            />
          </div>
          <div>
            <label for="cand-phone" class="block font-semibold text-slate-700 dark:text-slate-300 mb-1">Số điện thoại / Zalo (*):</label>
            <input 
              id="cand-phone"
              type="tel" 
              required
              bind:value={phone}
              placeholder="VD: 0912345678"
              class="w-full p-2.5 rounded-md bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-slate-900 dark:text-white font-medium tabular-nums"
            />
          </div>
        </div>

        <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label for="cand-email" class="block font-semibold text-slate-700 dark:text-slate-300 mb-1">Email liên hệ:</label>
            <input 
              id="cand-email"
              type="email" 
              bind:value={email}
              placeholder="VD: gv.tienganh@gmail.com"
              class="w-full p-2.5 rounded-md bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-slate-900 dark:text-white font-medium"
            />
          </div>
          <div>
            <label for="cand-role" class="block font-semibold text-slate-700 dark:text-slate-300 mb-1">Hình thức ứng tuyển:</label>
            <select 
              id="cand-role"
              bind:value={roleType}
              class="w-full p-2.5 rounded-md bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-slate-900 dark:text-white font-semibold"
            >
              <option value="lead">Giáo Viên Cơ Hữu (Chính thức)</option>
              <option value="contractor">Giáo Viên Thời Vụ / Nhận Ca Dạy Thay</option>
              <option value="assistant">Trợ Giảng (Teaching Assistant)</option>
            </select>
          </div>
        </div>

        <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label for="cand-exp" class="block font-semibold text-slate-700 dark:text-slate-300 mb-1">Số năm kinh nghiệm giảng dạy:</label>
            <input 
              id="cand-exp"
              type="number" 
              min="0"
              max="40"
              bind:value={experienceYears}
              class="w-full p-2.5 rounded-md bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-slate-900 dark:text-white font-semibold tabular-nums"
            />
          </div>
          <div>
            <label for="cand-certs" class="block font-semibold text-slate-700 dark:text-slate-300 mb-1">Chứng chỉ chuyên môn (IELTS/TESOL/Cử nhân):</label>
            <input 
              id="cand-certs"
              type="text" 
              bind:value={certificates}
              placeholder="VD: IELTS 7.5, TESOL 120h, ĐH Sư Phạm TP.HCM"
              class="w-full p-2.5 rounded-md bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-slate-900 dark:text-white font-medium"
            />
          </div>
        </div>

        <div>
          <label for="cand-cv" class="block font-semibold text-slate-700 dark:text-slate-300 mb-1">Đường dẫn CV / Hồ sơ năng lực (Google Drive / Dropbox):</label>
          <input 
            id="cand-cv"
            type="url" 
            bind:value={cvLink}
            placeholder="https://drive.google.com/file/d/..."
            class="w-full p-2.5 rounded-md bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-slate-900 dark:text-white font-mono"
          />
        </div>

        <div>
          <label for="cand-avail" class="block font-semibold text-slate-700 dark:text-slate-300 mb-1">Thời gian có thể nhận ca dạy (Availability):</label>
          <input 
            id="cand-avail"
            type="text" 
            bind:value={availability}
            placeholder="VD: Tối 2-4-6 từ 17h30, hoặc Sáng thứ 7, Chủ Nhật"
            class="w-full p-2.5 rounded-md bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-slate-900 dark:text-white font-medium"
          />
        </div>

        <div>
          <label for="cand-notes-input" class="block font-semibold text-slate-700 dark:text-slate-300 mb-1">Giới thiệu ngắn gọn về thế mạnh giảng dạy:</label>
          <textarea 
            id="cand-notes-input"
            bind:value={notes}
            rows="3"
            placeholder="Phương pháp rèn phát âm, luyện thi học sinh giỏi, thế mạnh ngữ pháp..."
            class="w-full p-2.5 rounded-md bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-slate-900 dark:text-white"
          ></textarea>
        </div>

        <div class="pt-3 flex justify-end">
          <button 
            type="submit"
            disabled={isSubmitting}
            class="px-6 py-2.5 rounded-md font-semibold bg-sky-600 hover:bg-sky-700 text-white disabled:opacity-50 transition-colors shadow-sm"
          >
            {isSubmitting ? 'Đang gửi hồ sơ...' : 'Nộp Hồ Sơ Ứng Tuyển Giáo Viên'}
          </button>
        </div>
      </form>
    </div>
  {/if}
</div>
