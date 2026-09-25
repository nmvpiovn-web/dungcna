import { getStaticGrammarTopics } from '$lib/staticDb.js';

export function load() {
  return {
    topics: getStaticGrammarTopics()
  };
}
