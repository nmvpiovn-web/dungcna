// src/routes/cpanel/+page.server.js
// Server-side role-based redirect: send each user to their own dashboard.
import { redirect } from '@sveltejs/kit';
import { guardRouteAuth } from '$lib/server/auth.js';

const ROLE_HOME = {
  student: '/cpanel/student',
  parent: '/cpanel/parent',
  teacher: '/cpanel/teacher',
  leader: '/cpanel/leader',
  admin: '/admin',
  superadmin: '/admin'
};

export async function load({ request, platform }) {
  const { ok, user } = await guardRouteAuth(request, platform, null);
  if (!ok) throw redirect(303, '/?login=1');
  const role = String(user?.role || '').toLowerCase();
  const target = ROLE_HOME[role] || '/?login=1';
  throw redirect(303, target);
}
