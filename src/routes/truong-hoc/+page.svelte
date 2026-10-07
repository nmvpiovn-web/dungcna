<script>
 import SectionHeading from '$lib/components/ui/SectionHeading.svelte';
 import RoadmapPath from '$lib/components/ui/RoadmapPath.svelte';
 import StatCounter from '$lib/components/ui/StatCounter.svelte';
 import FaqAccordion from '$lib/components/ui/FaqAccordion.svelte';
 import UiButton from '$lib/components/ui/UiButton.svelte';
 import { SITE_CONTACT } from '$lib/site.js';

 const roadmapNodes = [
 { label: 'Mất gốc', sub: 'Phục hồi nền tảng', status: 'done' },
 { label: 'A1 → A2', sub: 'Lớp 6–7 Global Success', status: 'current' },
 { label: 'B1', sub: 'Lớp 8–9, luyện vào 10', status: 'locked' },
 { label: 'B2', sub: 'IELTS Foundation', status: 'locked' },
 { label: 'C1', sub: 'IELTS 6.5+, HSG', status: 'locked' }
 ];

 const methods = [
 { emoji: '🎮', title: 'Học qua game', desc: 'Game từ vựng, phát âm, phản xạ — con học 10 phút mỗi ngày mà không thấy chán.' },
 { emoji: '🃏', title: 'Flashcards SRS', desc: 'Hệ thống nhắc ôn đúng thời điểm não sắp quên — nhớ lâu gấp nhiều lần học vẹt.' },
 { emoji: '📝', title: 'Ngân hàng đề thật', desc: 'Hơn 1.300 câu hỏi theo ma trận đề Bộ GD: 15 phút, 45 phút, thi thử vào 10.' },
 { emoji: '👩‍🏫', title: 'Lớp nhỏ 1:1 / 1:3', desc: 'Cô Dung kèm sát từng bạn, sửa từng lỗi phát âm và từng câu viết.' },
 { emoji: '📊', title: 'Đánh giá 5 kỹ năng', desc: 'Nghe – Nói – Đọc – Viết – Ngữ pháp được đo định kỳ, có báo cáo chi tiết.' },
 { emoji: '💬', title: 'Báo cáo Zalo', desc: 'Phụ huynh nhận tiến bộ của con mỗi tuần, không cần hỏi "hôm nay học gì?".' }
 ];

 const faqs = [
 { q: 'Trường có những lớp nào?', a: 'Lớp 7 (A2–B1), Lớp 8 (B1), Lớp 9 luyện thi vào 10 (B1–B2) và IELTS Foundation. Xem chi tiết tại trang Khóa học và Bảng giá.' },
 { q: 'Con mất gốc có theo kịp không?', a: 'Có. 100% học viên mới đều làm test xếp lớp 3 phút, từ đó cô xây lộ trình phục hồi nền tảng riêng trước khi vào chương trình chính.' },
 { q: 'Học phí bao nhiêu?', a: 'Từ 1.200.000đ/tháng tùy lớp, đã bao gồm toàn bộ học liệu. Đóng theo học kỳ/năm được giữ chỗ ưu tiên. Xem trang Bảng giá.' },
 { q: 'Làm sao để đăng ký học?', a: 'Nhấn nút Zalo trên trang này để chat trực tiếp với cô Dung, hoặc làm test xếp lớp trước để được tư vấn lộ trình phù hợp nhất.' }
 ];
</script>

<div class="max-w-6xl mx-auto px-3 sm:px-4 py-6 sm:py-8 pb-24 lg:pb-10 space-y-10">
 <!-- Hero -->
 <section class="rounded-3xl bg-brand-600 text-white p-6 sm:p-10 shadow-sm relative overflow-hidden">
 <div class="absolute -right-16 -top-16 w-72 h-72 rounded-full bg-white/10 blur-3xl pointer-events-none"></div>
 <div class="absolute -left-10 -bottom-16 w-56 h-56 rounded-full bg-accent-500/20 blur-3xl pointer-events-none"></div>
 <div class="relative z-10 max-w-2xl">
 <div class="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/15 border border-white/25 text-xs font-extrabold tracking-widest mb-4">🏫 TRƯỜNG HỌC</div>
 <h1 class="font-heading text-2xl sm:text-4xl font-extrabold leading-tight">Tiếng Anh Cô Dung — nơi con hết sợ tiếng Anh</h1>
 <p class="text-white/85 text-sm sm:text-base mt-3 leading-relaxed">
 Hệ thống đào tạo tiếng Anh K12 theo chuẩn CEFR: test xếp lớp miễn phí, lộ trình cá nhân,
 lớp nhỏ 1:1/1:3, ngân hàng đề hơn 1.300 câu và báo cáo tiến bộ gửi Zalo phụ huynh mỗi tuần.
 </p>
 <div class="flex flex-wrap gap-3 mt-6">
 <a href={SITE_CONTACT.zaloUrl} target="_blank" rel="noopener noreferrer" class="inline-flex items-center gap-2 px-6 py-3 rounded-2xl bg-white text-brand-700 font-extrabold text-sm shadow-sm hover:scale-[1.03] transition-transform">💬 Chat Zalo với cô Dung</a>
 <UiButton href="/exam#placement" variant="ghost" class="border-white/40 text-white hover:bg-white/10">📝 Test xếp lớp 3 phút</UiButton>
 </div>
 </div>
 </section>

 <!-- Phuong phap -->
 <section>
 <SectionHeading eyebrow="Phương pháp" title="6 điều làm nên sự khác biệt" center />
 <div class="grid sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
 {#each methods as m}
 <div class="rounded-3xl bg-surface-0 border border-line p-5 shadow-sm">
 <div class="text-3xl mb-2">{m.emoji}</div>
 <div class="font-extrabold text-ink-900 text-sm mb-1">{m.title}</div>
 <div class="text-xs text-ink-500 leading-relaxed">{m.desc}</div>
 </div>
 {/each}
 </div>
 </section>

 <!-- Lo trinh -->
 <section class="rounded-3xl bg-surface-0 border border-line p-5 sm:p-8 shadow-sm">
 <SectionHeading eyebrow="Lộ trình CEFR" title="Mỗi học viên đều biết mình đang ở đâu" />
 <RoadmapPath nodes={roadmapNodes} />
 </section>

 <!-- Cac lop -->
 <section>
 <SectionHeading eyebrow="Các lớp đang tuyển" title="Chọn đúng lớp theo trình độ của con" center actionLabel="Xem bảng giá →" actionHref="/bang-gia" />
 <div class="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
 {#each [
 { grade: 'Lớp 7', level: 'A2 → B1', price: '1.200.000đ/th' },
 { grade: 'Lớp 8', level: 'B1', price: '1.350.000đ/th' },
 { grade: 'Lớp 9', level: 'B1 → B2', price: '1.500.000đ/th' },
 { grade: 'IELTS Foundation', level: 'B1+ → B2', price: '1.800.000đ/th' }
 ] as c}
 <a href="/bang-gia" class="rounded-3xl bg-surface-0 border border-line p-5 shadow-sm hover:shadow-md hover:border-brand-200 transition-all block">
 <div class="font-extrabold text-ink-900">{c.grade}</div>
 <div class="text-xs text-brand-600 font-bold mt-0.5">{c.level}</div>
 <div class="text-sm font-extrabold text-ink-900 mt-2">{c.price}</div>
 </a>
 {/each}
 </div>
 </section>

 <!-- FAQ -->
 <section>
 <SectionHeading eyebrow="Hỏi đáp" title="Về trường học" center />
 <FaqAccordion items={faqs} />
 </section>
</div>

