<script>
  import SectionHeading from '$lib/components/ui/SectionHeading.svelte';
  import BadgeShelf from '$lib/components/ui/BadgeShelf.svelte';
  import LeaderboardTable from '$lib/components/ui/LeaderboardTable.svelte';
  import StreakBadge from '$lib/components/ui/StreakBadge.svelte';
  import XpPill from '$lib/components/ui/XpPill.svelte';
  import UiButton from '$lib/components/ui/UiButton.svelte';
  import { CEFR_BADGES } from '$lib/gamification.js';

  const commitments = [
    { emoji: '🎯', title: 'Lộ trình cá nhân', desc: '100% học viên có roadmap riêng sau test xếp lớp 3 phút — không học chung một khuôn. Mỗi tháng rà soát lại một lần.' },
    { emoji: '📈', title: 'Báo cáo minh bạch', desc: 'Điểm số, streak ngày học, huy hiệu CEFR được gửi Zalo cho phụ huynh mỗi tuần. Con tiến bộ đến đâu, ba mẹ thấy đến đó.' },
    { emoji: '🏅', title: 'Huy hiệu theo chuẩn CEFR', desc: 'Từ A1 đến C1 — mỗi mốc là một huy hiệu con có thể khoe với cả nhà, và là căn cứ xếp lớp tiếp theo.' },
    { emoji: '👩‍🏫', title: 'Nhóm nhỏ 1:1 / 1:3', desc: 'Cô Dung theo sát từng học viên. Lớp nhỏ nên không bạn nào bị "chìm" giữa đám đông.' },
    { emoji: '⭐', title: 'Sao thưởng trừ học phí', desc: '100 Sao = 1.000đ trừ trực tiếp vào học phí. Con càng chăm, ba mẹ càng nhẹ gánh.' },
    { emoji: '🔥', title: 'Streak ngày học', desc: 'Học đều mỗi ngày 10–15 phút qua game và flashcards quan trọng hơn học dồn. Streak là thước đo của sự đều đặn.' }
  ];

  const howTo = [
    { step: '1', emoji: '📝', title: 'Test xếp lớp 3 phút', desc: 'Biết ngay trình độ CEFR hiện tại và điểm mạnh/yếu từng kỹ năng.' },
    { step: '2', emoji: '🗺️', title: 'Nhận lộ trình cá nhân', desc: 'Cô Dung xây roadmap từ mốc hiện tại đến mục tiêu (vào 10, IELTS...).' },
    { step: '3', emoji: '🔥', title: 'Giữ streak, tích XP', desc: 'Học mỗi ngày qua game, flashcards, luyện đề — streak càng dài, huy hiệu càng xịn.' },
    { step: '4', emoji: '🏆', title: 'Lên bảng vàng', desc: 'Đạt mốc CEFR mới = huy hiệu mới + tên con xuất hiện trong bảng xếp hạng lớp.' }
  ];
</script>

<svelte:head>
  <title>Hall of Fame - Tiếng Anh Cô Dung (timbk.io.vn)</title>
  <meta name="description" content="Bảng vàng vinh danh: huy hiệu CEFR, streak ngày học và cam kết chương trình tại Tiếng Anh Cô Dung." />
  <link rel="canonical" href="https://timbk.io.vn/hall-of-fame" />
</svelte:head>

<div class="max-w-6xl mx-auto px-3 sm:px-4 py-6 sm:py-8 pb-24 lg:pb-10 space-y-10">
  <SectionHeading
    eyebrow="🏆 Hall of Fame"
    title="Bảng vàng của những nỗ lực đều đặn"
    sub="Chúng tôi không vinh danh điểm số một lần — chúng tôi vinh danh sự tiến bộ bền bỉ: streak, huy hiệu CEFR và từng nấc thang con đã leo."
    center
  />

  <!-- Huy hieu CEFR cua ban -->
  <section class="rounded-3xl bg-surface-0 border border-line p-5 sm:p-8 shadow-sm">
    <div class="flex flex-wrap items-center justify-between gap-3 mb-5">
      <h2 class="font-heading text-lg sm:text-xl font-extrabold text-ink-900">🏅 Huy hiệu CEFR của bạn</h2>
      <div class="flex items-center gap-2"><StreakBadge /><XpPill /></div>
    </div>
    <BadgeShelf defs={CEFR_BADGES} />
    <p class="text-xs text-ink-500 mt-4">Đăng nhập và hoàn thành test xếp lớp để bắt đầu sưu tầm huy hiệu. Mỗi mốc CEFR mới mở khóa một huy hiệu.</p>
    <div class="mt-4 flex flex-wrap gap-3">
      <UiButton href="/exam#placement" size="sm">📝 Test xếp lớp ngay</UiButton>
      <UiButton href="/games" size="sm" variant="ghost">🎮 Tích XP mỗi ngày</UiButton>
    </div>
  </section>

  <!-- Bang xep hang lop (an toan: chi pham vi lop) -->
  <section>
    <SectionHeading eyebrow="Thi đua lành mạnh" title="Bảng xếp hạng tuần trong lớp" sub="Chỉ hiển thị trong phạm vi lớp học của con — an toàn và riêng tư." />
    <LeaderboardTable scope="class" scopeName="Lớp của bạn" rows={[]} />
  </section>

  <!-- Loi len bang vang -->
  <section>
    <SectionHeading eyebrow="Con đường lên bảng vàng" title="4 bước để tên con xuất hiện ở đây" center />
    <div class="grid sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
      {#each howTo as h}
        <div class="rounded-3xl bg-surface-0 border border-line p-5 shadow-sm relative">
          <div class="absolute top-4 right-4 w-8 h-8 rounded-full bg-brand-600 dark:bg-brand-700 text-white flex items-center justify-center font-extrabold text-sm">{h.step}</div>
          <div class="text-3xl mb-2">{h.emoji}</div>
          <div class="font-extrabold text-ink-900 text-sm mb-1">{h.title}</div>
          <div class="text-xs text-ink-500 leading-relaxed">{h.desc}</div>
        </div>
      {/each}
    </div>
  </section>

  <!-- Cam ket chuong trinh -->
  <section class="rounded-3xl bg-brand-600 dark:bg-brand-700 text-white p-6 sm:p-10 shadow-sm relative overflow-hidden">
    <div class="absolute -right-16 -top-16 w-64 h-64 rounded-full bg-white/10 blur-2xl pointer-events-none"></div>
    <div class="relative z-10">
      <SectionHeading eyebrow="Cam kết" title="Điều chúng tôi đảm bảo với mỗi học viên" dark />
      <div class="grid sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4 mt-2">
        {#each commitments as c}
          <div class="rounded-2xl bg-white/10 border border-white/20 p-4 backdrop-blur-sm">
            <div class="text-2xl mb-2">{c.emoji}</div>
            <div class="font-extrabold text-sm mb-1">{c.title}</div>
            <div class="text-xs text-white/85 leading-relaxed">{c.desc}</div>
          </div>
        {/each}
      </div>
    </div>
  </section>
</div>

