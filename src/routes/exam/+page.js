export const prerender = false;

// D1-only: tat ca data lay tu API (khong con JSON static)
export async function load({ fetch }) {
  const safeJson = async (url) => {
    try {
      const r = await fetch(url);
      if (!r.ok) return {};
      const text = await r.text();
      if (!text) return {};
      return JSON.parse(text);
    } catch {
      return {};
    }
  };

  const [examsRes, questionsRes, studentsRes, scheduleRes] = await Promise.all([
    safeJson('/api/exams'),
    safeJson('/api/questions?limit=200'),
    safeJson('/api/students'),
    safeJson('/api/schedule')
  ]);

  const allQuestions = questionsRes.data || [];

  return {
    seo: {"title": "Thi Thử Tiếng Anh 5 Phút Miễn Phí — Biết Ngay Trình Độ", "description": "Làm bài thi thử tiếng Anh 5 phút, chấm điểm tự động, đánh giá trình độ CEFR A1–C1 miễn phí."},
    exams: examsRes.exams || [],
    curricula: [],
    defaultQuestions: allQuestions.slice(0, 15),
    allQuestions,
    sessions: scheduleRes.sessions || scheduleRes.data || [],
    users: studentsRes.students || studentsRes.data || []
  };
}
