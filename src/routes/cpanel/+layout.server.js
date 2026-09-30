// src/routes/cpanel/+layout.server.js
// RB-C1 (2026-09-30): server-side guard for /cpanel.
// Requires an authenticated session (any role); the client-side layout
// (cpanel/+layout.svelte) performs its own per-role routing to sub-routes.
import { redirect } from '@sveltejs/kit';
import { guardRouteAuth } from '$lib/server/auth.js';

// N3: serve with or without trailing slash — never emit a 308 redirect loop.
export const trailingSlash = 'ignore';

export async function load({ request, platform }) {
  const { ok } = await guardRouteAuth(request, platform, null);
  if (!ok) throw redirect(303, '/?login=1');
  return {};
}
