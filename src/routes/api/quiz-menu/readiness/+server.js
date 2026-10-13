// src/routes/api/quiz-menu/readiness/+server.js
import { json } from '@sveltejs/kit';
import { verifyServerAuth } from '../../../../lib/server/auth.js';
import { checkQuizReadiness } from '../../../../lib/server/quizReadiness.js';

export const prerender = false;

async function optionalAuth(request, platform) {
  if (!request.headers.get('authorization') && !request.headers.get('cookie')?.includes('session_token=')) {
    return null;
  }
  const auth = await verifyServerAuth(request, platform);
  return auth.authenticated ? auth : null;
}

export async function GET({ request, platform }) {
  const auth = await optionalAuth(request, platform);
  const readiness = await checkQuizReadiness(platform, auth?.user || null);

  return json({
    success: true,
    readiness
  });
}
