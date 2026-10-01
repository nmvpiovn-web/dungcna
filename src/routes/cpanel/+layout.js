// P0 fix (2026-10-01): disable prerendering for /cpanel and all sub-routes.
// The +layout.server.js guard must run at REQUEST time with the real
// session/cookie. Prerendering bakes a build-time (unauthenticated) redirect
// into static HTML, locking out every user including valid sessions.
export const prerender = false;
