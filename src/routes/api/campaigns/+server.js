// src/routes/api/campaigns/+server.js
// Marketing Campaign Popup & Lead Capture API backed by Cloudflare D1 (Halloween 2026 Special & Seasonal Campaigns)
import { json } from '@sveltejs/kit';

export const prerender = false;

const DEFAULT_CAMPAIGNS = [
  {
    id: 'camp_halloween_2026',
    slug: 'halloween-2026',
    theme: 'halloween',
    badge_text: '🎃 LỄ HỘI HALLOWEEN SẮP DIỄN RA (20/10 – 31/10)',
    title: '🎃 Đêm Hội Phù Thủy Anh Ngữ Halloween: Trick or Treat & Săn Học Bổng 5.000 Sao!',
    subtitle: 'Chào đón mùa lễ hội Halloween 2026 tại Lớp Tiếng Anh Cô Dung! Khám phá kho từ vựng Spooky Halloween, vượt thử thách Quiz hóa trang và nhận ngay học bổng ưu đãi.',
    offer_highlight: '🎁 Tặng ngay +500 Sao thưởng • 02 Buổi Học Thử Miễn Phí (Tiểu học, THCS Global Success, IELTS) • Bộ Flashcard Halloween Cambridge độc quyền!',
    highlights_json: JSON.stringify([
      '🎃 Học bộ từ vựng chủ đề Halloween (Jack-o\'-lantern, Costume, Trick-or-treat, Spooky, Enchanted) có phát âm IPA chuẩn',
      '🧩 Đấu trường Quiz & Mini-game Săn Kẹo Phù Thủy tích lũy Sao đổi chiết khấu học phí thật',
      '👩‍🏫 Đăng ký học thử 02 buổi miễn phí cùng Cô Nguyễn Thị Dung (123 Phố Vọng & Online Zoom VIP)'
    ]),
    cta_primary_text: '🎃 Học Ngay Từ Vựng & Flashcard Halloween',
    cta_primary_url: '/flashcards',
    cta_secondary_text: '🧩 Vào Đấu Trường Quiz Halloween',
    cta_secondary_url: '/quiz-menu?tab=take',
    discount_code: 'HALLOWEEN2026',
    bonus_stars: 500,
    start_date: '2026-10-15',
    end_date: '2026-11-05',
    is_active: 1
  },
  {
    id: 'camp_cambridge_winter_2026',
    slug: 'cambridge-winter-2026',
    theme: 'cambridge',
    badge_text: '🏆 CHIẾN DỊCH BỨT PHÁ HỌC KỲ I & IELTS',
    title: '🌟 Lộ Trình Tăng Tốc Điểm 9+ Tiếng Anh Global Success & Chứng Chỉ KET/PET/IELTS',
    subtitle: 'Đồng hành sát sao từng ca học với hệ thống đối soát chất lượng 5 phần và báo cáo Zalo tự động cho Phụ huynh.',
    offer_highlight: '🎯 Miễn phí 100% bài test đánh giá năng lực 4 kỹ năng & tặng giáo án cá nhân hóa từ Kho Tri Thức D1',
    highlights_json: JSON.stringify([
      '📚 Giáo trình chuẩn Cambridge & SGK Global Success Lớp 1–12',
      '📊 Báo cáo điểm danh, BTVN và nhận xét 5 kỹ năng tự động qua Zalo',
      '⭐ Tích lũy Sao học tập quy đổi giảm trực tiếp vào hóa đơn học phí hàng tháng'
    ]),
    cta_primary_text: '🚀 Kiểm Tra Trình Độ Miễn Phí',
    cta_primary_url: '/placement',
    cta_secondary_text: '📅 Xem Thời Khóa Biểu Các Lớp',
    cta_secondary_url: '/schedule',
    discount_code: 'CAMBRIDGE500',
    bonus_stars: 300,
    start_date: '2026-10-01',
    end_date: '2026-12-31',
    is_active: 1
  }
];

