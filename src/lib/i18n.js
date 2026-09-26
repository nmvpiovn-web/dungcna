// src/lib/i18n.js
// Bilingual internationalization store & dictionary (Vietnamese / English)
// Fail-safe fallback to Vietnamese if translation key is missing.

import { writable } from 'svelte/store';

export const currentLang = writable(
  (typeof window !== 'undefined' && localStorage.getItem('tienganh_lang')) || 'vi'
);

export function setLanguage(lang) {
  if (lang !== 'vi' && lang !== 'en') lang = 'vi';
  currentLang.set(lang);
  if (typeof window !== 'undefined') {
    localStorage.setItem('tienganh_lang', lang);
  }
}

export function toggleLanguage() {
  currentLang.update(l => {
    const next = l === 'vi' ? 'en' : 'vi';
    if (typeof window !== 'undefined') {
      localStorage.setItem('tienganh_lang', next);
    }
    return next;
  });
}

export const DICTIONARY = {
  vi: {
    // Navigation & Portal Titles
    brand: 'Tiếng Anh Cô Dung',
    cpanelSystem: 'Hệ Thống Cpanel',
    allCampuses: 'Toàn bộ cơ sở',
    campusLabel: 'Điểm học:',
    adminCP: 'AdminCP Tổng',
    notifications: 'Thông báo',
    stars: 'sao',
    starsBalance: 'Sao Tích Lũy',
    completedWork: 'Đã Hoàn Thành',
    avgScore: 'Điểm Trung Bình',

    // Role Cpanels
    studentDesk: 'Bàn Học Của Em',
    parentPortal: 'Góc Phụ Huynh',
    teacherWorkplace: 'Bàn Làm Việc GV',
    academicTesting: 'Điều Hành & Bài test / Kiểm tra',
    testingHub: 'Bài test / Kiểm tra',

    // Tabs
    homeworkTab: 'Bài Tập Về Nhà',
    examTab: 'Phòng Luyện Thi',
    scheduleTab: 'Thời Khóa Biểu',
    tuitionTab: 'Học Phí VietQR',
    gradingTab: 'Chấm Điểm BTVN',
    assignTab: 'Giao BTVN Mới',
    secondBrainTab: 'Kho Giáo Án Obsidian',
    overviewTab: 'Tổng Quan',

    // Skills
    writing: 'Viết Luận (Writing)',
    reading: 'Đọc Hiểu (Reading)',
    speaking: 'Nói & Phát Âm (Speaking)',
    allSkills: 'Tất cả kỹ năng',

    // Homework actions & states
    todo: 'Cần Làm',
    submitted: 'Đã Nộp',
    graded: 'Đã Chấm Điểm',
    all: 'Tất Cả',
    notSubmitted: 'Chưa làm',
    pendingGrading: 'Chờ cô chấm',
    deadlineLabel: 'Hạn nộp (trước buổi học kế tiếp):',
    teacherLabel: 'Giáo viên phụ trách:',
    doHomeworkBtn: 'Làm Bài Ngay →',
    reviewSubmissionBtn: 'Xem / Nộp Lại',
    printWorksheetBtn: '🖨️ In Phiếu Viết A4',
    uploadPhotoBtn: '📸 Chụp Ảnh Bài Viết Tay',
    typeOnlineBtn: '⌨️ Gõ Trên Máy Tính',
    startRecordingBtn: '▶️ Bắt Đầu Thu Âm',
    stopRecordingBtn: '⏹️ Dừng Ghi Âm',
    recordingStatus: 'Đang ghi âm:',
    submitHomeworkBtn: 'Nộp Bài Cho Cô Giáo 🚀',
    cancelBtn: 'Hủy',
    saveGradeBtn: 'Lưu Điểm & Gửi Báo Cáo 🌟',

    // Messages
    starRewardNote: 'Thưởng sao khi làm bài đúng hạn & điểm >= 8.5',
    handwrittenIntro: 'Kích thích viết tay trên giấy để tăng nhận diện mặt chữ và rèn nét chữ đẹp.',
    printInstruction: 'Bấm In phiếu bài tập khổ A4 ra giấy để luyện viết tay trước khi nộp ảnh.',
    photoReadyNote: 'Ảnh bài viết tay đã sẵn sàng để nộp:',
    recordedReadyNote: 'Bản ghi âm sẵn sàng:',
    scoreLabel: 'Điểm số (thang 10):',
    teacherFeedbackLabel: 'Lời nhận xét của cô giáo:',
    teacherFeedbackTitle: 'Lời nhận xét của cô:',
    starRewardBadge: 'sao ⭐'
  },
  en: {
    // Navigation & Portal Titles
    brand: 'Ms. Dung English Academy',
    cpanelSystem: 'Cpanel Hub',
    allCampuses: 'All Campuses',
    campusLabel: 'Campus:',
    adminCP: 'Master AdminCP',
    notifications: 'Notifications',
    stars: 'stars',
    starsBalance: 'Reward Stars',
    completedWork: 'Completed',
    avgScore: 'Average Score',

    // Role Cpanels
    studentDesk: 'Student Desk',
    parentPortal: 'Parent Portal',
    teacherWorkplace: 'Teacher Workplace',
    academicTesting: 'Academic & Testing Center',

    // Tabs
    homeworkTab: 'Homework & Assignments',
    examTab: 'Exam Arena',
    scheduleTab: 'Timetable',
    tuitionTab: 'Tuition & VietQR',
    gradingTab: 'Grade Homework',
    assignTab: 'Assign Homework',
    secondBrainTab: 'Obsidian Second-Brain',
    overviewTab: 'Overview',

    // Skills
    writing: 'Writing Essay',
    reading: 'Reading Comprehension',
    speaking: 'Speaking & Pronunciation',
    allSkills: 'All Skills',

    // Homework actions & states
    todo: 'To Do',
    submitted: 'Submitted',
    graded: 'Graded',
    all: 'All',
    notSubmitted: 'Not submitted',
    pendingGrading: 'Pending grading',
    deadlineLabel: 'Deadline (before next class):',
    teacherLabel: 'Assigned teacher:',
    doHomeworkBtn: 'Start Assignment →',
    reviewSubmissionBtn: 'Review / Resubmit',
    printWorksheetBtn: '🖨️ Print A4 Worksheet',
    uploadPhotoBtn: '📸 Upload Handwritten Photo',
    typeOnlineBtn: '⌨️ Type on Screen',
    startRecordingBtn: '▶️ Start Recording',
    stopRecordingBtn: '⏹️ Stop Recording',
    recordingStatus: 'Recording in progress:',
    submitHomeworkBtn: 'Submit to Teacher 🚀',
    cancelBtn: 'Cancel',
    saveGradeBtn: 'Save Score & Feedback 🌟',

    // Messages
    starRewardNote: 'Earn bonus stars for on-time submission & score >= 8.5',
    handwrittenIntro: 'Handwriting on paper stimulates fine motor skills and boosts letter recognition.',
    printInstruction: 'Print the A4 worksheet to practice handwriting before uploading the photo.',
    photoReadyNote: 'Handwritten photo ready to submit:',
    recordedReadyNote: 'Voice recording ready:',
    scoreLabel: 'Score (scale of 10):',
    teacherFeedbackLabel: 'Teacher Feedback:',
    teacherFeedbackTitle: 'Teacher Feedback:',
    starRewardBadge: 'stars ⭐'
  }
};

export function t(key, lang = 'vi') {
  const dict = DICTIONARY[lang] || DICTIONARY.vi;
  return dict[key] || DICTIONARY.vi[key] || key;
}
