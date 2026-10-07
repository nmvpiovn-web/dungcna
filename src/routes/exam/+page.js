export const prerender = false;

// D1-only: tat ca data lay tu API (khong con JSON static)
export async function load({ fetch }) {
  const [examsRes, questionsRes, studentsRes, scheduleRes] = await Promise.all([
    fetch('/api/exams').then(r => r.json()).catch(() => ({})),
    fetch('/api/questions?limit=200').then(r => r.json()).catch(() => ({})),
    fetch('/api/students').then(r => r.json()).catch(() => ({})),
    fetch('/api/schedule').then(r => r.json()).catch(() => ({}))
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
