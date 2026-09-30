// src/routes/admincp/+layout.server.js
// RB-C1 (2026-09-30): server-side guard for /admincp.
// The page itself has no client-side role gate; its APIs (campuses, homework)
// require staff privileges (isStaffUser): superadmin | admin | leader | teacher.
import { redirect } from '@sveltejs/kit';
import { guardRouteAuth } from '$lib/server/auth.js';

// N3: serve with or without trailing slash — never emit a 308 redirect loop.
export const trailingSlash = 'ignore';

const ALLOWED_ROLES = ['superadmin', 'admin', 'leader', 'teacher'];

export async function load({ request, platform }) {
  const { ok } = await guardRouteAuth(request, platform, ALLOWED_ROLES);
  if (!ok) throw redirect(303, '/?login=1');
  return {};
}
