import { json } from '@sveltejs/kit';
import { isStaffUser, verifyServerAuth } from '../../../../lib/server/auth.js';
import { listQuizDriveFiles, QuizDriveError } from '../../../../lib/server/quizDrive.js';

export const prerender = false;

export async function GET({ request, platform }) {
  const auth = await verifyServerAuth(request, platform);
  if (!auth.authenticated) return json({ success: false, error: auth.error || 'Unauthorized' }, { status: auth.status || 401 });
  if (!isStaffUser(auth.user)) return json({ success: false, error: 'Forbidden' }, { status: 403 });
  try {
    const files = await listQuizDriveFiles(platform);
    return json({ success: true, files });
  } catch (error) {
    const status = error instanceof QuizDriveError ? error.status : 500;
    return json({ success: false, error: error.code || 'DriveError', message: error.message }, { status });
  }
}

