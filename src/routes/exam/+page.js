import { getExams, getCurricula, getAllClassSessions, getAllUsers } from '$lib/unifiedStore';
import { getStaticQuestions } from '$lib/staticDb';
import allQuestionsData from '$lib/data/questions.json';

export const prerender = false;
export const ssr = false;

export function load() {
  return {
    exams: getExams(),
    curricula: getCurricula(),
    defaultQuestions: getStaticQuestions(),
    allQuestions: allQuestionsData,
    sessions: getAllClassSessions(),
    users: getAllUsers()
  };
}
