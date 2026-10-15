// Fetch 12 sample questions per grade from remote D1 to build deterministic seed catalog
import { execSync } from 'child_process';
import fs from 'fs';

const GRADES = [
  { grade: 'lop_1', id: 'quiz_pub_grade_1', title: 'Tiếng Anh Lớp 1 · Khởi Động & Làm Quen', desc: 'Luyện tập làm quen bảng chữ cái, màu sắc và đồ dùng học tập cơ bản.' },
  { grade: 'lop_2', id: 'quiz_pub_grade_2', title: 'Tiếng Anh Lớp 2 · Từ Vựng & Mẫu Câu Quen Thuộc', desc: 'Thực hành các từ vựng gia đình, động vật và hoạt động hàng ngày.' },
  { grade: 'lop_3', id: 'quiz_pub_grade_3', title: 'Tiếng Anh Lớp 3 · Luyện Tập Nghe & Đọc Khởi Điểm', desc: 'Củng cố cấu trúc câu đơn giản, hỏi đáp cơ bản trong chương trình GDPT.' },
  { grade: 'lop_4', id: 'quiz_pub_grade_4', title: 'Tiếng Anh Lớp 4 · Luyện Tập Tổng Hợp Chủ Điểm', desc: 'Ôn tập thì hiện tại đơn, sở thích và miêu tả hoạt động.' },
  { grade: 'lop_5', id: 'quiz_pub_grade_5', title: 'Tiếng Anh Lớp 5 · Củng Cố & Chuyển Cấp Tiểu Học', desc: 'Luyện tập tổng hợp kiến thức trọng tâm bậc tiểu học.' },
  { grade: 'lop_6', id: 'quiz_pub_grade_6', title: 'Tiếng Anh Lớp 6 · Làm Quen Ngữ Pháp & Giao Tiếp THCS', desc: 'Các chủ điểm trường học, nhà ở, bạn bè và sinh hoạt thường nhật.' },
  { grade: 'lop_7', id: 'quiz_pub_grade_7', title: 'Tiếng Anh Lớp 7 · Kiểm Tra & Ôn Tập Trọng Tâm', desc: 'Bộ câu hỏi trắc nghiệm ngữ âm, từ vựng và ngữ pháp trọng tâm lớp 7.' },
  { grade: 'lop_8', id: 'quiz_pub_grade_8', title: 'Tiếng Anh Lớp 8 · Phát Triển Kỹ Năng Đọc & Ngữ Pháp', desc: 'Mở rộng vốn từ vựng xã hội, phong tục, khoa học công nghệ.' },
  { grade: 'lop_9', id: 'quiz_pub_grade_9', title: 'Tiếng Anh Lớp 9 · Ôn Luyện Thi Vào Lớp 10', desc: 'Tổng ôn ngữ pháp câu điều kiện, câu bị động, câu tường thuật trọng điểm.' },
  { grade: 'lop_10', id: 'quiz_pub_grade_10', title: 'Tiếng Anh Lớp 10 · Nền Tảng THPT & Học Thuật', desc: 'Khởi động chương trình THPT mới với các chủ đề môi trường và cuộc sống.' },
  { grade: 'lop_11', id: 'quiz_pub_grade_11', title: 'Tiếng Anh Lớp 11 · Phát Triển Ngôn Ngữ Học Thuật', desc: 'Ngữ pháp nâng cao, mệnh đề quan hệ và đọc hiểu văn bản chuyên sâu.' },
  { grade: 'lop_12', id: 'quiz_pub_grade_12', title: 'Tiếng Anh Lớp 12 · Luyện Đề Tốt Nghiệp THPT Quốc Gia', desc: 'Bộ câu hỏi chuẩn định dạng đề thi tốt nghiệp THPT và kỳ thi đại học.' },
  { grade: 'ielts_academic', id: 'quiz_pub_ielts', title: 'IELTS Academic · Kiểm Tra Từ Vựng & Đọc Hiểu Học Thuật', desc: 'Rèn luyện tư duy từ vựng học thuật, đọc hiểu suy luận và collocation IELTS.' }
];

console.log('Fetching questions for', GRADES.length, 'grades...');

const catalogData = [];

for (const g of GRADES) {
  const sql = `SELECT id, grade_level, curriculum_id, topic, skill_category, cognitive_level, question_type, question_text, options_json, correct_option_id, explanation, reading_passage FROM question_bank WHERE grade_level = '${g.grade}' AND status = 'published' ORDER BY id ASC LIMIT 12;`;
  const raw = execSync(`npx wrangler d1 execute DB --remote --command "${sql.replace(/"/g, '\\"')}"`, { encoding: 'utf8' });
  const jsonStart = raw.indexOf('[');
  if (jsonStart === -1) {
    console.error('Failed to parse for grade', g.grade);
    continue;
  }
  const parsed = JSON.parse(raw.slice(jsonStart));
  const rows = parsed[0]?.results || [];
  console.log(`Grade ${g.grade}: fetched ${rows.length} rows`);
  catalogData.push({
    gradeInfo: g,
    questions: rows
  });
}

fs.writeFileSync('scripts/catalog_data.json', JSON.stringify(catalogData, null, 2));
console.log('Saved to scripts/catalog_data.json');
