import { json } from '@sveltejs/kit';
import { verifyServerAuth } from '../../../lib/server/auth.js';

export const prerender = false;

// OCR API: nhận ảnh (JPG/PNG/WEBP) hoặc PDF, trả về text trích xuất
// - PDF text-based: dùng pdfjs-dist extract trực tiếp (nhanh, miễn phí)
// - Ảnh hoặc PDF scan: gửi Vision AI (cần VISION_API_KEY)

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];

export async function POST({ request, platform }) {
  // Auth check
  const auth = await verifyServerAuth(request, platform);
  if (!auth.authenticated) {
    return json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const formData = await request.formData();
    const file = formData.get('file');
    
    if (!file || typeof file === 'string') {
      return json({ error: 'Không có file được upload' }, { status: 400 });
    }

    if (!ALLOWED_TYPES.includes(file.type)) {
      return json({ error: `Định dạng không hỗ trợ: ${file.type}. Chỉ nhận JPG, PNG, WEBP, PDF.` }, { status: 400 });
    }

    if (file.size > MAX_FILE_SIZE) {
      return json({ error: 'File quá lớn (tối đa 10MB)' }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    let result;

    if (file.type === 'application/pdf') {
      result = await ocrPdf(buffer, platform);
    } else {
      result = await ocrImage(buffer, file.type, platform);
    }

    return json(result);

  } catch (err) {
    console.error('[OCR] Error:', err.message);
    return json({ error: 'Lỗi xử lý OCR: ' + err.message }, { status: 500 });
  }
}

async function ocrPdf(buffer, platform) {
  // Thử extract text trực tiếp từ PDF trước
  try {
    const { extractPdfText } = await import('../../../lib/server/pdfExtract.js');
    const text = await extractPdfText(buffer);
    
    if (text && text.trim().length > 50) {
      return {
        text: text.trim(),
        method: 'pdf-text-extract',
        confidence: 'high',
        message: 'Trích xuất text trực tiếp từ PDF'
      };
    }
  } catch (e) {
    console.log('[OCR] PDF text extract failed, trying vision:', e.message);
  }

  // PDF scan (không có text) -> cần convert sang ảnh rồi vision
  // Cloudflare Workers không convert PDF->ảnh được, trả về hướng dẫn
  return {
    text: '',
    method: 'pdf-scan-detected',
    confidence: 'none',
    error: 'PDF này là bản scan (không có text). Vui lòng chụp ảnh từng trang và upload dưới dạng JPG/PNG.',
    suggestion: 'upload_as_images'
  };
}

async function ocrImage(buffer, mimeType, platform) {
  const visionApiKey = platform?.env?.VISION_API_KEY || process.env?.VISION_API_KEY;
  
  if (!visionApiKey) {
    return {
      text: '',
      method: 'vision-not-configured',
      confidence: 'none',
      error: 'Chưa cấu hình VISION_API_KEY. Liên hệ admin để bật OCR ảnh.',
      suggestion: 'contact_admin'
    };
  }

  // Gửi ảnh tới Vision AI (OpenAI-compatible API)
  const base64 = buffer.toString('base64');
  const dataUrl = `data:${mimeType};base64,${base64}`;

  const visionApiUrl = platform?.env?.VISION_API_URL || 'https://api.openai.com/v1/chat/completions';
  const visionModel = platform?.env?.VISION_MODEL || 'gpt-4o-mini';

  try {
    const res = await fetch(visionApiUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${visionApiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: visionModel,
        messages: [{
          role: 'user',
          content: [
            {
              type: 'text',
              text: 'Trích xuất TOÀN BỘ văn bản tiếng Việt trong ảnh này. Giữ nguyên định dạng, xuống dòng, và cấu trúc. Chỉ trả về text, không thêm giải thích.'
            },
            {
              type: 'image_url',
              image_url: { url: dataUrl }
            }
          ]
        }],
        max_tokens: 4000
      })
    });

    if (!res.ok) {
      throw new Error(`Vision API error: ${res.status}`);
    }

    const data = await res.json();
    const text = data.choices?.[0]?.message?.content || '';

    return {
      text: text.trim(),
      method: 'vision-ai',
      confidence: text.length > 50 ? 'high' : 'medium',
      model: visionModel
    };

  } catch (err) {
    console.error('[OCR] Vision API failed:', err.message);
    return {
      text: '',
      method: 'vision-failed',
      confidence: 'none',
      error: 'Lỗi gọi Vision AI: ' + err.message
    };
  }
}
