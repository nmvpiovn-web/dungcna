// src/routes/api/auth/verify/+server.js
import { json } from '@sveltejs/kit';
import { verifyServerAuth } from '$lib/server/auth.js';

export const prerender = false;

export async function GET({ request, platform }) {
  const auth = await verifyServerAuth(request, platform);
  if (!auth.authenticated) {
    return json({ valid: false, authenticated: false, error: auth.error }, { status: auth.status });
  }

  return json({
    valid: true,
    authenticated: true,
    user: auth.user
  });
}

export async function POST({ request, platform }) {
  const auth = await verifyServerAuth(request, platform);
  if (!auth.authenticated) {
    return json({ valid: false, authenticated: false, error: auth.error }, { status: auth.status });
  }

  return json({
    valid: true,
    authenticated: true,
    user: auth.user
  });
}
