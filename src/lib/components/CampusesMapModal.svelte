<script>
  let { isOpen = $bindable(false), onClose = () => {} } = $props();

  const campusesData = [
    {
      id: 'center_daosontay',
      name: 'Trường Tiểu Học Đào Sơn Tây (Cụm Vệ Tinh Trọng Tâm)',
      type: 'Trường Liên Kết Trọng Điểm',
      address: 'Đường số 8, Phường Linh Xuân, TP. Thủ Đức, TP. Hồ Chí Minh',
      lat: 10.8753,
      lng: 106.7725,
      distanceFromCenter: '0 m (Điểm gốc kết nối)',
      features: ['Hơn 1.200 học sinh K12', 'Câu lạc bộ tiếng Anh ngoại khóa', 'Điểm đón học sinh trung tâm']
    },
    {
      id: 'loc_codung',
      name: 'Nhà Cô Dung (Trụ Sở Chính - Điểm Dạy Linh Xuân)',
      type: 'Trụ Sở Giảng Dạy Chính',
      address: 'Khu phố 3, Phường Linh Xuân, TP. Thủ Đức, TP. Hồ Chí Minh',
      lat: 10.8735,
      lng: 106.7710,
      distanceFromCenter: '~350 mét (5 phút đi bộ từ trường Đào Sơn Tây)',
      features: ['Lớp chuyên sâu 10-15 học sinh', 'Phòng lab luyện phát âm', 'Kho học liệu Obsidian Second-Brain']
    },
    {
      id: 'loc_sunshine',
      name: 'Cơ Sở Sunshine Academy (Điểm Dạy Phụ)',
      type: 'Cơ Sở Vệ Tinh',
      address: 'Khu dân cư Sunshine, Phường Linh Trung, TP. Thủ Đức, TP. Hồ Chí Minh',
      lat: 10.8780,
      lng: 106.7760,
      distanceFromCenter: '~650 mét (Di chuyển 2 phút xe máy)',
      features: ['Phòng học máy lạnh tiêu chuẩn', 'Giáo viên bản ngữ ESL', 'Lớp tiểu học song ngữ']
    },
    {
      id: 'loc_thayvu',
      name: 'Cơ Sở Luyện Thi Thầy Vũ (Điểm Dạy Liên Kết)',
      type: 'Cơ Sở Liên Kết',
      address: 'Đường Kha Vạn Cân, Phường Linh Chiểu, TP. Thủ Đức, TP. Hồ Chí Minh',
      lat: 10.8690,
      lng: 106.7680,
      distanceFromCenter: '~900 mét (Di chuyển 4 phút)',
      features: ['Luyện thi THPT Quốc Gia & Vào 10', 'Ngân hàng đề thi chuẩn Bộ GD&ĐT', 'Phòng tự học yên tĩnh']
    }
  ];

  let selectedCampus = $state(campusesData[0]);

  function getGoogleMapsUrl(lat, lng) {
    return `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`;
  }
</script>

{#if isOpen}
  <div class="fixed inset-0 z-50 bg-slate-950/75 backdrop-blur-sm flex items-center justify-center p-4">
    <div class="bg-white dark:bg-slate-900 rounded-lg max-w-2xl w-full border border-slate-200 dark:border-slate-800 shadow-2xl p-6 space-y-5 text-xs max-h-[90vh] overflow-y-auto">
      <div class="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-3">
        <div class="flex items-center gap-2">
          <span class="text-sm font-semibold text-cyan-600 dark:text-cyan-400">📍 Bản Đồ Vệ Tinh Cơ Sở &amp; Cụm Trường Học</span>
        </div>
        <button onclick={onClose} class="text-slate-400 hover:text-slate-600 font-bold p-1 text-sm">✕</button>
      </div>

      <div class="space-y-1">
        <h2 class="text-base font-semibold text-slate-900 dark:text-white">
          Cụm Điểm Dạy Tiếng Anh Cô Dung — Khu Vực Linh Xuân, Thủ Đức
        </h2>
        <p class="text-slate-600 dark:text-slate-400 leading-relaxed">
          Tọa độ chuẩn xác xoay quanh trọng tâm <strong>Trường Tiểu học Đào Sơn Tây</strong>, bán kính di chuyển thuận tiện dưới 1km cho phụ huynh và học sinh.
        </p>
      </div>

      <!-- Campus Cards Grid -->
      <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {#each campusesData as c}
          {@const isChosen = selectedCampus.id === c.id}
          <button 
            type="button"
            onclick={() => selectedCampus = c}
            class="p-3.5 rounded-lg border text-left transition-colors space-y-1.5 {isChosen ? 'bg-cyan-50 dark:bg-cyan-950/60 border-cyan-500 shadow-sm' : 'bg-slate-50 dark:bg-slate-800/40 border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800'}"
          >
            <div class="flex items-center justify-between">
              <span class="font-semibold text-slate-900 dark:text-white text-xs">{c.name}</span>
              {#if isChosen}
                <span class="text-cyan-600 font-bold text-xs">✓ Chọn</span>
              {/if}
            </div>
            <div class="text-[11px] text-slate-500 dark:text-slate-400">
              📍 {c.address}
            </div>
            <div class="text-[11px] text-cyan-700 dark:text-cyan-300 font-medium">
              Khoảng cách: <strong>{c.distanceFromCenter}</strong>
            </div>
          </button>
        {/each}
      </div>

      <!-- Selected Campus Deep Detail & Map Navigation -->
      {#if selectedCampus}
        <div class="p-4 rounded-lg bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 space-y-3">
          <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-200 dark:border-slate-700 pb-2">
            <div>
              <h3 class="text-sm font-semibold text-slate-900 dark:text-white">{selectedCampus.name}</h3>
              <p class="text-[11px] text-slate-500 dark:text-slate-400">Tọa độ vệ tinh GPS: <span class="font-mono text-slate-700 dark:text-slate-300">{selectedCampus.lat}, {selectedCampus.lng}</span></p>
            </div>
            <a 
              href={getGoogleMapsUrl(selectedCampus.lat, selectedCampus.lng)}
              target="_blank" 
              rel="noopener noreferrer"
              class="px-3.5 py-1.5 rounded-md font-semibold bg-cyan-600 hover:bg-cyan-700 text-white flex items-center gap-1.5 transition-colors shadow-sm self-start sm:self-auto"
            >
              <span>🗺️</span>
              <span>Chỉ Đường Google Maps</span>
            </a>
          </div>

          <div class="space-y-1">
            <span class="font-semibold text-slate-700 dark:text-slate-300">Đặc điểm cơ sở:</span>
            <ul class="list-disc list-inside text-slate-600 dark:text-slate-400 space-y-0.5">
              {#each selectedCampus.features as f}
                <li>{f}</li>
              {/each}
            </ul>
          </div>
        </div>
      {/if}

      <div class="flex justify-end pt-1">
        <button onclick={onClose} class="px-5 py-2 rounded-md font-semibold bg-slate-900 hover:bg-slate-800 text-white">
          Đóng
        </button>
      </div>
    </div>
  </div>
{/if}
