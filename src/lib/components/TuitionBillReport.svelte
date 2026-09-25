<script>
  let { bill, templateId = 1, showPrintBtn = true } = $props();

  function printBill() {
    window.print();
  }
</script>

<div class="tuition-container">
  {#if showPrintBtn}
    <div class="no-print flex items-center justify-between pb-4 border-b border-slate-700/50 mb-6">
      <div class="flex items-center gap-2 text-xs text-slate-300">
        <span>Mẫu đang hiển thị:</span>
        <strong class="text-emerald-400">Template {templateId}</strong>
      </div>
      <button
        onclick={printBill}
        class="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs flex items-center gap-2 shadow-lg shadow-emerald-600/30 transition-all hover:scale-105"
      >
        <span>🖨️ In / Xuất PDF (A4 Chuẩn)</span>
      </button>
    </div>
  {/if}

  <!-- ==================== TEMPLATE 1: MẦM XANH TƯƠI SÁNG (SPROUT & MINT - CUTE NATURE) ==================== -->
  {#if templateId === 1}
    <div class="bill-page bg-gradient-to-b from-emerald-50 to-teal-50/40 text-slate-800 rounded-3xl p-8 border-4 border-emerald-300 shadow-2xl relative overflow-hidden font-sans">
      <!-- Cute Nature Top Ribbon -->
      <div class="flex items-center justify-between border-b-2 border-emerald-200 pb-5">
        <div class="flex items-center gap-3">
          <div class="w-14 h-14 rounded-2xl bg-emerald-500 flex items-center justify-center text-white text-3xl shadow-md">
            🌱
          </div>
          <div>
            <div class="text-xs font-black tracking-wider uppercase text-emerald-700">TIẾNG ANH CÔ DUNG • HỆ THỐNG ĐÀO TẠO K12 &amp; QUỐC TẾ</div>
            <h1 class="text-2xl font-black text-emerald-900 leading-tight">TIẾNG ANH CÔ DUNG - PHIẾU BÁO HỌC PHÍ &amp; TIẾN ĐỘ</h1>
            <div class="text-xs text-emerald-600 font-semibold">Kỳ học: {bill.billing_period} • Giảng dạy bởi Cô Dung &amp; Đội ngũ Bản Ngữ</div>
          </div>
        </div>
        <div class="text-right">
          <span class="inline-block px-3 py-1 rounded-full bg-emerald-100 text-emerald-800 font-black text-xs border border-emerald-300 shadow-sm">
            ⭐ Ưu Đãi Sao Thưởng
          </span>
          <div class="text-[11px] text-slate-500 mt-1 font-mono">Mã HĐ: #{bill.id}</div>
        </div>
      </div>

      <!-- Student Cute Info Card -->
      <div class="my-5 p-5 rounded-2xl bg-white/90 border border-emerald-200 shadow-sm grid grid-cols-2 sm:grid-cols-4 gap-4 text-xs">
        <div>
          <span class="text-slate-500 block font-semibold">Học Sinh:</span>
          <strong class="text-sm font-black text-emerald-950">{bill.student_name}</strong>
        </div>
        <div>
          <span class="text-slate-500 block font-semibold">Tuổi &amp; Khối Lớp:</span>
          <strong class="text-emerald-900">{bill.age} tuổi • {bill.grade_level}</strong>
        </div>
        <div class="sm:col-span-2">
          <span class="text-slate-500 block font-semibold">Chương Trình Đào Tạo:</span>
          <strong class="text-emerald-900 font-bold">{bill.program_name}</strong>
        </div>
      </div>

      <!-- Attendance & Growth Highlight -->
      <div class="grid grid-cols-1 md:grid-cols-2 gap-4 my-5">
        <!-- Attendance -->
        <div class="p-4 rounded-2xl bg-emerald-100/70 border border-emerald-300 text-xs">
          <div class="flex items-center justify-between mb-2">
            <span class="font-black text-emerald-900 flex items-center gap-1.5">
              <span>📅</span> ĐÁNH GIÁ CHUYÊN CẦN
            </span>
            <span class="px-2 py-0.5 rounded-full bg-emerald-600 text-white font-bold text-[10px]">
              {bill.attendance_rate}% Có mặt
            </span>
          </div>
          <div class="text-slate-700">
            Số buổi tham gia: <strong>{bill.attendance_attended_sessions}/{bill.attendance_total_sessions} buổi</strong>
          </div>
          <div class="text-[11px] text-emerald-800 mt-1">
            Chuyên cần: <strong>Đúng giờ, tinh thần học tập tích cực, chuẩn bị bài đầy đủ.</strong>
          </div>
        </div>

        <!-- Growth Assessment -->
        <div class="p-4 rounded-2xl bg-teal-100/70 border border-teal-300 text-xs">
          <div class="flex items-center justify-between mb-2">
            <span class="font-black text-teal-900 flex items-center gap-1.5">
              <span>📈</span> KẾT LUẬN TĂNG TRƯỞNG
            </span>
            <span class="px-2 py-0.5 rounded-full bg-teal-600 text-white font-bold text-[10px]">
              +{bill.growth_percentage}% Tiến bộ
            </span>
          </div>
          <div class="text-slate-700">
            Trạng thái: <strong class="text-teal-900 font-black">{bill.growth_status === 'breakthrough_growth' ? 'Tăng trưởng vượt bậc' : 'Duy trì phong độ cao'}</strong>
          </div>
          <div class="text-[11px] text-teal-900 mt-1 italic">
            "{bill.growth_notes}"
          </div>
        </div>
      </div>

      <!-- 5-Skills & Test Scores Grid -->
      <div class="my-5 p-4 rounded-2xl bg-white/90 border border-emerald-200">
        <div class="text-xs font-black text-emerald-900 uppercase tracking-wider mb-2.5 flex items-center gap-2">
          <span>🎯</span> ĐIỂM SỐ 5 KỸ NĂNG &amp; CÁC BÀI TEST TRONG KỲ
        </div>
        <div class="grid grid-cols-5 gap-2 text-center text-xs mb-3">
          <div class="p-2 rounded-xl bg-emerald-50 border border-emerald-200">
            <div class="text-[10px] text-slate-500">🎧 Nghe</div>
            <div class="text-base font-black text-emerald-700">{bill.eval_listening}</div>
          </div>
          <div class="p-2 rounded-xl bg-emerald-50 border border-emerald-200">
            <div class="text-[10px] text-slate-500">📖 Đọc</div>
            <div class="text-base font-black text-emerald-700">{bill.eval_reading}</div>
          </div>
          <div class="p-2 rounded-xl bg-emerald-50 border border-emerald-200">
            <div class="text-[10px] text-slate-500">✍️ Viết</div>
            <div class="text-base font-black text-emerald-700">{bill.eval_writing}</div>
          </div>
          <div class="p-2 rounded-xl bg-emerald-50 border border-emerald-200">
            <div class="text-[10px] text-slate-500">🗣️ Nói</div>
            <div class="text-base font-black text-emerald-700">{bill.eval_speaking}</div>
          </div>
          <div class="p-2 rounded-xl bg-emerald-50 border border-emerald-200">
            <div class="text-[10px] text-slate-500">🧠 Ngữ Pháp</div>
            <div class="text-base font-black text-emerald-700">{bill.eval_grammar}</div>
          </div>
        </div>
        <div class="flex items-center justify-around text-xs pt-2 border-t border-emerald-100 text-slate-700">
          <span>⚡ Kiểm tra 15p: <strong class="text-emerald-800 text-sm font-black">{bill.test_score_15m}/10</strong></span>
          <span>⏱️ Kiểm tra 1 tiết 45p: <strong class="text-emerald-800 text-sm font-black">{bill.test_score_45m}/10</strong></span>
        </div>
      </div>

      <!-- Tuition & Star Deduction Table -->
      <div class="my-5 rounded-2xl overflow-hidden border-2 border-emerald-300 shadow-sm text-xs">
        <table class="w-full text-left">
          <thead class="bg-emerald-600 text-white font-black text-[11px] uppercase tracking-wider">
            <tr>
              <th class="p-3">Hạng Mục Học Phí &amp; Đãi Ngộ</th>
              <th class="p-3 text-right">Chi Tiết / Quy Đổi</th>
              <th class="p-3 text-right">Thành Tiền (VNĐ)</th>
            </tr>
          </thead>
          <tbody class="bg-white divide-y divide-emerald-100">
            <tr>
              <td class="p-3 font-bold text-slate-800">1. Học phí gốc kỳ {bill.billing_period}</td>
              <td class="p-3 text-right text-slate-500">{bill.attendance_total_sessions} buổi chính khóa</td>
              <td class="p-3 text-right font-black text-slate-800">{bill.base_tuition_vnd.toLocaleString('vi-VN')} đ</td>
            </tr>
            <tr class="bg-emerald-50/60 text-emerald-800 font-bold">
              <td class="p-3 flex items-center gap-1.5">
                <span>⭐</span>
                <span>2. Phần thưởng đổi Sao ({bill.stars_deducted.toLocaleString('vi-VN')} Sao)</span>
              </td>
              <td class="p-3 text-right text-emerald-700">100 Sao = 1.000 VNĐ</td>
              <td class="p-3 text-right text-emerald-700 font-black">-{bill.discount_vnd.toLocaleString('vi-VN')} đ</td>
            </tr>
            <tr class="bg-emerald-600 text-white font-black text-sm">
              <td class="p-3 uppercase">TỔNG HỌC PHÍ CẦN NỘP:</td>
              <td class="p-3 text-right text-xs opacity-90">Đã trừ {bill.discount_vnd.toLocaleString('vi-VN')}đ tiền sao</td>
              <td class="p-3 text-right text-base text-yellow-200 font-black">{bill.final_amount_vnd.toLocaleString('vi-VN')} đ</td>
            </tr>
          </tbody>
        </table>
      </div>

      <!-- Payment QR & Banking Box -->
      <div class="p-5 rounded-2xl bg-white border-2 border-emerald-300 shadow-md flex flex-col sm:flex-row items-center justify-between gap-5 my-5">
        <div class="space-y-1.5 text-xs">
          <div class="text-xs font-black text-emerald-800 uppercase tracking-wider flex items-center gap-1.5">
            <span>💳</span> QUÉT MÃ VIETQR THANH TOÁN HỌC PHÍ
          </div>
          <div>Ngân hàng: <strong class="text-slate-900">{bill.bank_name}</strong></div>
          <div>Số tài khoản: <strong class="text-slate-900 font-mono text-sm">{bill.bank_account}</strong></div>
          <div>Chủ tài khoản: <strong class="text-slate-900">{bill.account_holder}</strong></div>
          <div>Nội dung CK: <strong class="text-emerald-700 font-mono">HP {bill.student_name} T10</strong></div>
          <div class="text-[11px] text-slate-500 pt-1">
            * Mọi ứng dụng ngân hàng và ví điện tử đều quét được mã VietQR tự động điền tiền.
          </div>
        </div>

        <div class="flex-shrink-0 text-center">
          <img
            src={bill.vietqr_url}
            alt="VietQR Payment"
            class="w-36 h-36 rounded-xl border border-emerald-300 p-1 bg-white shadow-sm mx-auto"
          />
          <span class="text-[10px] font-bold text-emerald-700 block mt-1">Quét mã để nộp</span>
        </div>
      </div>

      <!-- Footer Signatures -->
      <div class="grid grid-cols-2 gap-8 pt-4 border-t-2 border-emerald-200 text-xs text-center text-slate-700">
        <div>
          <div class="font-bold">PHỤ HUYNH HỌC SINH</div>
          <div class="text-[11px] text-slate-500 italic mt-0.5">(Ký và ghi rõ họ tên)</div>
          <div class="h-14"></div>
          <div class="font-semibold text-slate-800">{bill.parent_name || 'Bác ' + bill.student_name}</div>
        </div>
        <div>
          <div class="font-bold">CÔ DUNG &amp; SUPERADMIN CHUYÊN MÔN</div>
          <div class="text-[11px] text-slate-500 italic mt-0.5">(Đã ký duyệt điện tử)</div>
          <div class="h-14 flex items-center justify-center text-2xl">✍️ 📜</div>
          <div class="font-black text-emerald-900">Cô Dung &amp; {bill.account_holder}</div>
        </div>
      </div>
    </div>

  <!-- ==================== TEMPLATE 2: NGÔI SAO TRI THỨC (EMERALD ACADEMIC) ==================== -->
  {:else if templateId === 2}
    <div class="bill-page bg-slate-900 text-slate-100 rounded-3xl p-8 border-4 border-teal-500 shadow-2xl relative overflow-hidden font-sans">
      <div class="flex items-center justify-between border-b border-teal-500/50 pb-5">
        <div class="flex items-center gap-3">
          <div class="w-14 h-14 rounded-2xl bg-teal-500 flex items-center justify-center text-white text-3xl shadow-lg shadow-teal-500/30">
            👑
          </div>
          <div>
            <div class="text-xs font-bold tracking-widest uppercase text-teal-400">TIẾNG ANH CÔ DUNG • BÁO CÁO HỌC THUẬT K12</div>
            <h1 class="text-2xl font-black text-white">TIẾNG ANH CÔ DUNG - BÁO ĐIỂM &amp; HỌC PHÍ</h1>
            <div class="text-xs text-slate-400">Niên Khóa 2026 • Chuẩn GDPT 2018</div>
          </div>
        </div>
        <div class="text-right">
          <span class="px-3 py-1 rounded-full bg-teal-500/20 text-teal-300 font-bold text-xs border border-teal-500/30">
            Hạng Mục Xuất Sắc
          </span>
          <div class="text-[11px] text-slate-400 mt-1 font-mono">#{bill.id}</div>
        </div>
      </div>

      <!-- Info Bar -->
      <div class="grid grid-cols-2 sm:grid-cols-4 gap-4 my-5 p-4 rounded-2xl bg-slate-950 border border-slate-800 text-xs">
        <div><span class="text-slate-400">Học Viên:</span> <strong class="text-white block font-black">{bill.student_name}</strong></div>
        <div><span class="text-slate-400">Độ Tuổi &amp; Lớp:</span> <strong class="text-teal-300 block">{bill.age} tuổi • {bill.grade_level}</strong></div>
        <div class="sm:col-span-2"><span class="text-slate-400">Chương Trình:</span> <strong class="text-slate-200 block">{bill.program_name}</strong></div>
      </div>

      <!-- Growth & Attendance -->
      <div class="grid grid-cols-2 gap-4 my-5 text-xs">
        <div class="p-4 rounded-2xl bg-slate-950 border border-teal-500/40">
          <div class="font-bold text-teal-400 mb-1">CHUYÊN CẦN: {bill.attendance_rate}%</div>
          <div class="text-slate-300">Tham gia {bill.attendance_attended_sessions}/{bill.attendance_total_sessions} buổi trọn vẹn cùng Cô Dung.</div>
        </div>
        <div class="p-4 rounded-2xl bg-slate-950 border border-emerald-500/40">
          <div class="font-bold text-emerald-400 mb-1">TĂNG TRƯỞNG: +{bill.growth_percentage}%</div>
          <div class="text-slate-300 line-clamp-2">{bill.growth_notes}</div>
        </div>
      </div>

      <!-- Tuition & Stars -->
      <div class="my-5 rounded-2xl bg-slate-950 border border-teal-500/30 p-4 space-y-2 text-xs">
        <div class="flex justify-between text-slate-300">
          <span>Học phí định kỳ:</span>
          <span>{bill.base_tuition_vnd.toLocaleString('vi-VN')} đ</span>
        </div>
        <div class="flex justify-between text-amber-400 font-bold">
          <span>Trừ thưởng {bill.stars_deducted.toLocaleString('vi-VN')} Sao:</span>
          <span>-{bill.discount_vnd.toLocaleString('vi-VN')} đ</span>
        </div>
        <div class="flex justify-between text-base font-black text-white pt-2 border-t border-slate-800">
          <span class="text-teal-400">THỰC NỘP:</span>
          <span class="text-emerald-400">{bill.final_amount_vnd.toLocaleString('vi-VN')} đ</span>
        </div>
      </div>

      <!-- QR -->
      <div class="p-4 rounded-2xl bg-slate-950 border border-slate-800 flex items-center justify-between gap-4 text-xs">
        <div>
          <div class="font-bold text-teal-400">VIETQR THANH TOÁN TIẾNG ANH CÔ DUNG:</div>
          <div class="text-slate-300">{bill.bank_name} • {bill.bank_account}</div>
          <div class="text-slate-400">Chủ TK: {bill.account_holder} &amp; Cô Dung</div>
        </div>
        <img src={bill.vietqr_url} alt="" class="w-28 h-28 rounded-lg bg-white p-1" />
      </div>
    </div>

  <!-- ==================== TEMPLATE 3: CHIẾN BINH IELTS / CAMBRIDGE (MODERN MINT) ==================== -->
  {:else if templateId === 3}
    <div class="bill-page bg-white text-slate-900 rounded-3xl p-8 border-4 border-cyan-500 shadow-2xl relative font-sans">
      <div class="flex items-center justify-between border-b-2 border-cyan-500 pb-4">
        <div>
          <span class="text-xs font-black text-cyan-600 uppercase tracking-widest">TIẾNG ANH CÔ DUNG • IELTS &amp; THPT QG ACADEMY</span>
          <h1 class="text-2xl font-black text-slate-900 mt-0.5">TIẾNG ANH CÔ DUNG - ĐÁNH GIÁ NĂNG LỰC &amp; HỌC PHÍ</h1>
        </div>
        <div class="text-3xl">🌍</div>
      </div>

      <div class="grid grid-cols-3 gap-3 my-4 text-xs p-4 bg-cyan-50/60 rounded-2xl border border-cyan-200">
        <div>Học sinh: <strong class="text-slate-900 block">{bill.student_name}</strong></div>
        <div>Khóa: <strong class="text-slate-900 block">{bill.program_name}</strong></div>
        <div>Tăng trưởng: <strong class="text-cyan-700 block">+{bill.growth_percentage}% (Vượt bậc)</strong></div>
      </div>

      <!-- Skills Radar -->
      <div class="grid grid-cols-5 gap-2 text-center text-xs my-4">
        <div class="p-2 rounded-xl bg-slate-100 font-bold">Nghe: {bill.eval_listening}</div>
        <div class="p-2 rounded-xl bg-slate-100 font-bold">Đọc: {bill.eval_reading}</div>
        <div class="p-2 rounded-xl bg-slate-100 font-bold">Viết: {bill.eval_writing}</div>
        <div class="p-2 rounded-xl bg-slate-100 font-bold">Nói: {bill.eval_speaking}</div>
        <div class="p-2 rounded-xl bg-slate-100 font-bold">Grammar: {bill.eval_grammar}</div>
      </div>

      <div class="p-4 rounded-2xl bg-cyan-600 text-white flex justify-between items-center my-4">
        <div>
          <div class="text-xs opacity-80">Tổng thanh toán sau khi trừ {bill.stars_deducted} Sao:</div>
          <div class="text-2xl font-black">{bill.final_amount_vnd.toLocaleString('vi-VN')} đ</div>
        </div>
        <img src={bill.vietqr_url} alt="" class="w-24 h-24 rounded-lg bg-white p-1" />
      </div>
    </div>

  <!-- ==================== TEMPLATE 4: KHU VƯỜN CẦU VỒNG (PLAYFUL PASTEL) ==================== -->
  {:else if templateId === 4}
    <div class="bill-page bg-gradient-to-br from-green-50 via-emerald-50 to-lime-50 text-slate-800 rounded-3xl p-8 border-4 border-lime-300 shadow-2xl relative font-sans">
      <div class="text-center space-y-1 border-b-2 border-lime-200 pb-4">
        <div class="text-4xl">🌈 🐥 🌱</div>
        <h1 class="text-2xl font-black text-emerald-900">TIẾNG ANH CÔ DUNG - PHIẾU BÁO BÉ HỌC TỐT &amp; HỌC PHÍ</h1>
        <div class="text-xs text-lime-700 font-bold">Tháng {bill.billing_period} • {bill.student_name} ({bill.grade_level})</div>
      </div>

      <div class="p-4 rounded-2xl bg-white/90 border border-lime-200 my-4 text-xs space-y-2">
        <div>Bé đã đi học: <strong>{bill.attendance_attended_sessions}/{bill.attendance_total_sessions} buổi</strong> (Chuyên cần: Rất ngoan)</div>
        <div>Điểm thưởng bé tích được: <strong class="text-amber-600">⭐ {bill.stars_deducted} Sao = Bớt {bill.discount_vnd.toLocaleString('vi-VN')} đ</strong></div>
        <div class="text-sm font-black text-emerald-800 pt-1 border-t border-lime-100">
          Học phí mẹ gửi Cô Dung: {bill.final_amount_vnd.toLocaleString('vi-VN')} đ
        </div>
      </div>

      <div class="flex items-center justify-between p-4 bg-white rounded-2xl border border-lime-200">
        <div class="text-xs text-slate-600">
          <div>Quét mã VietQR chuyển học phí cho bé:</div>
          <div class="font-bold text-slate-900">{bill.bank_name} - {bill.bank_account}</div>
        </div>
        <img src={bill.vietqr_url} alt="" class="w-24 h-24 rounded-lg border border-lime-300 p-1" />
      </div>
    </div>

  <!-- ==================== TEMPLATE 5: BẢNG VÀNG DANH DỰ (HONOR FOREST GOLD) ==================== -->
  {:else}
    <div class="bill-page bg-emerald-950 text-amber-100 rounded-3xl p-8 border-4 border-amber-400 shadow-2xl relative font-serif">
      <div class="border-2 border-amber-400/60 p-6 rounded-2xl">
        <div class="text-center space-y-1 border-b border-amber-400/40 pb-4">
          <div class="text-xs tracking-widest text-amber-300 uppercase font-sans">TIẾNG ANH CÔ DUNG • BẢNG VÀNG THÀNH TÍCH</div>
          <h1 class="text-2xl font-bold text-amber-200">TIẾNG ANH CÔ DUNG - BẢNG VÀNG THÀNH TÍCH &amp; HỌC PHÍ</h1>
          <div class="text-xs text-amber-400/80 font-sans">{bill.student_name} • {bill.grade_level} • {bill.billing_period}</div>
        </div>

        <div class="my-4 text-xs font-sans space-y-2 text-slate-200">
          <div class="flex justify-between">
            <span>Tăng trưởng học lực:</span>
            <strong class="text-amber-300">+{bill.growth_percentage}% ({bill.growth_status})</strong>
          </div>
          <div class="flex justify-between">
            <span>Học phí định mức:</span>
            <span>{bill.base_tuition_vnd.toLocaleString('vi-VN')} đ</span>
          </div>
          <div class="flex justify-between text-amber-400">
            <span>Thưởng Sao danh dự (-{bill.stars_deducted} ⭐):</span>
            <span>-{bill.discount_vnd.toLocaleString('vi-VN')} đ</span>
          </div>
          <div class="flex justify-between text-base font-bold text-amber-200 pt-2 border-t border-amber-400/40">
            <span>TỔNG THU:</span>
            <span>{bill.final_amount_vnd.toLocaleString('vi-VN')} đ</span>
          </div>
        </div>

        <div class="flex items-center justify-between pt-3 border-t border-amber-400/40 font-sans text-xs">
          <div class="text-slate-300">
            <div>Chuyển khoản VietQR Tiếng Anh Cô Dung:</div>
            <strong class="text-amber-200">{bill.bank_account} ({bill.account_holder} &amp; Cô Dung)</strong>
          </div>
          <img src={bill.vietqr_url} alt="" class="w-24 h-24 rounded-lg bg-white p-1" />
        </div>
      </div>
    </div>
  {/if}
</div>

<style>
  @media print {
    :global(body) {
      background: white !important;
      color: black !important;
    }
    :global(header), :global(footer), .no-print {
      display: none !important;
    }
    .bill-page {
      box-shadow: none !important;
      border-width: 2px !important;
      page-break-inside: avoid;
      max-width: 100% !important;
      margin: 0 !important;
      padding: 20px !important;
    }
  }
</style>
