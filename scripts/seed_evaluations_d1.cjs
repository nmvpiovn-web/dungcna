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
  console.log('Seeding student accounts and evaluations in Cloudflare D1...');

  const students = [
    {
      id: 'usr_student_1',
      email: 'baoanh.le@gmail.com',
      name: 'Lê Bảo Anh',
      role: 'student',
      avatar: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150',
      status: 'active',
      metadata: JSON.stringify({
        grade: 'Lớp 12',
        school: 'THPT Chu Văn An',
        target: 'IELTS 7.5 & ĐH Ngoại Thương',
        parent_name: 'Bác Lê Văn Cường',
        parent_phone: '0988123456',
        parent_zalo_id: 'zalo_cuong_le_123',
        class_id: 'L12_IELTS_PRO'
      })
    },
    {
      id: 'usr_student_2',
      email: 'giahuy.tran@gmail.com',
      name: 'Trần Gia Huy',
      role: 'student',
      avatar: 'https://images.unsplash.com/photo-1539571696357-5a69c17a67c6?w=150',
      status: 'active',
      metadata: JSON.stringify({
        grade: 'Lớp 7',
        school: 'THCS Giảng Võ',
        target: 'HSG Cấp Quận & KET A2 Distinction',
        parent_name: 'Chị Trần Thu Hà',
        parent_phone: '0977654321',
        parent_zalo_id: 'zalo_ha_tran_789',
        class_id: 'L7_GLOBAL_SUCCESS_A1'
      })
    },
    {
      id: 'usr_student_3',
      email: 'hoangminh.nguyen@gmail.com',
      name: 'Nguyễn Hoàng Minh',
      role: 'student',
      avatar: 'https://images.unsplash.com/photo-1506794778202-cad84cf45f1d?w=150',
      status: 'active',
      metadata: JSON.stringify({
        grade: 'Lớp 9',
        school: 'THCS Archimedes',
        target: 'Chuyên Sư Phạm & PET B1',
        parent_name: 'Anh Nguyễn Minh Đức',
        parent_phone: '0912987654',
        parent_zalo_id: 'zalo_duc_nguyen_456',
        class_id: 'L9_CHUYEN_ANH'
      })
    }
  ];

  for (const s of students) {
    await queryD1(
      `INSERT OR REPLACE INTO users (id, email, name, role, avatar, status, metadata) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [s.id, s.email, s.name, s.role, s.avatar, s.status, s.metadata]
    );
  }

  const evaluations = [
    {
      id: 'eval_001',
      student_id: 'usr_student_1',
      student_name: 'Lê Bảo Anh',
      teacher_id: 'usr_teach_1',
      teacher_name: 'Mr. Johnathan Miller (Native ESL Trainer)',
      grade_level: 'Lớp 12 / IELTS Target 7.5',
      listening_score: 7.0,
      reading_score: 8.5,
      writing_score: 8.0,
      speaking_score: 6.5,
      grammar_vocab_score: 8.5,
      primary_aptitude: 'reading_writing',
      aptitude_description: 'Thiên hướng học thuật chuyên sâu: Nắm bắt cấu trúc lập luận và đọc hiểu phân tích rất xuất sắc. Tư duy logic tốt khi viết luận Task 2.',
      strengths: 'Vốn từ vựng C1 phong phú, khả năng paraphrase đa dạng, tốc độ đọc lướt (skimming/scanning) nhanh vượt trội.',
      weaknesses: 'Phản xạ phát âm còn hơi ngập ngừng ở Speaking Part 3 do thói quen dịch nhẩm trong đầu trước khi phát âm. Cần cải thiện ngữ điệu tự nhiên.',
      teacher_feedback: 'Bảo Anh possesses tremendous academic potential. She analyzes complex texts with great precision. To break into the Band 7.5 - 8.0 overall, she needs to boost speaking confidence through daily 15-minute voice recordings with native prompts.',
      action_plan: '1. Giao 3 buổi luyện phản xạ Speaking 1-on-1 với giáo viên bản ngữ mỗi tuần.\n2. Thu âm và gửi bài luyện phát âm Part 2 vào thư mục Drive nội bộ.\n3. Duy trì làm 2 đề Reading Cambridge IELTS 19 mỗi tuần để giữ nhịp độ.',
      recommended_materials: 'Cambridge IELTS 19 Academic, Speaking Forecast Q3 2026, Cẩm nang Collocations C1',
      parent_name: 'Bác Lê Văn Cường',
      parent_phone: '0988123456',
      parent_zalo_id: 'zalo_cuong_le_123',
      report_status: 'ready_to_send'
    },
    {
      id: 'eval_002',
      student_id: 'usr_student_2',
      student_name: 'Trần Gia Huy',
      teacher_id: 'usr_teach_2',
      teacher_name: 'Cô Nguyễn Hương (Tổ Trưởng Chuyên Môn)',
      grade_level: 'Lớp 7 / Global Success Unit 1-4',
      listening_score: 9.0,
      reading_score: 6.5,
      writing_score: 5.5,
      speaking_score: 8.5,
      grammar_vocab_score: 6.0,
      primary_aptitude: 'listening_speaking',
      aptitude_description: 'Thiên hướng giao tiếp & phản xạ tự nhiên: Năng khiếu nghe - nói rất nổi trội, bắt chước phát âm bản ngữ nhanh và tự tin trước đám đông.',
      strengths: 'Phát âm chuẩn IPA, không ngại giao tiếp bằng tiếng Anh, tiếp thu bài hát và audio rất nhanh.',
      weaknesses: 'Chưa chú ý tính cẩn thận trong ngữ pháp viết: hay quên chia động từ ở ngôi thứ 3 số ít và nhầm lẫn mạo từ a/an/the.',
      teacher_feedback: 'Gia Huy là học sinh rất hoạt bát và có năng khiếu tự nhiên về ngôn ngữ nói. Nếu được uốn nắn kỹ hơn về mặt cấu trúc ngữ pháp và viết đoạn văn, em sẽ là một ứng viên sáng giá cho đội tuyển học sinh giỏi.',
      action_plan: '1. Làm bài tập bổ trợ ngữ pháp 15 phút mỗi ngày trên hệ thống.\n2. Thực hành viết lại các mẩu tin ngắn 50-80 từ theo chủ đề Unit 2, 3.\n3. Báo cáo tiến độ cho phụ huynh qua Zalo định kỳ vào thứ 6 hàng tuần.',
      recommended_materials: 'Bộ bài tập ngữ pháp Tiếng Anh 7 Global Success có đáp án, KET A2 Listening Scripts',
      parent_name: 'Chị Trần Thu Hà',
      parent_phone: '0977654321',
      parent_zalo_id: 'zalo_ha_tran_789',
      report_status: 'sent_to_parent'
    },
    {
      id: 'eval_003',
      student_id: 'usr_student_3',
      student_name: 'Nguyễn Hoàng Minh',
      teacher_id: 'usr_teach_3',
      teacher_name: 'Thầy Trần Mai (Chuyên gia Luyện Thi)',
      grade_level: 'Lớp 9 / Luyện Thi Vào 10 Chuyên',
      listening_score: 9.5,
      reading_score: 9.0,
      writing_score: 8.5,
      speaking_score: 9.0,
      grammar_vocab_score: 9.5,
      primary_aptitude: 'polyglot_gifted',
      aptitude_description: 'Năng khiếu ngôn ngữ toàn diện (Polyglot Gifted): Đồng đều cả 4 kỹ năng ở trình độ B2/C1, tư duy ngôn ngữ sắc bén.',
      strengths: 'Giải quyết các dạng bài phân loại học sinh giỏi cực kỳ nhanh nhẹn, nắm chắc toàn bộ chuyên đề đảo ngữ, câu điều kiện hỗn hợp.',
      weaknesses: 'Đôi khi làm bài quá nhanh dẫn đến một vài lỗi bất cẩn nhỏ ở phần điền từ form từ (Word Form).',
      teacher_feedback: 'Hoàng Minh hoàn toàn đủ điều kiện dự thi vào các trường Chuyên Anh top đầu (Chuyên Ngoại Ngữ, Chuyên Sư Phạm, Ams). Kế hoạch sắp tới là giải các đề thi chuyên chính thức các năm gần nhất.',
      action_plan: '1. Hoàn thành trọn bộ 30 đề thi thử chuyên Anh chọn lọc trên nền tảng.\n2. Tham gia lớp bồi dưỡng nâng cao hàng tuần với Mr. Johnathan & Thầy Mai.',
      recommended_materials: 'Tuyển tập đề thi Chuyên Anh 10 năm, Vocabulary in Use Advanced',
      parent_name: 'Anh Nguyễn Minh Đức',
      parent_phone: '0912987654',
      parent_zalo_id: 'zalo_duc_nguyen_456',
      report_status: 'admin_reviewed'
    }
  ];

  for (const ev of evaluations) {
    await queryD1(
      `INSERT OR REPLACE INTO student_evaluations (
        id, student_id, student_name, teacher_id, teacher_name, grade_level,
        listening_score, reading_score, writing_score, speaking_score, grammar_vocab_score,
        primary_aptitude, aptitude_description, strengths, weaknesses,
        teacher_feedback, action_plan, recommended_materials,
        parent_name, parent_phone, parent_zalo_id, report_status
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        ev.id, ev.student_id, ev.student_name, ev.teacher_id, ev.teacher_name, ev.grade_level,
        ev.listening_score, ev.reading_score, ev.writing_score, ev.speaking_score, ev.grammar_vocab_score,
        ev.primary_aptitude, ev.aptitude_description, ev.strengths, ev.weaknesses,
        ev.teacher_feedback, ev.action_plan, ev.recommended_materials,
        ev.parent_name, ev.parent_phone, ev.parent_zalo_id, ev.report_status
      ]
    );
  }

  // Create an audit snapshot of evaluation creation
  await queryD1(
    `INSERT OR REPLACE INTO snapshots (id, actor_email, actor_role, action, entity_type, entity_id, data_before, data_after, ip_address)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      'snap_eval_001',
      'teacher.john@timbk.io.vn',
      'teacher',
      'CREATE_STUDENT_EVALUATION',
      'student_evaluation',
      'eval_001',
      JSON.stringify({ status: 'new' }),
      JSON.stringify({ student: 'Lê Bảo Anh', aptitude: 'reading_writing', action_plan: 'Luyện Speaking 1-on-1' }),
      '127.0.0.1'
    ]
  );

  console.log(`Seeded ${students.length} student records and ${evaluations.length} comprehensive evaluations.`);
}

runSeed().catch(console.error);