async function ensureCampaignTables(db) {
  if (!db) return;
  try {
    await db.prepare(`
      CREATE TABLE IF NOT EXISTS marketing_campaigns (
        id TEXT PRIMARY KEY,
        slug TEXT,
        theme TEXT DEFAULT 'halloween',
        badge_text TEXT,
        title TEXT NOT NULL,
        subtitle TEXT,
        offer_highlight TEXT,
        highlights_json TEXT DEFAULT '[]',
        cta_primary_text TEXT,
        cta_primary_url TEXT,
        cta_secondary_text TEXT,
        cta_secondary_url TEXT,
        discount_code TEXT DEFAULT 'HALLOWEEN2026',
        bonus_stars INTEGER DEFAULT 500,
        start_date TEXT,
        end_date TEXT,
        is_active INTEGER DEFAULT 1,
        updated_at TEXT DEFAULT CURRENT_TIMESTAMP
      );
    `).run().catch(() => {});

    await db.prepare(`
      CREATE TABLE IF NOT EXISTS campaign_leads (
        id TEXT PRIMARY KEY,
        campaign_id TEXT NOT NULL,
        visitor_name TEXT NOT NULL,
        phone TEXT NOT NULL,
        grade_interest TEXT DEFAULT 'Lớp 7',
        note TEXT DEFAULT '',
        created_at TEXT DEFAULT CURRENT_TIMESTAMP
      );
    `).run().catch(() => {});

    for (const c of DEFAULT_CAMPAIGNS) {
      await db.prepare(`
        INSERT OR IGNORE INTO marketing_campaigns (
          id, slug, theme, badge_text, title, subtitle, offer_highlight, highlights_json,
          cta_primary_text, cta_primary_url, cta_secondary_text, cta_secondary_url,
          discount_code, bonus_stars, start_date, end_date, is_active, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
      `).bind(
        c.id,
        c.slug,
        c.theme,
        c.badge_text,
        c.title,
        c.subtitle,
        c.offer_highlight,
        c.highlights_json,
        c.cta_primary_text,
        c.cta_primary_url,
        c.cta_secondary_text,
        c.cta_secondary_url,
        c.discount_code,
        c.bonus_stars,
        c.start_date,
        c.end_date,
        c.is_active
      ).run().catch(() => {});
    }
  } catch {}
}

function formatCampaignRow(row) {
  if (!row) return null;
  let highlights = [];
  try {
    highlights = JSON.parse(row.highlights_json || '[]');
  } catch {}
  return {
    ...row,
    is_active: Boolean(row.is_active),
    bonus_stars: Number(row.bonus_stars || 500),
    highlights
  };
}

export async function GET({ platform }) {
  const db = platform?.env?.DB;
  let campaigns = DEFAULT_CAMPAIGNS.map(formatCampaignRow);
  let leads = [];

  if (db) {
    await ensureCampaignTables(db);
    try {
      const [cRes, lRes] = await Promise.all([
        db.prepare(`SELECT * FROM marketing_campaigns ORDER BY rowid ASC`).all().catch(() => ({ results: [] })),
        db.prepare(`SELECT * FROM campaign_leads ORDER BY created_at DESC LIMIT 30`).all().catch(() => ({ results: [] }))
      ]);
      if (Array.isArray(cRes?.results) && cRes.results.length > 0) {
        campaigns = cRes.results.map(formatCampaignRow);
      }
      leads = lRes?.results || [];
    } catch {}
  }

  const activeCampaign = campaigns.find((c) => c.is_active && c.theme === 'halloween') || campaigns.find((c) => c.is_active) || campaigns[0];

  return json({
    success: true,
    active_campaign: activeCampaign,
    campaigns,
    leads_count: leads.length,
    recent_leads: leads
  });
}

