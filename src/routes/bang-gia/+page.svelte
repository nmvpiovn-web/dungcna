<script>
 import PriceCard from '$lib/components/ui/PriceCard.svelte';
 import CountdownTimer from '$lib/components/ui/CountdownTimer.svelte';
 import SectionHeading from '$lib/components/ui/SectionHeading.svelte';
 import FaqAccordion from '$lib/components/ui/FaqAccordion.svelte';
 import { SITE_CONTACT } from '$lib/site.js';

 // Gia that tu /courses (kiem chung 2026-09-30)
 const PLANS = [
 {
 id: 'g7',
 title: 'Lớp 7 · A2 → B1',
 gradeBand: 'THCS',
 monthly: 1200000,
 oldMonthly: 1500000,
 features: ['Bám sát Global Success 7', 'Ngân hàng đề 15p – 45p', 'Báo cáo Zalo hằng tuần', 'Tích Sao trừ học phí'],
 gifts: ['Miễn phí test xếp lớp đầu vào'],
 commitments: ['Hoàn học phí nếu không tiến bộ sau 1 tháng*']
 },
 {
 id: 'g9',
 title: 'Lớp 9 · B1 → B2',
 gradeBand: 'Luyện vào 10',
 monthly: 1500000,
 oldMonthly: 1800000,
 badge: 'Phổ biến nhất',
 features: ['Luyện đề thi vào 10 các tỉnh', 'Đánh giá năng lực 5 kỹ năng', 'Kèm nhóm nhỏ 1:3', 'Chấm writing theo rubric'],
 gifts: ['Tặng bộ đề vào 10 (PDF)'],
 commitments: ['Cam kết đầu ra chuẩn Bộ GD']
 },
 {
 id: 'ielts',
 title: 'IELTS Foundation',
 gradeBand: 'Chứng chỉ',
 monthly: 1800000,
 oldMonthly: 2200000,
 features: ['4 kỹ năng Nghe–Nói–Đọc–Viết', 'Mock test IELTS định kỳ', 'Lộ trình band 5.5 → 6.5+', 'Giáo viên bản ngữ + GV chuyên ngữ'],
 gifts: ['Tặng 1 buổi mock test 1:1'],
 commitments: ['Kế hoạch học tập cá nhân hóa']
 }
 ];

 const BILLINGS = [
 { key: 'month', label: 'Theo tháng', months: 1, unit: 'tháng' },
 { key: 'semester', label: 'Học kỳ (5 tháng)', months: 5, unit: '5 tháng' },
 { key: 'year', label: 'Năm học (10 tháng)', months: 10, unit: 'năm học' }
 ];
 let billing = $state('month');
 const activeBilling = $derived(BILLINGS.find((b) => b.key === billing));

 const faqs = [
 { q: 'Học phí đã bao gồm học liệu chưa?', a: 'Đã bao gồm toàn bộ: giáo trình, ngân hàng đề, flashcards, mock test và báo cáo Zalo hằng tuần. Không phát sinh thêm.' },
 { q: 'Đóng theo học kỳ/năm có lợi gì?', a: 'Đóng 1 lần cho cả kỳ/năm giúp phụ huynh không phải nhớ lịch đóng phí mỗi tháng, con được giữ chỗ ưu tiên và nhận thêm quà tặng học liệu.' },
 { q: 'Chính sách hoàn học phí thế nào?', a: 'Nếu sau 1 tháng học viên không tiến bộ theo đánh giá năng lực định kỳ, phụ huynh được hoàn phần học phí còn lại. Chi tiết liên hệ Zalo để được tư vấn.' },
 { q: 'Sao thưởng trừ học phí ra sao?', a: 'Con tích Sao qua bài tập, game từ vựng và streak ngày học. Cứ 100 Sao = 1.000đ trừ trực tiếp vào học phí kỳ tiếp theo.' }
 ];

 const compareRows = [
 { label: 'Học phí', g7: '1.200.000đ/th', g9: '1.500.000đ/th', ielts: '1.800.000đ/th' },
 { label: 'Trình độ', g7: 'A2 → B1', g9: 'B1 → B2', ielts: 'B1+ → B2' },
 { label: 'Buổi/tuần', g7: '3 buổi × 90′', g9: '3 buổi × 105′', ielts: '2 buổi × 120′' },
 { label: 'Ngân hàng đề', g7: '✓', g9: '✓', ielts: '✓' },
 { label: 'Báo cáo Zalo hằng tuần', g7: '✓', g9: '✓', ielts: '✓' },
 { label: 'Kèm nhóm nhỏ 1:3', g7: '✓', g9: '✓', ielts: '✓' },
 { label: 'Luyện đề vào 10', g7: '—', g9: '✓', ielts: '—' },
 { label: 'Mock test IELTS', g7: '—', g9: '—', ielts: '✓' }
 ];
