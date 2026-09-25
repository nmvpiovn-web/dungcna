const fs = require('fs');
const path = require('path');

const configPath = path.join(process.env.USERPROFILE, 'AppData/Roaming/xdg.config/.wrangler/config/default.toml');
const config = fs.readFileSync(configPath, 'utf8');
const token = config.match(/oauth_token\s*=\s*"([^"]+)"/)[1];
const accountId = '9bca45c9a8ff34be86d4a4bf0cc0245f';
const dbUuid = 'a0d2d5f7-b4ae-48a3-99d6-ecac7ed87218';

async function queryD1(sql, params = []) {
  const res = await fetch(`https://api.cloudflare.com/client/v4/accounts/${accountId}/d1/database/${dbUuid}/query`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ sql, params })
  });
  const data = await res.json();
  if (!data.success) {
    throw new Error(`D1 query error: ${JSON.stringify(data.errors)}`);
  }
  return data.result;
}

async function runSeed() {
  console.log('Seeding tuition bills and student stars into Cloudflare D1...');

  const stars = [
    { student_id: 'usr_student_1', stars_balance: 12000, total_earned_stars: 15000, stars_redeemed: 3000 },
    { student_id: 'usr_student_2', stars_balance: 8500, total_earned_stars: 10500, stars_redeemed: 2000 },
    { student_id: 'usr_student_3', stars_balance: 25000, total_earned_stars: 30000, stars_redeemed: 5000 }
  ];

  for (const s of stars) {
    await queryD1(
      `INSERT OR REPLACE INTO student_stars (student_id, stars_balance, total_earned_stars, stars_redeemed)
       VALUES (?, ?, ?, ?)`,
      [s.student_id, s.stars_balance, s.total_earned_stars, s.stars_redeemed]
    );
  }

  const bills = [
    {
      id: 'bill_2026_10_001',
      student_id: 'usr_student_1',
      student_name: 'Lê Bảo Anh',
      age: 17,
      grade_level: 'Lớp 12',
      program_name: 'Chuyên Đề Luyện Thi IELTS 7.5 & Đại Học Ngoại Thương',
      billing_period: 'Tháng 10/2026',
      base_tuition_vnd: 2200000,
      attendance_total_sessions: 12,
      attendance_attended_sessions: 12,
      attendance_rate: 100,
      stars_available: 12000,
      stars_deducted: 10000,
      discount_vnd: 100000, // 10.000 stars = 100.000 VND
      final_amount_vnd: 2100000,
      template_id: 1, // Fresh Sprout
      bank_name: 'MBBank (Ngân Hàng Quân Đội)',
      bank_account: '0901234567',
      account_holder: 'NGUYEN MINH VU',
      vietqr_url: 'https://img.vietqr.io/image/970422-0901234567-compact2.png?amount=2100000&addInfo=HP_BAOANH_T10&accountName=NGUYEN%20MINH%20VU',
      growth_status: 'breakthrough_growth',
      growth_percentage: 18,
      growth_notes: 'Tăng trưởng vượt bậc (+18%) so với tháng 9. Năng lực phản xạ viết luận Task 2 tiến bộ rõ rệt, từ vựng C1 được vận dụng linh hoạt.',
      eval_listening: 7.5,
      eval_reading: 8.5,
      eval_writing: 8.0,
      eval_speaking: 7.0,
      eval_grammar: 8.5,
      test_score_15m: 9.5,
      test_score_45m: 9.0,
      superadmin_notes: 'Học sinh rất chăm chỉ, đã dùng 10.000 sao thưởng chuyên cần để khấu trừ trực tiếp vào học phí.',
      status: 'approved_by_superadmin',
      parent_name: 'Bác Lê Văn Cường',
      parent_phone: '0988123456',
      parent_zalo_id: 'zalo_cuong_le_123'
    },
    {
      id: 'bill_2026_10_002',
      student_id: 'usr_student_2',
      student_name: 'Trần Gia Huy',
      age: 13,
      grade_level: 'Lớp 7',
      program_name: 'Tiếng Anh 7 Toàn Diện Global Success & Chuẩn KET A2',
      billing_period: 'Tháng 10/2026',
      base_tuition_vnd: 1600000,
      attendance_total_sessions: 12,
      attendance_attended_sessions: 11,
      attendance_rate: 92,
      stars_available: 8500,
      stars_deducted: 5000,
      discount_vnd: 50000, // 5.000 stars = 50.000 VND
      final_amount_vnd: 1550000,
      template_id: 2, // Knowledge Star
      bank_name: 'MBBank (Ngân Hàng Quân Đội)',
      bank_account: '0901234567',
      account_holder: 'NGUYEN MINH VU',
      vietqr_url: 'https://img.vietqr.io/image/970422-0901234567-compact2.png?amount=1550000&addInfo=HP_GIAHUY_T10&accountName=NGUYEN%20MINH%20VU',
      growth_status: 'steady_progress',
      growth_percentage: 12,
      growth_notes: 'Duy trì phong độ cao (+12%). Phát âm chuẩn tự nhiên như người bản ngữ, đã khắc phục được lỗi quên chia động từ ngôi thứ 3.',
      eval_listening: 9.0,
      eval_reading: 7.0,
      eval_writing: 6.5,
      eval_speaking: 8.5,
      eval_grammar: 7.0,
      test_score_15m: 8.5,
      test_score_45m: 8.0,
      superadmin_notes: 'Gia Huy tiến bộ đều, tích cực phát biểu trong các tiết học với giáo viên bản ngữ.',
      status: 'approved_by_superadmin',
      parent_name: 'Chị Trần Thu Hà',
      parent_phone: '0977654321',
      parent_zalo_id: 'zalo_ha_tran_789'
    },
    {
      id: 'bill_2026_10_003',
      student_id: 'usr_student_3',
      student_name: 'Nguyễn Hoàng Minh',
      age: 15,
      grade_level: 'Lớp 9',
      program_name: 'Luyện Thi Chuyên Anh Vào 10 & Chứng Chỉ FCE B2',
      billing_period: 'Tháng 10/2026',
      base_tuition_vnd: 2500000,
      attendance_total_sessions: 12,
      attendance_attended_sessions: 12,
      attendance_rate: 100,
      stars_available: 25000,
      stars_deducted: 20000,
      discount_vnd: 200000, // 20.000 stars = 200.000 VND
      final_amount_vnd: 2300000,
      template_id: 3, // Global Scholar
      bank_name: 'MBBank (Ngân Hàng Quân Đội)',
      bank_account: '0901234567',
      account_holder: 'NGUYEN MINH VU',
      vietqr_url: 'https://img.vietqr.io/image/970422-0901234567-compact2.png?amount=2300000&addInfo=HP_HOANGMINH_T10&accountName=NGUYEN%20MINH%20VU',
      growth_status: 'breakthrough_growth',
      growth_percentage: 20,
      growth_notes: 'Tăng trưởng xuất sắc dẫn đầu khối (+20%). Hoàn thành 100% bài tập nâng cao, điểm kiểm tra tuyệt đối.',
      eval_listening: 9.5,
      eval_reading: 9.0,
      eval_writing: 8.5,
      eval_speaking: 9.0,
      eval_grammar: 9.5,
      test_score_15m: 10.0,
      test_score_45m: 9.5,
      superadmin_notes: 'Học sinh đạt danh hiệu Ngôi Sao Xuất Sắc Nhất Tháng, nhận thưởng 20.000 sao khấu trừ học phí.',
      status: 'approved_by_superadmin',
      parent_name: 'Anh Nguyễn Minh Đức',
      parent_phone: '0912987654',
      parent_zalo_id: 'zalo_duc_nguyen_456'
    }
  ];

  for (const b of bills) {
    await queryD1(
      `INSERT OR REPLACE INTO tuition_bills (
        id, student_id, student_name, age, grade_level, program_name, billing_period,
        base_tuition_vnd, attendance_total_sessions, attendance_attended_sessions, attendance_rate,
        stars_available, stars_deducted, discount_vnd, final_amount_vnd, template_id,
        bank_name, bank_account, account_holder, vietqr_url,
        growth_status, growth_percentage, growth_notes,
        eval_listening, eval_reading, eval_writing, eval_speaking, eval_grammar,
        test_score_15m, test_score_45m, superadmin_notes, status,
        parent_name, parent_phone, parent_zalo_id
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        b.id, b.student_id, b.student_name, b.age, b.grade_level, b.program_name, b.billing_period,
        b.base_tuition_vnd, b.attendance_total_sessions, b.attendance_attended_sessions, b.attendance_rate,
        b.stars_available, b.stars_deducted, b.discount_vnd, b.final_amount_vnd, b.template_id,
        b.bank_name, b.bank_account, b.account_holder, b.vietqr_url,
        b.growth_status, b.growth_percentage, b.growth_notes,
        b.eval_listening, b.eval_reading, b.eval_writing, b.eval_speaking, b.eval_grammar,
        b.test_score_15m, b.test_score_45m, b.superadmin_notes, b.status,
        b.parent_name, b.parent_phone, b.parent_zalo_id
      ]
    );
  }

  // Record audit snapshot
  await queryD1(
    `INSERT OR REPLACE INTO snapshots (id, actor_email, actor_role, action, entity_type, entity_id, data_before, data_after, ip_address)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      'snap_tuition_init_001',
      'nmvpiovn@gmail.com',
      'superadmin',
      'SUPERADMIN_INIT_TUITION_ENGINE',
      'tuition_bill',
      'all_bills',
      null,
      JSON.stringify({ rule: '100 stars = 1000 VND', billsCount: bills.length }),
      '127.0.0.1'
    ]
  );

  console.log(`Seeded ${bills.length} tuition bills with VietQR and star deduction!`);
}

runSeed().catch(console.error);