export async function POST({ request, platform }) {
  const db = platform?.env?.DB;
  if (db) {
    await ensureCampaignTables(db);
  }

  let body = {};
  try {
    body = await request.json();
  } catch {
    return json({ success: false, error: 'Invalid JSON' }, { status: 400 });
  }

  const action = body.action || 'claim_offer';

  if (action === 'claim_offer') {
    const visitorName = String(body.visitor_name || body.name || 'Học sinh / Phụ huynh').trim();
    const phone = String(body.phone || '').trim();
    const gradeInterest = String(body.grade_interest || 'Lớp 7 (Global Success & KET)').trim();
    const campaignId = String(body.campaign_id || 'camp_halloween_2026').trim();
    const note = String(body.note || 'Đăng ký nhận ưu đãi Halloween 2026 & 500 Sao thưởng').trim();

    if (!phone || phone.length < 8) {
      return json({ success: false, error: 'Vui lòng nhập số điện thoại liên hệ hợp lệ (Zalo/SĐT) để nhận mã ưu đãi & 500 Sao thưởng!' }, { status: 400 });
    }

    const leadId = `lead_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    if (db) {
      await db.prepare(`
        INSERT INTO campaign_leads (id, campaign_id, visitor_name, phone, grade_interest, note, created_at)
        VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
      `).bind(leadId, campaignId, visitorName, phone, gradeInterest, note).run().catch(() => {});
    }

    return json({
      success: true,
      lead_id: leadId,
      discount_code: 'HALLOWEEN2026',
      bonus_stars: 500,
      message: `🎃 Chúc mừng ${visitorName}! Hệ thống đã ghi nhận SĐT ${phone} (${gradeInterest}) và kích hoạt mã ưu đãi HALLOWEEN2026 (+500 Sao thưởng & 02 buổi học thử miễn phí)!`
    });
  }

  if (action === 'toggle_campaign') {
    if (!db) return json({ success: false, error: 'D1 unavailable' }, { status: 503 });
    const id = String(body.id || 'camp_halloween_2026').trim();
    const isActive = body.is_active !== undefined ? (body.is_active ? 1 : 0) : 1;
    await db.prepare(`UPDATE marketing_campaigns SET is_active = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`).bind(isActive, id).run();
    return json({
      success: true,
      id,
      is_active: Boolean(isActive),
      message: `✅ Đã ${isActive ? 'BẬT' : 'TẮT'} chiến dịch Marketing "${id}" trên D1!`
    });
  }

  if (action === 'save_campaign') {
    if (!db) return json({ success: false, error: 'D1 unavailable' }, { status: 503 });
    const id = String(body.id || `camp_${Date.now()}`).trim();
    const title = String(body.title || '').trim();
    if (!title) return json({ success: false, error: 'Vui lòng nhập tiêu đề chiến dịch!' }, { status: 400 });

    await db.prepare(`
      INSERT INTO marketing_campaigns (
        id, slug, theme, badge_text, title, subtitle, offer_highlight,
        cta_primary_text, cta_primary_url, discount_code, bonus_stars, is_active, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
      ON CONFLICT(id) DO UPDATE SET
        badge_text = excluded.badge_text,
        title = excluded.title,
        subtitle = excluded.subtitle,
        offer_highlight = excluded.offer_highlight,
        cta_primary_text = excluded.cta_primary_text,
        cta_primary_url = excluded.cta_primary_url,
        discount_code = excluded.discount_code,
        bonus_stars = excluded.bonus_stars,
        is_active = excluded.is_active,
        updated_at = CURRENT_TIMESTAMP
    `).bind(
      id,
      body.slug || id,
      body.theme || 'halloween',
      body.badge_text || '🎃 CHIẾN DỊCH MỚI',
      title,
      body.subtitle || '',
      body.offer_highlight || '',
      body.cta_primary_text || '🎃 Khám Phá Ngay',
      body.cta_primary_url || '/flashcards',
      body.discount_code || 'HALLOWEEN2026',
      Number(body.bonus_stars || 500),
      body.is_active !== false ? 1 : 0
    ).run();

    return json({
      success: true,
      id,
      message: `✅ Đã lưu chiến dịch Marketing "${title}" vào Cloudflare D1!`
    });
  }

  if (action === 'delete_campaign') {
    if (!db) return json({ success: false, error: 'D1 unavailable' }, { status: 503 });
    const id = String(body.id || '').trim();
    if (!id) return json({ success: false, error: 'Thiếu mã chiến dịch (id) cần xóa' }, { status: 400 });
    await db.prepare('DELETE FROM marketing_campaigns WHERE id = ?').bind(id).run();
    return json({
      success: true,
      id,
      message: `🗑️ Đã xóa chiến dịch Marketing "${id}" khỏi Cloudflare D1!`
    });
  }

  if (action === 'delete_lead') {
    if (!db) return json({ success: false, error: 'D1 unavailable' }, { status: 503 });
    const id = String(body.id || body.lead_id || '').trim();
    if (!id) return json({ success: false, error: 'Thiếu mã lead (id) cần xóa' }, { status: 400 });
    await db.prepare('DELETE FROM campaign_leads WHERE id = ?').bind(id).run();
    return json({
      success: true,
      id,
      message: `🗑️ Đã xóa thông tin đăng ký ưu đãi (${id}) khỏi Cloudflare D1!`
    });
  }

  return json({ success: false, error: `Unknown action: ${action}` }, { status: 400 });
}

export async function DELETE({ url, request, platform }) {
  const db = platform?.env?.DB;
  if (!db) return json({ success: false, error: 'D1 unavailable' }, { status: 503 });
  await ensureCampaignTables(db);
  let body = {};
  try { body = await request.json(); } catch {}
  const id = String(url.searchParams.get('id') || body.id || '').trim();
  const type = String(url.searchParams.get('type') || body.type || 'campaign').trim();
  if (!id) return json({ success: false, error: 'Thiếu id cần xóa' }, { status: 400 });
  if (type === 'lead') {
    await db.prepare('DELETE FROM campaign_leads WHERE id = ?').bind(id).run();
    return json({ success: true, id, message: `🗑️ Đã xóa lead ${id}` });
  }
  await db.prepare('DELETE FROM marketing_campaigns WHERE id = ?').bind(id).run();
  return json({ success: true, id, message: `🗑️ Đã xóa chiến dịch ${id}` });
}