</script>

<svelte:head>
 <title>Bảng Giá Học Phí - Tiếng Anh Cô Dung (timbk.io.vn)</title>
 <meta name="description" content="Học phí minh bạch các lớp tiếng Anh THCS và IELTS Foundation tại Tiếng Anh Cô Dung. Ưu đãi khai giảng, tích Sao trừ học phí." />
 <link rel="canonical" href="https://timbk.io.vn/bang-gia" />
</svelte:head>

<div class="max-w-6xl mx-auto px-3 sm:px-4 py-6 sm:py-8 pb-24 lg:pb-10 space-y-8">
 <SectionHeading
 eyebrow="Học phí minh bạch"
 title="Bảng giá năm học 2026"
 sub="Giá theo tháng đã bao gồm toàn bộ học liệu. Đóng theo kỳ để giữ chỗ ưu tiên cho con."
 center
 />

 <!-- Countdown uu dai -->
 <div class="rounded-3xl bg-accent-500/10 border border-accent-500/40 p-5 text-center max-w-xl mx-auto">
 <div class="font-extrabold text-ink-900 text-sm sm:text-base mb-1">🎁 Ưu đãi khai giảng kết thúc trong</div>
 <CountdownTimer />
 <div class="text-xs text-ink-500 mt-1">Giảm 15–20% học phí + tặng bộ đề PDF khi đăng ký hôm nay</div>
 </div>

 <!-- Billing toggle -->
 <div class="flex justify-center">
 <div class="inline-flex rounded-2xl bg-surface-1 border border-line p-1 gap-1">
 {#each BILLINGS as b}
 <button
 type="button"
 onclick={() => (billing = b.key)}
 class={`px-4 py-2 rounded-xl text-xs sm:text-sm font-extrabold transition-all ${billing === b.key ? 'bg-brand-600 text-white shadow-sm' : 'text-ink-500 hover:text-ink-900'}`}
 >
 {b.label}
 </button>
 {/each}
 </div>
 </div>

 <div class="grid md:grid-cols-3 gap-3 sm:gap-4">
 {#each PLANS as p}
 <PriceCard
 title={p.title}
 gradeBand={p.gradeBand}
 price={p.monthly * activeBilling.months}
 unit={activeBilling.unit}
 periodMonths={activeBilling.months}
 oldPrice={p.oldMonthly * activeBilling.months}
 badge={p.badge}
 featured={p.id === 'g9'}
 features={p.features}
 gifts={p.gifts}
 commitments={p.commitments}
 cta="💬 Đăng ký qua Zalo"
 href={SITE_CONTACT.zaloUrl}
 />
 {/each}
 </div>
 <p class="text-center text-xs text-ink-500">* Áp dụng theo đánh giá năng lực định kỳ. Chi tiết chính sách liên hệ Zalo.</p>

 <!-- Comparison table -->
 <section class="rounded-3xl bg-surface-0 border border-line shadow-sm overflow-hidden">
 <div class="px-5 py-4 bg-brand-50 border-b border-brand-200">
 <h3 class="font-heading font-extrabold text-ink-900">📊 So sánh các lớp</h3>
 </div>
 <div class="overflow-x-auto">
 <table class="w-full text-sm min-w-[560px]">
 <thead>
 <tr class="text-left text-xs uppercase tracking-wider text-ink-500 border-b border-line">
 <th class="px-5 py-3 font-extrabold">Tiêu chí</th>
 <th class="px-4 py-3 font-extrabold">Lớp 7</th>
 <th class="px-4 py-3 font-extrabold">Lớp 9</th>
 <th class="px-4 py-3 font-extrabold">IELTS</th>
 </tr>
 </thead>
 <tbody class="divide-y divide-[rgb(var(--line-rgb)/0.6)]">
 {#each compareRows as r}
 <tr>
 <td class="px-5 py-2.5 font-bold text-ink-900 text-xs sm:text-sm">{r.label}</td>
 <td class="px-4 py-2.5 text-ink-500 text-xs sm:text-sm">{r.g7}</td>
 <td class="px-4 py-2.5 text-ink-500 text-xs sm:text-sm">{r.g9}</td>
 <td class="px-4 py-2.5 text-ink-500 text-xs sm:text-sm">{r.ielts}</td>
 </tr>
 {/each}
 </tbody>
 </table>
 </div>
 </section>

 <!-- FAQ -->
 <section>
 <SectionHeading eyebrow="Hỏi đáp" title="Về học phí" center />
 <FaqAccordion items={faqs} />
 </section>
</div>

