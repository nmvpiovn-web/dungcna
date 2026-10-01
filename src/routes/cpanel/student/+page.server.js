// src/routes/cpanel/student/+page.server.js
// Server-side role gate: only students (and superadmin) can access.
import { redirect } from '@sveltejs/kit';
import { guardRouteAuth } from '$lib/server/auth.js';

export async function load({ request, platform }) {
  const { ok } = await guardRouteAuth(request, platform, ['student', 'superadmin', 'admin']);
  if (!ok) throw redirect(303, '/cpanel');
  return {};
}
