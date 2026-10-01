// src/routes/cpanel/leader/+page.server.js
// Server-side role gate: only leaders (and superadmin/admin) can access.
import { redirect } from '@sveltejs/kit';
import { guardRouteAuth } from '$lib/server/auth.js';

export async function load({ request, platform }) {
  const { ok } = await guardRouteAuth(request, platform, ['leader', 'superadmin', 'admin']);
  if (!ok) throw redirect(303, '/cpanel');
  return {};
}
