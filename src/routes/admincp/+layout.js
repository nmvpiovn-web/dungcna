// P0 fix (2026-10-01): disable prerendering for /admincp (legacy route).
// Same reason as /cpanel: the +layout.server.js guard must run at request
// time, not be baked into static HTML at build time.
export const prerender = false;
