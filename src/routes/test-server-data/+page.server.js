// src/routes/test-server-data/+page.server.js
export const prerender = false;

export async function load() {
  return {
    message: 'Server load works!',
    timestamp: new Date().toISOString(),
    test: 123
  };
}
