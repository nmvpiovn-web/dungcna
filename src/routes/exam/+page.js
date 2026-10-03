export const prerender = false;
export const ssr = false;

// D1-only: tat ca data lay tu API (khong con JSON static)
export async function load({ fetch }) {
  const [examsRes, questionsRes, studentsRes, scheduleRes] = await Promise.all([
    fetch('/api/exams').then(r => r.json()).catch(() => ({})),
    fetch('/api/questions?limit=2000').then(r => r.json()).catch(() => ({})),
    fetch('/api/students').then(r => r.json()).catch(() => ({})),
    fetch('/api/schedule').then(r => r.json()).catch(() => ({}))
  ]);

  const allQuestions = questionsRes.data || [];

  return {
    exams: examsRes.exams || [],
    curricula: [],
    defaultQuestions: allQuestions.slice(0, 15),
    allQuestions,
    sessions: scheduleRes.sessions || scheduleRes.data || [],
    users: studentsRes.students || studentsRes.data || []
  };
}
