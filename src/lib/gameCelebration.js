const TIERS = [
  { min: 0.9, stars: 3, label: 'Xuất sắc', message: 'Phản xạ tiếng Anh của bạn rất tốt. Giữ vững phong độ nhé!' },
  { min: 0.65, stars: 2, label: 'Tiến bộ tốt', message: 'Bạn đang tiến bộ rõ rệt. Thử lại để chinh phục đủ 3 sao!' },
  { min: 0, stars: 1, label: 'Đã hoàn thành', message: 'Mỗi lần luyện tập đều giúp bạn nhớ tiếng Anh lâu hơn.' }
];

export function buildCelebrationResult(score = 0, maxScore = 0) {
  const safeScore = Number.isFinite(Number(score)) ? Math.max(0, Number(score)) : 0;
  const safeMax = Number.isFinite(Number(maxScore)) ? Math.max(0, Number(maxScore)) : 0;
  const ratio = safeMax > 0 ? Math.min(1, safeScore / safeMax) : 1;
  const tier = TIERS.find((item) => ratio >= item.min) || TIERS[TIERS.length - 1];

  return { ...tier, ratio, percent: Math.round(ratio * 100) };
}
