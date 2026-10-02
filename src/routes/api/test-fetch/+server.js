// src/routes/api/test-fetch/+server.js
// Endpoint test đơn giản, không auth, để kiểm tra browser fetch có hoạt động không
import { json } from '@sveltejs/kit';

export const prerender = false;

export async function GET() {
  return json({
    success: true,
    message: 'Fetch works!',
    timestamp: new Date().toISOString(),
    items: [1, 2, 3, 4, 5]
  });
}
