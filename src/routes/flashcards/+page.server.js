// MINIMAL TEST - isolate 500 cause
export const prerender = false;

export async function load() {
  return {
    words: [{ id: 'test1', term: 'hello', meaning_vi: 'xin chao' }],
    units: [],
    source: 'minimal-test'
  };
}
