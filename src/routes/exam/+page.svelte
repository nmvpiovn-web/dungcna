<script>
 import { onMount, onDestroy } from 'svelte';
 import { playAudioFeedback, speakWord } from '$lib/speech.js';
 import {
 getCurrentUser,
 getAuthToken,
 saveExamAttempt,
 saveBatchExamAttempts,
 logSnapshot,
 dispatchBotReport,
 getAttendedStudentsForSession,
 getAttendanceForSession,
 getAllClassSessions,
 getAllUsers,
 isSuperAdmin,
 getUserEnrolledGrades,
 requestUnlockClass
 } from '$lib/unifiedStore';
 import GuestExamModal from '$lib/components/GuestExamModal.svelte';
 // Academic Warmth Phase 3: test xep lop 3 phut cho khach (khong can login)
 import PlacementTest from '$lib/components/ui/PlacementTest.svelte';

 let { data } = $props();

 let currentUser = $state(typeof window !== 'undefined' ? getCurrentUser() : null);
 let showGuestModal = $state(false);
 let lockedExamAlert = $state('');
 let isRequestingUnlock = $state(false);
 let selectedExamId = $state(data.exams[0]?.id || 'ex_quick_15m_g7');
 let dynamicExam = $state(null);
 let dynamicQuestions = $state([]);
 let currentExam = $derived(
 dynamicExam && selectedExamId === dynamicExam.id
 ? dynamicExam
 : (data.exams.find(e => e.id === selectedExamId) || data.exams[0])
 );

 // Session & Attendance-based candidate selection
 let selectedSessionId = $state(data.sessions?.[0]?.id || 'sess_1');
 let selectedSessionDate = $state(new Date().toISOString().slice(0, 10));
 let filterAttendedOnly = $state(true); // Default: only attended students
 let selectedStudentId = $state('');
 let studentName = $state('');
 let isBatchGradingOpen = $state(false);
 let batchScores = $state([]);
 let batchStatusMsg = $state('');

 let currentSession = $derived(data.sessions?.find(s => s.id === selectedSessionId) || data.sessions?.[0]);

 let allSessionStudentCount = $derived.by(() => {
 if (!currentSession?.student_ids) return 0;
 return currentSession.student_ids.length;
 });

 let eligibleStudents = $state([]);

 function refreshEligibleStudents() {
 if (!selectedSessionId) {
 eligibleStudents = (data.users || []).filter(u => u.role === 'student');
 return;
 }
 if (filterAttendedOnly) {
 eligibleStudents = getAttendedStudentsForSession(selectedSessionId, selectedSessionDate);
 } else {
 const sess = data.sessions?.find(s => s.id === selectedSessionId);
 if (sess?.student_ids && sess.student_ids.length > 0) {
 eligibleStudents = (data.users || []).filter(u => sess.student_ids.includes(u.id));
 } else {
 eligibleStudents = (data.users || []).filter(u => u.role === 'student');
 }
 }

 // Auto set candidate
 if (currentUser?.role === 'student') {
 selectedStudentId = currentUser.id;
 studentName = currentUser.name;
 } else {
 if (!eligibleStudents.some(s => s.id === selectedStudentId) && eligibleStudents.length > 0) {
 selectedStudentId = eligibleStudents[0].id;
 studentName = eligibleStudents[0].name;
 } else if (eligibleStudents.length === 0) {
 selectedStudentId = '';
 studentName = 'Chưa có thí sinh';
 }
 }
 }

 function handleSessionChange() {
 refreshEligibleStudents();
 }

 function handleDateChange() {
 refreshEligibleStudents();
 }

 function handleStudentChange() {
 const found = eligibleStudents.find(s => s.id === selectedStudentId);
 if (found) {
 studentName = found.name;
 }
 }

 function openBatchGradingModal() {
 batchScores = eligibleStudents.map(st => ({
 student_id: st.id,
 student_name: st.name,
 student_email: st.email || '',
 score: 8.5,
 note: 'Tham gia kiểm tra đầy đủ, tập trung làm bài'
 }));
 batchStatusMsg = '';
 isBatchGradingOpen = true;
 }

 function closeBatchGradingModal() {
 isBatchGradingOpen = false;
 }

 function handleSaveBatchScores() {
 if (batchScores.length === 0) return;
 saveBatchExamAttempts(
 selectedSessionId,
 currentSession?.class_id || '',
 currentExam.id,
 currentExam.title,
 batchScores,
 currentUser
 );
 batchStatusMsg = `✅ Đã lưu điểm cho ${batchScores.length} học sinh thành công!`;
 playAudioFeedback(true);
 setTimeout(() => {
 isBatchGradingOpen = false;
 batchStatusMsg = '';
 }, 1500);
 }

 // Questions for currently selected exam
 let activeQuestions = $derived.by(() => {
 if (dynamicExam && selectedExamId === dynamicExam.id) {
 return dynamicQuestions;
 }
 const list = data.allQuestions.filter(q => q.exam_id === selectedExamId);
 if (list.length > 0) return list;
 // Fallback to default questions mapped
 return data.defaultQuestions.slice(0, 15).map((q, idx) => ({
 id: `fallback_${q.id}`,
 exam_id: selectedExamId,
 question_index: idx + 1,
 skill: 'grammar_vocab',
 type: 'multiple_choice',
 prompt: q.question,
 options_json: JSON.stringify([`A. ${q.option_a}`, `B. ${q.option_b}`, `C. ${q.option_c}`, `D. ${q.option_d}`]),
 correct_answer: q.correct_option,
 explanation: q.explanation || 'Chọn phương án phù hợp nhất theo cấu trúc ngữ pháp.',
 cambridge_level: 'KET_A2'
 }));
 });

 // State
 let isStarted = $state(false);
 let isExamPopupOpen = $state(false);
 let abandonConfirming = $state(false);
 let isSubmitted = $state(false);
 let timeLeftSeconds = $state(15 * 60);
 let timerInterval = null;
 let userAnswers = $state({}); // { qIndex: 'A' | 'B' | text }

 // Writing Module State
 let essayText = $state('');
 let essayWordCount = $derived(essayText.trim() ? essayText.trim().split(/\s+/).length : 0);

 // Speaking Module State (Web Speech Audio Recording)
 let isRecording = $state(false);
 let recordedAudioUrl = $state(null);
 let mediaRecorder = null;
 let audioChunks = [];
 let speechTranscript = $state('');

 function isExamEnrolledForUser(user, exam) {
 if (!user || user.role !== 'student') return true;
 if (!exam) return false;
 const grades = getUserEnrolledGrades(user);
 const title = String(exam.title || '').toLowerCase();
 const curriculumId = String(exam.curriculum_id || '').toLowerCase();

 return grades.some(g => {
 const clean = String(g || '').toLowerCase().trim();
 const match = clean.match(/lớp\s*([0-9]+)/i) || clean.match(/grade-?([0-9]+)/i) || clean.match(/^([0-9]+)$/);
 if (match) {
 const num = Number(match[1]);
 if (Number(exam.grade) === num || title.includes(`lớp ${num}`) || title.includes(`lop ${num}`)) return true;
 }
 if (clean.includes('ielts') && (curriculumId.includes('ielts') || title.includes('ielts') || exam.format_type === 'ielts_academic')) return true;
 if (clean.includes('toeic') && (curriculumId.includes('toeic') || title.includes('toeic') || exam.format_type === 'toeic_lr')) return true;
 if (clean.includes('toefl') && (curriculumId.includes('toefl') || title.includes('toefl') || exam.format_type === 'toefl_ibt')) return true;
 if ((clean.includes('đại học') || clean.includes('thptqg')) && (curriculumId.includes('thptqg') || Number(exam.grade) === 12)) return true;
 return false;
 });
 }

 async function handleUnlockRequest(exam) {
 if (!currentUser) return;
 isRequestingUnlock = true;
 try {
 await requestUnlockClass(currentUser.id, exam.title);
 playAudioFeedback('success');
 lockedExamAlert = `✅ Đã gửi yêu cầu mở đề thi "${exam.title}" tới Leader Cô Dung!`;
 setTimeout(() => lockedExamAlert = '', 6000);
 } catch (err) {
 lockedExamAlert = 'Lỗi gửi yêu cầu: ' + err.message;
 } finally {
 isRequestingUnlock = false;
 }
 }

 onMount(() => {
 currentUser = getCurrentUser();
 refreshEligibleStudents();
 if (currentUser?.role === 'student') {
 activeExamCategory = 'my_grade';
 studentName = currentUser?.name || 'Học viên';
 selectedStudentId = currentUser?.id || '';
 const match = data.exams.find(e => isExamEnrolledForUser(currentUser, e));
 if (match) {
 selectedExamId = match.id;
 }
 } else if (eligibleStudents.length > 0) {
 selectedStudentId = eligibleStudents[0].id;
 studentName = eligibleStudents[0].name;
 } else {
 studentName = currentUser?.name || 'Học viên Pro';
 }
 resetExamState();
 });

 let activeSessionId = $state(null);
 let activeServerDeadline = $state(null);
 let isSubmitting = $state(false);
 let submitError = $state('');
 let serverCalculatedScoreOverride = $state(null);

 onDestroy(() => {
 if (timerInterval) clearInterval(timerInterval);
 if (typeof document !== 'undefined') document.body.style.overflow = '';
 if (mediaRecorder && isRecording) {
 try {
 mediaRecorder.stop();
 mediaRecorder.stream.getTracks().forEach(track => track.stop());
 } catch {}
 }
 if (typeof window !== 'undefined') {
 window.__isExamActive = false;
 window.__isRecordingActive = false;
 window.unregisterBusyState?.('active_exam');
 window.unregisterBusyState?.('exam_audio_recording');
 }
 });

 // Bỏ test: bấm lần 1 hiện xác nhận ngay trên nút, bấm lần 2 mới thoát
 // (không dùng window.confirm vì headless/PWA WebView có thể nuốt dialog)
 function abandonExam() {
 if (isSubmitting) return;
 if (!abandonConfirming) {
 abandonConfirming = true;
 setTimeout(() => { abandonConfirming = false; }, 4000);
 return;
 }
 abandonConfirming = false;
 if (timerInterval) clearInterval(timerInterval);
 try {
 localStorage.removeItem(getExamBackupKey(currentExam?.id));
 localStorage.removeItem('tienganh_active_exam_backup');
 } catch {}
 resetExamState();
 isExamPopupOpen = false;
 if (typeof document !== 'undefined') document.body.style.overflow = '';
 if (typeof window !== 'undefined') {
 window.__isExamActive = false;
 window.unregisterBusyState?.('active_exam');
 }
 }

 // Đóng popup sau khi đã nộp bài (xem kết quả xong)
 function closeExamPopup() {
 resetExamState();
 isExamPopupOpen = false;
 if (typeof document !== 'undefined') document.body.style.overflow = '';
 if (typeof window !== 'undefined') {
 window.__isExamSubmitted = false;
 }
 }

 function resetExamState() {
 if (timerInterval) clearInterval(timerInterval);
 isStarted = false;
 isSubmitted = false;
 isSubmitting = false;
 submitError = '';
 serverCalculatedScoreOverride = null;
 activeSessionId = null;
 activeServerDeadline = null;
 userAnswers = {};
 essayText = '';
 speechTranscript = '';
 recordedAudioUrl = null;
 timeLeftSeconds = (currentExam?.duration_minutes || 15) * 60;
 }

 function getExamBackupKey(examId) {
 const uid = currentUser?.id || 'guest';
 return `tienganh_exam_backup_${uid}_${examId || currentExam?.id}`;
 }

 function clearActiveExamBackup(examId) {
 if (typeof window !== 'undefined') {
 try {
 localStorage.removeItem(getExamBackupKey(examId || currentExam?.id));
 localStorage.removeItem('tienganh_active_exam_backup');
 } catch {}
 }
 }

 function restoreExamBackupIfAvailable(examId) {
 if (typeof window === 'undefined') return false;
 try {
 const targetId = examId || currentExam?.id;
 const key = getExamBackupKey(targetId);
 const raw = localStorage.getItem(key) || localStorage.getItem('tienganh_active_exam_backup');
 if (raw) {
 const data = JSON.parse(raw);
 if (data.exam_id === targetId && data.userAnswers && Object.keys(data.userAnswers).length > 0) {
 const now = Date.now();
 const deadline = data.server_deadline || data.deadline;
 const remaining = deadline ? Math.floor((deadline - now) / 1000) : data.timeLeftSeconds;
 if (remaining > 0) {
 userAnswers = { ...data.userAnswers };
 activeSessionId = data.session_id || null;
 activeServerDeadline = deadline;
 timeLeftSeconds = remaining;
 isStarted = true;
 isSubmitted = false;
 window.__isExamActive = true;
 window.registerBusyState?.('active_exam');
 if (timerInterval) clearInterval(timerInterval);
 timerInterval = setInterval(() => {
 if (activeServerDeadline) {
 timeLeftSeconds = Math.max(0, Math.floor((activeServerDeadline - Date.now()) / 1000));
 } else {
 timeLeftSeconds--;
 }
 if (timeLeftSeconds <= 0) {
 clearInterval(timerInterval);
 submitExam();
 }
 }, 1000);
 return true;
 }
 }
 }
 } catch (e) {
 console.warn('Exam backup restore error:', e);
 }
 return false;
 }

 function handleSelectExam(ex) {
 if (currentUser?.role === 'student' && !isExamEnrolledForUser(currentUser, ex)) {
 playAudioFeedback(false);
 lockedExamAlert = `🔒 Đề thi "${ex.title}" chưa được mở cho lớp của em (${currentUser.grade || 'Lớp 7'}). Hãy hoàn thành bài thi khối lớp mình trước nhé!`;
 setTimeout(() => lockedExamAlert = '', 7000);
 return;
 }
 selectedExamId = ex.id;
 lockedExamAlert = '';
 const restored = restoreExamBackupIfAvailable(ex.id);
 if (!restored) {
 resetExamState();
 }
 // Mở popup phòng thi cô lập (PWA-safe): chỉ đóng khi nộp bài hoặc bỏ test
 isExamPopupOpen = true;
 abandonConfirming = false;
 if (typeof document !== 'undefined') document.body.style.overflow = 'hidden';
 }

 async function startExam() {
 if (currentUser?.role === 'student' && !isExamEnrolledForUser(currentUser, currentExam)) {
 playAudioFeedback(false);
 lockedExamAlert = `🔒 Không thể làm bài: Đề thi này chưa được mở cho khối lớp của em (${currentUser.grade || 'Lớp 7'}).`;
 return;
 }
 isStarted = true;
 isSubmitted = false;
 isSubmitting = false;
 submitError = '';
 serverCalculatedScoreOverride = null;
 userAnswers = {};
 // Đảm bảo popup mở (PWA)
 isExamPopupOpen = true;
 if (typeof document !== 'undefined') document.body.style.overflow = 'hidden';

 const durationMins = currentExam?.duration_minutes || 15;
 timeLeftSeconds = durationMins * 60;
 activeServerDeadline = Date.now() + (timeLeftSeconds * 1000);

 // Call server API to initiate authoritative exam session (P1-EXAM-04)
 if (currentExam?.is_random || currentExam?.instance_id) {
 activeSessionId = currentExam.instance_id || currentExam.id;
 } else {
 try {
 const res = await fetch('/api/exams', {
 method: 'POST',
 headers: {
 'Content-Type': 'application/json',
 ...(getAuthToken() ? { 'Authorization': `Bearer ${getAuthToken()}` } : {})
 },
 body: JSON.stringify({
 action: 'start_session',
 exam_id: currentExam?.id,
 duration_minutes: durationMins
 })
 });
 if (res.ok) {
 const resData = await res.json();
 if (resData.success && resData.session_instance) {
 activeSessionId = resData.session_instance.instance_id;
 if (resData.session_instance.deadline_at) {
 activeServerDeadline = new Date(resData.session_instance.deadline_at).getTime();
 timeLeftSeconds = Math.max(0, Math.floor((activeServerDeadline - Date.now()) / 1000));
 }
 }
 }
 } catch (apiErr) {
 console.warn('Exam server session initiation notice:', apiErr);
 }
 }

 if (typeof window !== 'undefined') {
 window.__isExamActive = true;
 window.__isExamSubmitted = false;
 window.registerBusyState?.('active_exam');
 try {
 const backupData = {
 session_id: activeSessionId,
 exam_id: currentExam?.id,
 user_id: currentUser?.id || 'guest',
 userAnswers: {},
 timeLeftSeconds,
 server_deadline: activeServerDeadline,
 deadline: activeServerDeadline,
 updated_at: Date.now()
 };
 localStorage.setItem(getExamBackupKey(currentExam?.id), JSON.stringify(backupData));
 localStorage.setItem('tienganh_active_exam_backup', JSON.stringify(backupData));
 } catch {}
 }

 if (timerInterval) clearInterval(timerInterval);
 timerInterval = setInterval(() => {
 if (activeServerDeadline) {
 timeLeftSeconds = Math.max(0, Math.floor((activeServerDeadline - Date.now()) / 1000));
 } else {
 timeLeftSeconds--;
 }
 if (timeLeftSeconds <= 0) {
 clearInterval(timerInterval);
 submitExam();
 }
 }, 1000);
 }

 function selectOption(qIdx, option) {
 if (isSubmitted || isSubmitting) return;
 userAnswers[qIdx] = option;
 if (typeof window !== 'undefined') {
 try {
 const key = getExamBackupKey(currentExam?.id);
 const backupData = {
 session_id: activeSessionId,
 exam_id: currentExam?.id,
 user_id: currentUser?.id || 'guest',
 userAnswers: { ...userAnswers },
 timeLeftSeconds,
 server_deadline: activeServerDeadline,
 deadline: activeServerDeadline,
 updated_at: Date.now()
 };
 localStorage.setItem(key, JSON.stringify(backupData));
 localStorage.setItem('tienganh_active_exam_backup', JSON.stringify(backupData));
 } catch {}
 }
 }

 function formatTime(totalSeconds) {
 const mins = Math.floor(totalSeconds / 60);
 const secs = totalSeconds % 60;
 return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
 }

 // Group / Group-Tree Hierarchy
 let activeExamGroup = $state('k12'); // 'k12' | 'intl' | 'periodic' | 'random_builder' | 'my_grade'
 let activeExamCategory = $state('all'); // Sub-category filter within group

 const examGroups = [
 { id: 'k12', label: '🎒 Khung K12 Phổ Thông', desc: 'Tiểu học (L1-5) • THCS (L6-9) • THPT (L10-12)', icon: '🎒' },
 { id: 'intl', label: '🌍 Chứng Chỉ Quốc Tế', desc: 'IELTS Academic • TOEIC L&R • TOEFL iBT', icon: '🌍' },
 { id: 'periodic', label: '⏱️ Đề Thi Theo Thời Gian', desc: '5 Phút Khởi Động • 15 Phút • 45 Phút 1 Tiết', icon: '⏱️' },
 { id: 'random_builder', label: '🎲 Tạo Đề Random Theo Nhóm', desc: 'Sinh Đề Ngẫu Nhiên D1 Chuẩn Ma Trận', icon: '🎲' }
 ];

 // Random Test Generator State
 let randomDuration = $state(15); // 5 | 15 | 45 | 50
 let randomGrade = $state(7);
 let randomSkill = $state('all'); // 'all' | 'grammar' | 'vocabulary' | 'phonics' | 'reading'
 let randomSuccessNotice = $state('');
 let isGeneratingRandom = $state(false);

 async function generateRandomExam() {
 // Check user role permission for selected grade
 if (currentUser?.role === 'student') {
 const enrolledGrades = getUserEnrolledGrades(currentUser);
 const isAllowed = enrolledGrades.some(g => {
 const clean = String(g || '').toLowerCase().trim();
 const match = clean.match(/lớp\s*([0-9]+)/i) || clean.match(/^([0-9]+)$/);
 if (match && Number(match[1]) === Number(randomGrade)) return true;
 if (randomGrade === 0 && (clean.includes('ielts') || clean.includes('ket') || clean.includes('pet'))) return true;
 if (randomDuration === 50 && (clean.includes('12') || clean.includes('thpt'))) return true;
 return false;
 });
 if (!isAllowed) {
 playAudioFeedback(false);
 lockedExamAlert = `🔒 Em đang được phân quyền vào ${currentUser.grade || 'Lớp 7'}. Vui lòng chọn đúng khối lớp của em hoặc liên hệ Cô Dung để mở thêm lớp nhé!`;
 setTimeout(() => lockedExamAlert = '', 6000);
 return;
 }
 }

 isGeneratingRandom = true;
 try {
 let apiType = '15m';
 if (randomDuration === 50) apiType = 'thpt_qg';
 else if (randomDuration === 45) apiType = '45m';
 else if (randomDuration === 5) apiType = '5m';

 const gradeQuery = randomGrade > 0 ? `lop_${randomGrade}` : (apiType === 'thpt_qg' ? 'lop_12' : 'lop_7');
 const token = getAuthToken();
 if (!token) {
 lockedExamAlert = '🔐 Vui lòng đăng nhập để tạo đề ngẫu nhiên từ ngân hàng D1.';
 playAudioFeedback(false);
 return;
 }
 const headers = {
 'Content-Type': 'application/json',
 ...(token ? { 'Authorization': `Bearer ${token}` } : {})
 };
 const res = await fetch(`/api/exams/random?action=create`, {
 method: 'POST',
 headers,
 body: JSON.stringify({
 action: 'create',
 exam_type: apiType,
 grade: gradeQuery,
 skill_category: randomSkill
 })
 });
 const dataJson = await res.json();

 if (!res.ok || !dataJson.success) {
 lockedExamAlert = `⚠️ ${dataJson.error || 'Không thể tạo đề từ ngân hàng câu hỏi.'}`;
 playAudioFeedback(false);
 setTimeout(() => lockedExamAlert = '', 8000);
 return;
 }

 if (dataJson.items && dataJson.items.length > 0) {
 const dynId = dataJson.instance_id;
 dynamicExam = {
 id: dynId,
 instance_id: dynId,
 curriculum_id: randomGrade > 0 ? `curr_g${randomGrade}` : 'curr_thptqg',
 title: dataJson.title || `🎲 Đề Thi Ngẫu Nhiên D1 (${dataJson.total_questions} câu)`,
 description: `Đề thi trắc nghiệm được Cloudflare D1 sinh tự động theo nhóm kỹ năng ${randomSkill.toUpperCase()} và ma trận nhận thức GDPT. Bản chụp lưu máy chủ: #${dynId.slice(-6)}.`,
 grade: randomDuration === 50 ? 12 : randomGrade,
 format_type: apiType === 'thpt_qg' ? 'standard_45m' : (apiType === '45m' ? 'standard_45m' : 'quick_15m'),
 skill_category: randomSkill,
 duration_minutes: dataJson.duration_minutes || randomDuration,
 total_questions: dataJson.total_questions || dataJson.items.length,
 pass_percentage: 70,
 created_by: 'Cloudflare D1 AI Engine',
 is_published: 1,
 is_random: true,
 created_at: new Date().toISOString()
 };

 dynamicQuestions = dataJson.items.map((item, idx) => {
 const normOpts = (item.options || []).map((o, oIdx) => {
 if (typeof o === 'string') return o;
 if (o && typeof o === 'object') {
 if (o.label) return o.label;
 const letter = o.id || String.fromCharCode(65 + oIdx);
 const text = o.text || o.content || '';
 return `${letter}. ${text}`;
 }
 return String(o);
 });
 return {
 id: item.question_id,
 exam_id: dynId,
 question_index: item.item_order || idx + 1,
 prompt: item.question_text,
 options_json: JSON.stringify(normOpts),
 skill: item.skill_category || item.skill || (randomSkill !== 'all' ? randomSkill : 'grammar'),
 type: 'multiple_choice',
 reading_passage: item.reading_passage
 };
 });

 selectedExamId = dynId;
 lockedExamAlert = '';
 resetExamState();
 startExam();
 randomSuccessNotice = `🎉 Đã tạo đề ngẫu nhiên D1 (${dataJson.items.length} câu) thành công! Mã đề: #${dynId.slice(-6)}.`;
 setTimeout(() => randomSuccessNotice = '', 6000);
 return;
 }
 lockedExamAlert = '⚠️ Máy chủ không trả về câu hỏi cho cấu hình đã chọn.';
 playAudioFeedback(false);
 return;
 } catch (apiErr) {
 console.warn('API /api/exams/random unavailable:', apiErr);
 lockedExamAlert = '⚠️ Không kết nối được ngân hàng đề thi. Vui lòng thử lại sau.';
 playAudioFeedback(false);
 return;
 } finally {
 isGeneratingRandom = false;
 }
 }

 let enrolledExamsCount = $derived(
 currentUser?.role === 'student' ? data.exams.filter(e => isExamEnrolledForUser(currentUser, e)).length : data.exams.length
 );

 let filteredExams = $derived(
 data.exams.filter(e => {
 if (activeExamGroup === 'random_builder') return false;
 if (activeExamGroup === 'my_grade') return isExamEnrolledForUser(currentUser, e);
 if (activeExamGroup === 'k12') {
 const hasGrade = (t, g) => new RegExp(`Lớp ${g}(?!\\d)`).test(t || '');
 if (activeExamCategory === 'primary') return (e.grade >= 1 && e.grade <= 5) || [1,2,3,4,5].some(g => hasGrade(e.title, g));
 if (activeExamCategory === 'g6') return e.grade === 6 || hasGrade(e.title, 6) || e.curriculum_id === 'curr_g6';
 if (activeExamCategory === 'g7') return e.grade === 7 || hasGrade(e.title, 7) || e.curriculum_id === 'curr_g7';
 if (activeExamCategory === 'g8') return e.grade === 8 || hasGrade(e.title, 8) || e.curriculum_id === 'curr_g8';
 if (activeExamCategory === 'g9') return e.grade === 9 || e.title.includes('Vào 10') || e.curriculum_id === 'curr_g9';
 if (activeExamCategory === 'highschool') return (e.grade >= 10 && e.grade <= 12) || [10,11,12].some(g => hasGrade(e.title, g)) || e.title.includes('THPT');
 return (e.grade >= 1 && e.grade <= 12) || e.curriculum_id?.startsWith('curr_g') || e.curriculum_id === 'curr_thptqg' || !['ielts_academic', 'toeic_lr', 'toefl_ibt'].includes(e.format_type);
 }
 if (activeExamGroup === 'intl') {
 if (activeExamCategory === 'ielts') return e.format_type === 'ielts_academic' || e.curriculum_id === 'curr_ielts';
 if (activeExamCategory === 'toeic') return e.format_type === 'toeic_lr' || e.curriculum_id === 'curr_toeic';
 if (activeExamCategory === 'toefl') return e.format_type === 'toefl_ibt' || e.curriculum_id === 'curr_toefl';
 return ['ielts_academic', 'toeic_lr', 'toefl_ibt'].includes(e.format_type) || ['curr_ielts', 'curr_toeic', 'curr_toefl'].includes(e.curriculum_id);
 }
 if (activeExamGroup === 'periodic') {
 if (activeExamCategory === 'quick_5m') return e.format_type === 'quick_5m' || e.duration_minutes === 5;
 if (activeExamCategory === 'quick_15m') return e.format_type === 'quick_15m' || e.duration_minutes === 15;
 if (activeExamCategory === 'standard_45m') return e.format_type === 'standard_45m' || e.duration_minutes === 45;
 return true;
 }
 return true;
 })
 );

 // Scoring
 let correctCount = $derived.by(() => {
 let count = 0;
 activeQuestions.forEach((q, idx) => {
 const uAns = userAnswers[idx];
 if (uAns && q.correct_answer && uAns.trim().toUpperCase() === q.correct_answer.trim().toUpperCase()) {
 count++;
 }
 });
 return count;
 });

 let calculatedScore = $derived.by(() => {
 if (serverCalculatedScoreOverride !== null) {
 return Number(serverCalculatedScoreOverride).toFixed(1);
 }
 if (activeQuestions.length === 0) return 0;
 // If writing exam
 if (currentExam.skill_category === 'writing') {
 const words = essayWordCount;
 if (words >= 250) return 8.0;
 if (words >= 180) return 6.5;
 if (words >= 100) return 5.0;
 return 4.0;
 }
 // If speaking exam
 if (currentExam.skill_category === 'speaking') {
 return speechTranscript ? 7.5 : 6.0;
 }
 return ((correctCount / activeQuestions.length) * 10).toFixed(1);
 });

 let formattedResultBadge = $derived.by(() => {
 const total = activeQuestions.length || 1;
 const ratio = correctCount / total;

 if (currentExam.format_type === 'ielts_academic' || currentExam.curriculum_id === 'curr_ielts') {
 const band = (ratio * 4.0 + 5.0).toFixed(1);
 return {
 scaleName: 'IELTS Band',
 value: `Band ${band} / 9.0`,
 sub: band >= 7.5 ? 'Very Good User (C1 CAE)' : 'Competent User (B2 FCE)',
 badgeColor: 'text-indigo-600'
 };
 }
 if (currentExam.format_type === 'toeic_lr' || currentExam.curriculum_id === 'curr_toeic') {
 const toeicScore = Math.min(990, Math.round(ratio * 800 + 190));
 return {
 scaleName: 'Điểm TOEIC Chuẩn',
 value: `${toeicScore} / 990`,
 sub: toeicScore >= 785 ? 'Working Proficiency (Giao Tiếp Chuyên Nghiệp)' : 'Intermediate Proficiency',
 badgeColor: 'text-teal-600'
 };
 }
 if (currentExam.format_type === 'toefl_ibt' || currentExam.curriculum_id === 'curr_toefl') {
 const toeflScale = Math.min(120, Math.round(ratio * 80 + 40));
 return {
 scaleName: 'Điểm TOEFL iBT',
 value: `${toeflScale} / 120`,
 sub: toeflScale >= 95 ? 'High Academic Level (Chuẩn Du Học Mỹ)' : 'Intermediate Academic',
 badgeColor: 'text-purple-600'
 };
 }
 return {
 scaleName: 'Điểm Số (Hệ 10)',
 value: `${calculatedScore} / 10.0`,
 sub: parseFloat(calculatedScore) >= 8.0 ? 'Giỏi / Xuất Sắc' : 'Đạt Chuẩn Bộ GD',
 badgeColor: parseFloat(calculatedScore) >= 7.0 ? 'text-emerald-600' : 'text-amber-600'
 };
 });

 let earnedStars = $derived.by(() => {
 const sc = parseFloat(calculatedScore);
 if (sc >= 9.0) return 20;
 if (sc >= 8.0) return 15;
 if (sc >= 7.0) return 10;
 return 0;
 });

 async function submitExam() {
 if (timerInterval) clearInterval(timerInterval);
 if (isSubmitting) return;
 isSubmitting = true;
 submitError = '';

 const studentUser = (data.users || []).find(u => u.id === selectedStudentId) || currentUser;
 // Đảm bảo mọi câu hỏi đều có key trong answers (câu bỏ trống = chuỗi rỗng, tính là sai chứ không lỗi schema)
 const completeAnswers = {};
 activeQuestions.forEach((q, idx) => {
   const key = q.id || idx;
   const ans = userAnswers[idx] ?? userAnswers[key] ?? '';
   completeAnswers[key] = typeof ans === 'string' ? ans : String(ans ?? '');
 });
 const finalAnswers = { ...completeAnswers, essay: essayText, transcript: speechTranscript };
 const durationSecs = (currentExam.duration_minutes * 60) - timeLeftSeconds;

 let serverCommitSuccess = false;
 let committedAttempt = null;

 // Authoritative Server Submission to D1 (P1-EXAM-04)
 try {
 const isRandomExam = Boolean(currentExam?.is_random || currentExam?.instance_id);
 const token = getAuthToken();
 const headers = {
 'Content-Type': 'application/json',
 ...(token ? { 'Authorization': `Bearer ${token}` } : {})
 };

 if (isRandomExam) {
 // Direct authoritative submission to /api/exams/random
 const randomAnswerPayload = {};
 activeQuestions.forEach((q, idx) => {
 const ans = userAnswers[idx] || '';
 if (ans) {
 randomAnswerPayload[idx + 1] = ans; // 1-based order
 randomAnswerPayload[idx] = ans; // 0-based index
 if (q.id) randomAnswerPayload[q.id] = ans;
 }
 });

 const res = await fetch('/api/exams/random', {
 method: 'POST',
 headers,
 body: JSON.stringify({
 action: 'submit',
 instance_id: currentExam.instance_id || currentExam.id,
 answers: randomAnswerPayload,
 duration_seconds: durationSecs
 })
 });

 const resData = await res.json();
 if (res.ok && resData.success) {
 serverCommitSuccess = true;
 committedAttempt = {
 id: resData.instance_id,
 score: resData.score,
 percentage: resData.percentage,
 correct_count: resData.correct_count
 };
 if (resData.score !== undefined) {
 serverCalculatedScoreOverride = resData.score;
 }
 } else {
 submitError = resData.error || 'Máy chủ không tiếp nhận bài thi ngẫu nhiên.';
 }
 } else {
 const res = await fetch('/api/exams', {
 method: 'POST',
 headers,
 body: JSON.stringify({
 exam_id: currentExam.id,
 instance_id: activeSessionId,
 session_id: activeSessionId,
 user_id: selectedStudentId || currentUser?.id,
 answers: finalAnswers,
 duration_seconds: durationSecs
 })
 });

 const resData = await res.json();
 if (res.ok && resData.success) {
 serverCommitSuccess = true;
 committedAttempt = resData.attempt;
 if (resData.server_calculated_score !== undefined) {
 serverCalculatedScoreOverride = resData.server_calculated_score;
 }
 } else {
 submitError = resData.error || 'Máy chủ không tiếp nhận bài thi.';
 }
 }
 } catch (netErr) {
 console.error('Submit exam network error:', netErr);
 submitError = 'Lỗi kết nối mạng: Không thể xác nhận lưu bài thi trên máy chủ D1. Bài làm đã được bảo lưu an toàn trong thiết bị.';
 }

 // Only finalize exam and clear backup if server commit succeeds or in unauthenticated guest mode
 if (serverCommitSuccess || (!getAuthToken() && currentUser?.role !== 'student')) {
 isSubmitted = true;
 isSubmitting = false;
 if (typeof window !== 'undefined') {
 window.__isExamActive = false;
 window.__isExamSubmitted = true;
 window.unregisterBusyState?.('active_exam');
 }

 // Save to local unifiedStore cache
 const attempt = saveExamAttempt(committedAttempt || {
 user_id: selectedStudentId || currentUser?.id || 'usr_guest',
 user_name: studentName,
 user_email: studentUser?.email || currentUser?.email || 'guest@timbk.io.vn',
 exam_id: currentExam.id,
 exam_title: currentExam.title,
 score: serverCalculatedScoreOverride !== null ? serverCalculatedScoreOverride : parseFloat(calculatedScore),
 max_score: 10,
 answers: finalAnswers,
 duration_seconds: durationSecs,
 session_id: activeSessionId || selectedSessionId,
 class_id: currentSession?.class_id || ''
 });

 // Clear backup ONLY after verified commit
 clearActiveExamBackup(currentExam?.id);

 // Dispatch bot alert
 dispatchBotReport('EXAM_SUBMITTED', {
 student_name: studentName,
 exam_title: currentExam.title,
 score: serverCalculatedScoreOverride !== null ? serverCalculatedScoreOverride : calculatedScore,
 duration: `${Math.floor(durationSecs / 60)} phút`,
 class_name: currentSession?.class_name || 'Lớp Tiếng Anh Cô Dung',
 stars_reward: earnedStars
 });

 if (parseFloat(calculatedScore) >= 7.0) {
 playAudioFeedback(true);
 } else {
 playAudioFeedback(false);
 }
 } else {
 isSubmitting = false;
 console.warn('Exam submit held: backup preserved for retry:', submitError);
 }
 }

 // Audio playing for listening questions
 function playQuestionAudio(audioUrl) {
 if (!audioUrl) return;
 if (audioUrl.startsWith('speech_prompt:')) {
 const textToSpeak = audioUrl.replace('speech_prompt:', '').trim();
 speakWord(textToSpeak);
 } else {
 const audio = new Audio(audioUrl);
 audio.play().catch(e => {
 console.warn('Audio play error, falling back to speech synthesis:', e);
 speakWord(audioUrl);
 });
 }
 }

 // Speaking Recording Functions
 async function startRecording() {
 try {
 const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
 mediaRecorder = new MediaRecorder(stream);
 audioChunks = [];

 mediaRecorder.ondataavailable = (event) => {
 if (event.data.size > 0) audioChunks.push(event.data);
 };

 mediaRecorder.onstop = () => {
 const audioBlob = new Blob(audioChunks, { type: 'audio/wav' });
 recordedAudioUrl = URL.createObjectURL(audioBlob);
 speechTranscript = "Recorded voice sample successfully captured. Fluency and pronunciation are ready for evaluation.";
 if (typeof window !== 'undefined') {
 window.__isRecordingActive = false;
 window.unregisterBusyState?.('exam_audio_recording');
 }
 };

 mediaRecorder.start();
 isRecording = true;
 if (typeof window !== 'undefined') {
 window.__isRecordingActive = true;
 window.registerBusyState?.('exam_audio_recording');
 }
 } catch (err) {
 alert('Không thể truy cập Microphone: ' + err.message);
 }
 }

 function stopRecording() {
 if (mediaRecorder && isRecording) {
 mediaRecorder.stop();
 isRecording = false;
 if (typeof window !== 'undefined') {
 window.__isRecordingActive = false;
 window.unregisterBusyState?.('exam_audio_recording');
 }
 mediaRecorder.stream.getTracks().forEach(track => track.stop());
 }
 }
</script>

<div class="space-y-6 min-w-0 max-w-full overflow-x-hidden">
 <!-- Academic Warmth Phase 3: Test xep lop 3 phut (khach, khong can login) -->
 <section id="placement" class="scroll-mt-24">
 <PlacementTest />
 </section>

 {#if currentUser?.role === 'teacher' || currentUser?.role === 'superadmin' || isSuperAdmin(currentUser)}
 <!-- Teacher & Leader Attendance-Linked Exam Panel -->
 <div class="rounded-3xl bg-slate-900 border border-emerald-500/30 p-5 md:p-6 shadow-xl space-y-4">
 <div class="flex flex-col md:flex-row md:items-center justify-between gap-4">
 <div>
 <div class="text-xs font-bold text-emerald-400 uppercase tracking-wider flex items-center gap-2">
 <span class="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse"></span>
 <span>👩‍🏫 ĐIỀU PHỐI PHÒNG THI THEO LỚP &amp; ĐIỂM DANH (Teacher &amp; Leader Cô Dung)</span>
 </div>
 <div class="text-sm font-black text-white mt-1">
 Khởi Tạo Đề Thi &amp; Gán Học Sinh Trực Tiếp Theo Buổi Học
 </div>
 </div>

 <!-- Quick Action Buttons -->
 <div class="flex items-center gap-2">
 <button
 type="button"
 onclick={openBatchGradingModal}
 class="px-4 py-2 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-bold text-xs shadow-md shadow-emerald-600/30 flex items-center gap-1.5 transition-all hover:scale-105"
 >
 <span>⚡ Chấm Nhanh Cả Lớp Có Mặt</span>
 <span class="px-1.5 py-0.5 rounded-full bg-white/20 text-[10px]">{eligibleStudents.length} em</span>
 </button>
 <a
 href="/schedule"
 class="px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold text-xs flex items-center gap-1 border border-slate-700"
 >
 <span>📅 Điểm Danh Buổi Học</span>
 </a>
 </div>
 </div>

 <!-- Controls Grid -->
 <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 text-xs pt-1">
 <!-- 1. Select Session -->
 <div class="space-y-1">
 <label class="font-bold text-slate-300" for="sess-select">1. Chọn Buổi Học / Lớp:</label>
 <select
 id="sess-select"
 bind:value={selectedSessionId}
 onchange={handleSessionChange}
 class="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white font-medium focus:outline-none focus:border-emerald-500"
 >
 {#each (data.sessions || []) as s}
 <option value={s.id}>
 {s.class_name} ({s.day_name} {s.start_time})
 </option>
 {/each}
 </select>
 </div>

 <!-- 2. Select Date -->
 <div class="space-y-1">
 <label class="font-bold text-slate-300" for="sess-date">2. Ngày Điểm Danh:</label>
 <input
 id="sess-date"
 type="date"
 bind:value={selectedSessionDate}
 onchange={handleDateChange}
 class="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white font-medium focus:outline-none focus:border-emerald-500"
 />
 </div>

 <!-- 3. Attendance Filter -->
 <div class="space-y-1">
 <span class="font-bold text-slate-300 block">3. Bộ Lọc Điểm Danh:</span>
 <div class="flex items-center gap-1 bg-slate-950 p-1 rounded-xl border border-slate-800">
 <button
 type="button"
 onclick={() => { filterAttendedOnly = true; refreshEligibleStudents(); }}
 class="flex-1 py-1.5 px-2 rounded-lg font-bold text-[11px] transition-all {filterAttendedOnly ? 'bg-emerald-600 text-white shadow-sm' : 'text-slate-400 hover:text-white'}"
 >
 🟢 Có Mặt Hôm Nay
 </button>
 <button
 type="button"
 onclick={() => { filterAttendedOnly = false; refreshEligibleStudents(); }}
 class="flex-1 py-1.5 px-2 rounded-lg font-bold text-[11px] transition-all {!filterAttendedOnly ? 'bg-indigo-600 text-white shadow-sm' : 'text-slate-400 hover:text-white'}"
 >
 👥 Tất Cả ({allSessionStudentCount})
 </button>
 </div>
 </div>

 <!-- 4. Selected Candidate -->
 <div class="space-y-1">
 <label class="font-bold text-slate-300 flex items-center justify-between" for="cand-select">
 <span>4. Thí Sinh Làm Bài:</span>
 <span class="text-[10px] font-semibold text-emerald-400">{eligibleStudents.length} em đủ điều kiện</span>
 </label>
 <select
 id="cand-select"
 bind:value={selectedStudentId}
 onchange={handleStudentChange}
 class="w-full bg-slate-950 border border-emerald-500/40 rounded-xl px-3 py-2 text-white font-bold focus:outline-none focus:border-emerald-400"
 >
 {#each eligibleStudents as st}
 <option value={st.id}>
 👤 {st.name} ({st.username || st.phone || 'Học viên'})
 </option>
 {/each}
 {#if eligibleStudents.length === 0}
 <option value="" disabled>Chưa có học sinh điểm danh ngày này</option>
 {/if}
 </select>
 </div>
 </div>

 <!-- Quick Pill Selector -->
 {#if eligibleStudents.length > 0}
 <div class="flex items-center gap-2 overflow-x-auto pb-1 pt-1 text-xs">
 <span class="text-ink-500 whitespace-nowrap text-[11px] font-medium">Chọn nhanh thí sinh:</span>
 {#each eligibleStudents as st}
 {@const isChosen = selectedStudentId === st.id}
 <button
 type="button"
 onclick={() => { selectedStudentId = st.id; handleStudentChange(); }}
 class="px-2.5 py-1 rounded-lg border font-semibold text-[11px] transition-all whitespace-nowrap flex items-center gap-1.5 {isChosen ? 'bg-emerald-500/20 border-emerald-400 text-emerald-300 shadow-sm ring-1 ring-emerald-400/50' : 'bg-slate-950/80 border-slate-800 text-slate-400 hover:text-white hover:border-slate-700'}"
 >
 <span class="w-1.5 h-1.5 rounded-full {isChosen ? 'bg-emerald-400' : 'bg-ink-500'}"></span>
 <span>{st.name}</span>
 </button>
 {/each}
 </div>
 {/if}
 </div>
 {:else if currentUser?.role === 'student'}
 {@const isTrialUser = Boolean(currentUser.is_trial) || (typeof currentUser.metadata === 'string' ? currentUser.metadata.includes('"is_trial":true') : Boolean(currentUser.metadata?.is_trial))}
 {@const isOfficial = currentUser.approval_status === 'official' || (currentUser.status === 'active' && !isTrialUser)}
 {@const primaryGrade = currentUser.grade || 'Lớp 7'}
 <!-- Student Header Badge -->
 <div class="rounded-2xl bg-indigo-950/40 border border-indigo-500/30 p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4 shadow-lg">
 <div class="flex items-center gap-3.5">
 <div class="w-11 h-11 rounded-2xl bg-indigo-600/30 border border-indigo-500/40 text-indigo-300 font-bold flex items-center justify-center text-xl shadow-md">
 🎓
 </div>
 <div class="space-y-0.5">
 <div class="text-sm font-bold text-white flex flex-wrap items-center gap-2">
 <span>Thí Sinh: <strong class="text-indigo-200">{currentUser.name}</strong></span>
 {#if isOfficial}
 <span class="text-[10px] px-2.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 font-bold border border-emerald-500/30">
 ✓ Học Sinh Chính Thức
 </span>
 {:else}
 <span class="text-[10px] px-2.5 py-0.5 rounded-full bg-amber-500/20 text-amber-300 font-bold border border-amber-500/30">
 ⏳ Dùng Thử (Trial) • Chờ Cô Dung Duyệt
 </span>
 {/if}
 </div>
 <div class="text-xs text-ink-500">
 Tài khoản: <strong class="text-slate-200">@{currentUser.username}</strong> • Chương trình: <strong class="text-emerald-400">{primaryGrade} GDPT 2026</strong>
 </div>
 </div>
 </div>
 <div class="sm:text-right bg-indigo-900/30 px-3.5 py-2 rounded-xl border border-indigo-500/20">
 <div class="text-[10px] text-indigo-300 font-extrabold uppercase tracking-wider">Khối Lớp Đã Đăng Ký</div>
 <div class="text-sm font-black text-white">{primaryGrade}</div>
 </div>
 </div>
 {/if}

 <!-- Locked Exam Alert Banner -->
 {#if lockedExamAlert}
 <div class="p-4 rounded-2xl bg-amber-500/15 border border-amber-500/30 text-amber-800 text-xs font-semibold flex items-center justify-between shadow-lg animate-in slide-in-from-top-2">
 <div class="flex items-center gap-2.5">
 <span class="text-xl">🔒</span>
 <span>{lockedExamAlert}</span>
 </div>
 <button onclick={() => lockedExamAlert = ''} class="text-amber-600 hover:text-white font-bold text-sm">✕</button>
 </div>
 {/if}

 <!-- Exam Selector Ribbon: Structured Group-Tree Navigation -->
 <div class="rounded-3xl bg-surface-0 border border-line p-5 md:p-6 shadow-xl space-y-4">
 <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-3 min-w-0 max-w-full pb-2 border-b border-line">
 <div>
 <div class="text-xs font-bold text-brand-600 uppercase tracking-wider flex items-center gap-2">
 <span>👩‍🏫</span>
 <span>PHÂN HỆ PHÒNG THI &amp; ĐÁNH GIÁ NĂNG LỰC CHUẨN 2026:</span>
 </div>
 <h2 class="text-xl sm:text-2xl font-heading font-semibold text-ink-900 mt-0.5">
 Danh Mục Đề Thi Theo Cây Phân Cấp (Group-Tree)
 </h2>
 </div>

 <!-- Quick Action Utilities -->
 <div class="flex items-center gap-2 flex-wrap">
 <button
 id="guest-exam-btn"
 data-testid="guest-exam-btn"
 type="button"
 onclick={() => showGuestModal = true}
 class="px-3.5 py-2 rounded-xl transition-all flex items-center gap-1.5 bg-brand-600 hover:bg-brand-500 text-white font-semibold text-xs shadow-sm hover:scale-105"
 >
 <span>🎓 Thi Thử Cho Khách</span>
 <span class="px-1.5 py-0.5 rounded-full bg-white/20 text-[10px]">Tự Do</span>
 </button>

 {#if currentUser?.role === 'student'}
 <button
 onclick={() => { activeExamGroup = 'my_grade'; activeExamCategory = 'all'; }}
 class="px-3.5 py-2 rounded-xl transition-all flex items-center gap-1.5 text-xs font-bold {activeExamGroup === 'my_grade' ? 'bg-amber-600 text-white shadow-md ring-2 ring-amber-400/40' : 'bg-amber-50 text-amber-800 border border-amber-300 hover:bg-amber-100'}"
 >
 <span>🎯 Đề Khối Của Em ({enrolledExamsCount})</span>
 </button>
 {/if}
 </div>
 </div>

 <!-- LEVEL 1: Main Groups Selection (Group Cards) -->
 <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 pt-1">
 {#each examGroups as grp}
 <button
 id="group-tab-{grp.id}"
 data-testid="group-tab-{grp.id}"
 type="button"
 onclick={() => { activeExamGroup = grp.id; activeExamCategory = 'all'; }}
 class="p-3.5 rounded-2xl text-left border transition-all flex items-start gap-3 group {activeExamGroup === grp.id ? 'bg-brand-50 border-brand-600 shadow-md ring-2 ring-brand-200/30' : 'bg-surface-1/60 border-line hover:border-brand-200'}"
 >
 <span class="text-2xl p-2 rounded-xl bg-surface-0 border border-line group-hover:scale-110 transition-transform shrink-0">
 {grp.icon}
 </span>
 <div class="min-w-0">
 <div class="font-heading font-semibold text-xs sm:text-sm text-ink-900 truncate {activeExamGroup === grp.id ? 'text-brand-700' : ''}">
 {grp.label}
 </div>
 <div class="text-[11px] text-ink-500 line-clamp-1 mt-0.5">
 {grp.desc}
 </div>
 </div>
 </button>
 {/each}
 </div>

 <!-- LEVEL 2: Sub-Tree Hierarchy Pills for Active Group -->
 {#if activeExamGroup === 'k12'}
 <div class="pt-3 border-t border-line flex items-center gap-2 overflow-x-auto pb-1 text-xs" style="-webkit-overflow-scrolling: touch; touch-action: pan-x pan-y;">
 <span class="text-ink-500 font-bold uppercase text-[10px] whitespace-nowrap">Khối lớp con:</span>
 <button
 onclick={() => activeExamCategory = 'all'}
 class="px-4 py-2.5 rounded-xl font-bold whitespace-nowrap transition-colors touch-manipulation {activeExamCategory === 'all' ? 'bg-brand-600 text-white shadow-xs' : 'bg-surface-1 text-ink-500 hover:bg-line'}"
 >
 Tất Cả K12
 </button>
 <button
 onclick={() => activeExamCategory = 'primary'}
 class="px-4 py-2.5 rounded-xl font-bold whitespace-nowrap transition-colors touch-manipulation {activeExamCategory === 'primary' ? 'bg-brand-600 text-white shadow-xs' : 'bg-surface-1 text-ink-500 hover:bg-line'}"
 >
 🎒 Tiểu Học (Lớp 1 - 5)
 </button>
 <button
 onclick={() => activeExamCategory = 'g6'}
 class="px-4 py-2.5 rounded-xl font-bold whitespace-nowrap transition-colors touch-manipulation {activeExamCategory === 'g6' ? 'bg-brand-600 text-white shadow-xs' : 'bg-surface-1 text-ink-500 hover:bg-line'}"
 >
 📚 Lớp 6 (THCS)
 </button>
 <button
 onclick={() => activeExamCategory = 'g7'}
 class="px-3 py-1.5 rounded-xl font-bold whitespace-nowrap transition-colors {activeExamCategory === 'g7' ? 'bg-brand-600 text-white shadow-xs' : 'bg-surface-1 text-ink-500 hover:bg-line'}"
 >
 🌱 Lớp 7 (Global Success &amp; KET)
 </button>
 <button
 onclick={() => activeExamCategory = 'g8'}
 class="px-3 py-1.5 rounded-xl font-bold whitespace-nowrap transition-colors {activeExamCategory === 'g8' ? 'bg-brand-600 text-white shadow-xs' : 'bg-surface-1 text-ink-500 hover:bg-line'}"
 >
 📖 Lớp 8 (THCS)
 </button>
 <button
 onclick={() => activeExamCategory = 'g9'}
 class="px-3 py-1.5 rounded-xl font-bold whitespace-nowrap transition-colors {activeExamCategory === 'g9' ? 'bg-brand-600 text-white shadow-xs' : 'bg-surface-1 text-ink-500 hover:bg-line'}"
 >
 🎯 Vào 10 (Lớp 9 Chuyên)
 </button>
 <button
 onclick={() => activeExamCategory = 'highschool'}
 class="px-3 py-1.5 rounded-xl font-bold whitespace-nowrap transition-colors {activeExamCategory === 'highschool' ? 'bg-brand-600 text-white shadow-xs' : 'bg-surface-1 text-ink-500 hover:bg-line'}"
 >
 🏢 THPT (Lớp 10 - 12)
 </button>
 </div>
 {:else if activeExamGroup === 'intl'}
 <div class="pt-3 border-t border-line flex items-center gap-2 overflow-x-auto pb-1 text-xs">
 <span class="text-ink-500 font-bold uppercase text-[10px] whitespace-nowrap">Chứng chỉ con:</span>
 <button
 onclick={() => activeExamCategory = 'all'}
 class="px-3 py-1.5 rounded-xl font-bold whitespace-nowrap transition-colors {activeExamCategory === 'all' ? 'bg-brand-600 text-white shadow-xs' : 'bg-surface-1 text-ink-500 hover:bg-line'}"
 >
 Tất Cả Chứng Chỉ
 </button>
 <button
 onclick={() => activeExamCategory = 'ielts'}
 class="px-3 py-1.5 rounded-xl font-bold whitespace-nowrap transition-colors {activeExamCategory === 'ielts' ? 'bg-brand-600 text-white shadow-xs' : 'bg-surface-1 text-ink-500 hover:bg-line'}"
 >
 🌍 IELTS Academic (4 Kỹ Năng)
 </button>
 <button
 onclick={() => activeExamCategory = 'toeic'}
 class="px-3 py-1.5 rounded-xl font-bold whitespace-nowrap transition-colors {activeExamCategory === 'toeic' ? 'bg-brand-600 text-white shadow-xs' : 'bg-surface-1 text-ink-500 hover:bg-line'}"
 >
 💼 TOEIC Listening &amp; Reading
 </button>
 <button
 onclick={() => activeExamCategory = 'toefl'}
 class="px-3 py-1.5 rounded-xl font-bold whitespace-nowrap transition-colors {activeExamCategory === 'toefl' ? 'bg-brand-600 text-white shadow-xs' : 'bg-surface-1 text-ink-500 hover:bg-line'}"
 >
 🎓 TOEFL iBT Quốc Tế
 </button>
 </div>
 {:else if activeExamGroup === 'periodic'}
 <div class="pt-3 border-t border-line flex items-center gap-2 overflow-x-auto pb-1 text-xs">
 <span class="text-ink-500 font-bold uppercase text-[10px] whitespace-nowrap">Thời lượng con:</span>
 <button
 onclick={() => activeExamCategory = 'all'}
 class="px-3 py-1.5 rounded-xl font-bold whitespace-nowrap transition-colors {activeExamCategory === 'all' ? 'bg-brand-600 text-white shadow-xs' : 'bg-surface-1 text-ink-500 hover:bg-line'}"
 >
 Tất Cả Định Dạng
 </button>
 <button
 onclick={() => activeExamCategory = 'quick_5m'}
 class="px-3 py-1.5 rounded-xl font-bold whitespace-nowrap transition-colors {activeExamCategory === 'quick_5m' ? 'bg-brand-600 text-white shadow-xs' : 'bg-surface-1 text-ink-500 hover:bg-line'}"
 >
 ⚡ Đề 5 Phút (Khởi Động)
 </button>
 <button
 onclick={() => activeExamCategory = 'quick_15m'}
 class="px-3 py-1.5 rounded-xl font-bold whitespace-nowrap transition-colors {activeExamCategory === 'quick_15m' ? 'bg-brand-600 text-white shadow-xs' : 'bg-surface-1 text-ink-500 hover:bg-line'}"
 >
 ⏱️ Đề 15 Phút (Thường Xuyên)
 </button>
 <button
 onclick={() => activeExamCategory = 'standard_45m'}
 class="px-3 py-1.5 rounded-xl font-bold whitespace-nowrap transition-colors {activeExamCategory === 'standard_45m' ? 'bg-brand-600 text-white shadow-xs' : 'bg-surface-1 text-ink-500 hover:bg-line'}"
 >
 📝 Đề 45 Phút (1 Tiết Chuẩn)
 </button>
 </div>
 {/if}
 </div>

 <!-- RANDOM EXAM GENERATOR INTERACTIVE PANEL -->
 {#if activeExamGroup === 'random_builder'}
 <div class="rounded-2xl bg-gradient-to-br from-slate-950 via-slate-900 to-indigo-950/60 border border-amber-500/40 p-5 md:p-6 shadow-2xl space-y-5 animate-in fade-in duration-200">
 <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-800 pb-3">
 <div class="space-y-1">
 <div class="text-xs font-black text-amber-400 uppercase tracking-wider flex items-center gap-2">
 <span class="text-lg">🎲</span>
 <span>BỘ TẠO ĐỀ THI TRẮC NGHIỆM NGẪU NHIÊN THEO THỜI LƯỢNG (DYNAMIC TEST BUILDER)</span>
 </div>
 <p class="text-xs text-ink-500">
 Hệ thống xáo trộn ngẫu nhiên từ kho <strong>{data.allQuestions?.length || 573} câu hỏi</strong> chuẩn GDPT 2018 &amp; Cambridge. Mỗi lần tạo là một đề thi hoàn toàn mới!
 </p>
 </div>
 {#if randomSuccessNotice}
 <div class="px-3 py-1.5 rounded-xl bg-emerald-500/20 text-emerald-300 font-bold text-xs border border-emerald-500/30 animate-pulse">
 {randomSuccessNotice}
 </div>
 {/if}
 </div>

 <div class="grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs">
 <!-- 1. Duration Choice -->
 <div class="space-y-2">
 <span class="block font-bold text-slate-300">1. Thời Lượng Làm Bài:</span>
 <div class="grid grid-cols-2 sm:grid-cols-4 gap-1.5">
 <button
 type="button"
 onclick={() => randomDuration = 5}
 class="py-2 px-1.5 rounded-xl font-bold text-xs text-center border transition-all {randomDuration === 5 ? 'bg-amber-500 text-ink-900 border-amber-400 shadow-md shadow-amber-500/30 font-black' : 'bg-slate-900 border-slate-800 text-slate-300 hover:border-slate-700'}"
 >
 <div>⚡ 5 Phút</div>
 <div class="text-[10px] opacity-80 font-normal">5 câu</div>
 </button>
 <button
 type="button"
 onclick={() => randomDuration = 15}
 class="py-2 px-1.5 rounded-xl font-bold text-xs text-center border transition-all {randomDuration === 15 ? 'bg-indigo-600 text-white border-indigo-400 shadow-md shadow-indigo-600/30 font-black' : 'bg-slate-900 border-slate-800 text-slate-300 hover:border-slate-700'}"
 >
 <div>⏱️ 15 Phút</div>
 <div class="text-[10px] opacity-80 font-normal">15 câu</div>
 </button>
 <button
 type="button"
 onclick={() => randomDuration = 45}
 class="py-2 px-1.5 rounded-xl font-bold text-xs text-center border transition-all {randomDuration === 45 ? 'bg-emerald-600 text-white border-emerald-400 shadow-md shadow-emerald-600/30 font-black' : 'bg-slate-900 border-slate-800 text-slate-300 hover:border-slate-700'}"
 >
 <div>📝 45 Phút</div>
 <div class="text-[10px] opacity-80 font-normal">30 câu</div>
 </button>
 <button
 type="button"
 onclick={() => randomDuration = 50}
 class="py-2 px-1.5 rounded-xl font-bold text-xs text-center border transition-all {randomDuration === 50 ? 'bg-rose-600 text-white border-rose-400 shadow-md shadow-rose-600/30 font-black ring-1 ring-rose-400' : 'bg-slate-900 border-slate-800 text-slate-300 hover:border-slate-700'}"
 >
 <div>🎯 50 Phút</div>
 <div class="text-[10px] opacity-80 font-normal">40 câu (2025)</div>
 </button>
 </div>
 </div>

 <!-- 2. Grade Choice -->
 <div class="space-y-2">
 <label class="block font-bold text-slate-300" for="rand-grade">2. Khối Lớp / Hệ Học:</label>
 <select
 id="rand-grade"
 bind:value={randomGrade}
 class="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2.5 text-white font-bold focus:outline-none focus:border-amber-400"
 >
 <optgroup label="🌱 Cấp 2 (THCS)">
 <option value={7}>Lớp 7 (Global Success &amp; KET A2)</option>
 <option value={6}>Lớp 6 (Friends Plus &amp; A1)</option>
 <option value={8}>Lớp 8 (THCS &amp; PET B1)</option>
 <option value={9}>Lớp 9 (Luyện Thi Vào 10 Chuyên)</option>
 </optgroup>
 <optgroup label="🎒 Cấp 1 (Tiểu Học)">
 <option value={1}>Lớp 1 (Phonics Starters)</option>
 <option value={2}>Lớp 2 (Starters A1)</option>
 <option value={3}>Lớp 3 (Movers A1)</option>
 <option value={4}>Lớp 4 (Movers A1+)</option>
 <option value={5}>Lớp 5 (Flyers A2)</option>
 </optgroup>
 <optgroup label="🏢 Cấp 3 (THPT)">
 <option value={10}>Lớp 10 (Global Success B1)</option>
 <option value={11}>Lớp 11 (B1+ &amp; ASEAN)</option>
 <option value={12}>Lớp 12 (Tốt Nghiệp THPT QG)</option>
 </optgroup>
 <optgroup label="🌍 Chứng Chỉ Quốc Tế">
 <option value={0}>IELTS Academic &amp; Cambridge KET/PET</option>
 </optgroup>
 </select>
 </div>

 <!-- 3. Skill Choice -->
 <div class="space-y-2">
 <label class="block font-bold text-slate-300" for="rand-skill">3. Trọng Tâm Kỹ Năng:</label>
 <select
 id="rand-skill"
 bind:value={randomSkill}
 class="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2.5 text-white font-medium focus:outline-none focus:border-amber-400"
 >
 <option value="all">🌟 Tổng Hợp Toàn Diện (Mixed Skills)</option>
 <option value="grammar">📐 Ngữ Pháp Cú Pháp (Grammar Focus)</option>
 <option value="vocabulary">🔤 Từ Vựng &amp; Cụm Từ (Vocabulary)</option>
 <option value="phonics">🔊 Ngữ Âm &amp; Phát Âm (Phonics &amp; IPA)</option>
 <option value="reading">📖 Đọc Hiểu &amp; Biển Báo (Reading)</option>
 </select>
 </div>
 </div>

 <!-- Action Button -->
 <div class="flex flex-col sm:flex-row items-center justify-between gap-3 pt-2">
 <div class="text-xs text-ink-500 flex items-center gap-2">
 <span class="w-2 h-2 rounded-full bg-amber-400 animate-ping"></span>
 <span>Sinh đề ngẫu nhiên chuẩn ma trận nhận thức D1 (Nhận biết • Thông hiểu • Vận dụng).</span>
 </div>

 <button
 id="start-random-exam-btn"
 data-testid="start-random-exam-btn"
 type="button"
 onclick={generateRandomExam}
 disabled={isGeneratingRandom}
 class="w-full sm:w-auto px-6 py-3 rounded-xl bg-gradient-to-r from-amber-500 via-rose-500 to-indigo-600 hover:from-amber-400 hover:to-indigo-500 text-white font-black text-sm shadow-xl shadow-rose-600/30 flex items-center justify-center gap-2 transition-all hover:scale-105 disabled:opacity-50"
 >
 {#if isGeneratingRandom}
 <span class="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></span>
 <span>Đang Lấy Mẫu Ngẫu Nhiên Từ D1...</span>
 {:else}
 <span>🚀 Bắt Đầu Làm Đề Ngẫu Nhiên {randomDuration} Phút</span>
 {/if}
 </button>
 </div>
 </div>
 {/if}

 <!-- Quick Random Banner for other tabs -->
 {#if activeExamCategory !== 'random_builder'}
 <div class="p-3 rounded-2xl bg-amber-500/10 border border-amber-500/30 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 text-xs">
 <div class="flex items-center gap-2 text-slate-300">
 <span class="text-base">🎲</span>
 <span>Cần bài tập nhanh không trùng lặp? Hãy thử <strong>Bộ Tạo Đề Ngẫu Nhiên 5p • 15p • 45p</strong> từ kho 573 câu hỏi!</span>
 </div>
 <button
 type="button"
 onclick={() => activeExamCategory = 'random_builder'}
 class="px-3.5 py-1.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-ink-900 font-black text-xs whitespace-nowrap self-start sm:self-auto shadow-sm"
 >
 🎲 Mở Bộ Tạo Đề
 </button>
 </div>
 {/if}

 <!-- Exam Cards Grid -->
 <div class="grid grid-cols-1 min-[380px]:grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2.5">
 {#each filteredExams as ex}
 {@const isEnrolled = isExamEnrolledForUser(currentUser, ex)}
 {@const isSelected = selectedExamId === ex.id}
 {@const is5m = ex.format_type === 'quick_5m' || ex.duration_minutes === 5}
 {@const is15m = ex.format_type === 'quick_15m' || ex.duration_minutes === 15}
 {@const is45m = ex.format_type === 'standard_45m' || ex.duration_minutes === 45}
 <div
 class="p-3.5 rounded-2xl border text-left transition-all duration-200 hover-lift flex flex-col justify-between {isSelected ? 'bg-gradient-to-br from-brand-600 to-brand-700 border-brand-200 text-white shadow-lg shadow-brand-600/25 ring-2 ring-brand-200/80 font-semibold' : (isEnrolled ? 'bg-surface-0/90 border-brand-50 text-ink-900 hover:border-brand-200 hover:shadow-md' : 'bg-surface-1 border-line text-ink-500 hover:border-slate-400')}"
 >
 <button onclick={() => handleSelectExam(ex)} class="text-left flex-1">
 <div>
 <div class="flex items-center justify-between text-[10px] font-bold uppercase mb-1.5">
 <span class="{isSelected ? 'text-brand-200' : (isEnrolled ? (is5m ? 'text-amber-500 font-extrabold' : (is15m ? 'text-brand-600 font-extrabold' : 'text-brand-600 font-extrabold')) : 'text-ink-500 font-semibold')}">
 {#if !isEnrolled}🔒 {/if}
 {is5m ? '⚡ 5 Phút' : (is15m ? '⏱️ 15 Phút' : (is45m ? '📝 45 Phút' : (ex.format_type === 'ielts_academic' ? '🌍 IELTS' : (ex.format_type === 'toeic_lr' ? '💼 TOEIC' : (ex.format_type === 'toefl_ibt' ? '🎓 TOEFL' : '📜 Thi Đánh Giá')))))}
 </span>
 {#if !isEnrolled}
 <span class="text-[9px] px-1.5 py-0.5 rounded-full bg-amber-500/10 text-amber-600 font-bold border border-amber-500/20">Khóa</span>
 {:else}
 <span class="opacity-80 font-mono text-[10px] px-1.5 py-0.2 rounded-md bg-surface-1 text-ink-500">{ex.duration_minutes}'</span>
 {/if}
 </div>
 <div class="font-bold text-xs line-clamp-2 leading-snug">{ex.title}</div>
 </div>
 <div class="mt-2.5 pt-2 border-t border-line text-[10px] opacity-75 flex items-center justify-between">
 <span>{ex.total_questions} câu</span>
 <span class="uppercase font-semibold">{ex.skill_category}</span>
 </div>
 </button>
 {#if true}
 <button
 onclick={(e) => { e.stopPropagation(); handleSelectExam(ex); setTimeout(() => startExam(), 100); }}
 class="mt-2 w-full py-2.5 rounded-xl {isEnrolled ? 'bg-brand-600 hover:bg-brand-500' : 'bg-amber-500 hover:bg-amber-400'} text-white font-bold text-xs shadow transition-all hover:scale-[1.02] active:scale-95"
 >
 {isEnrolled ? '🚀 Thi Thử Ngay' : '🔒 Thi Thử Ngay'}
 </button>
 {/if}
 </div>
 {/each}
 </div>

 <!-- EXAM POPUP MODAL: phòng thi cô lập full-screen (PWA-safe).
 Chỉ thoát khi nộp bài (xem kết quả -> Đóng) hoặc bấm Bỏ Test. -->
 {#if isExamPopupOpen}
 <div class="fixed inset-0 z-[100] overflow-y-auto bg-slate-950/95 backdrop-blur-sm animate-in fade-in duration-150" role="dialog" aria-modal="true" aria-label="Phòng thi" style="padding-top: env(safe-area-inset-top, 0px); padding-bottom: env(safe-area-inset-bottom, 0px);">
 <div class="min-h-full w-full max-w-5xl mx-auto px-3 py-3 sm:px-6 sm:py-6" style="padding-top: calc(12px + env(safe-area-inset-top, 0px));">
 <!-- Popup top bar: tiêu đề + đồng hồ + nút thoát -->
 <div class="sticky top-0 z-10 mb-3 flex items-center justify-between gap-3 p-3 rounded-2xl bg-slate-900/95 border border-slate-700 shadow-xl backdrop-blur">
 <div class="flex items-center gap-2 min-w-0">
 <span class="text-xl shrink-0">📝</span>
 <div class="min-w-0">
 <div class="text-sm font-black text-white truncate">{currentExam?.title || 'Phòng thi'}</div>
 {#if isStarted && !isSubmitted}
 <div class="text-xs font-mono font-bold text-amber-300">⏱️ {formatTime(timeLeftSeconds)}</div>
 {/if}
 </div>
 </div>
 {#if !isSubmitted}
 <button
 type="button"
 onclick={abandonExam}
 class="shrink-0 px-4 py-2 rounded-xl {abandonConfirming ? 'bg-rose-600 border-rose-500 text-white' : 'bg-slate-800 hover:bg-rose-600 border-slate-700 text-slate-300 hover:text-white'} border font-bold text-xs transition-all"
 >
 {abandonConfirming ? '⚠️ Chắc chắn bỏ?' : '✕ Bỏ Test'}
 </button>
 {:else}
 <button
 type="button"
 onclick={closeExamPopup}
 class="shrink-0 px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs transition-all shadow-lg shadow-emerald-600/30"
 >
 ✓ Đóng
 </button>
 {/if}
 </div>

 <!-- Active Exam Details & Status Header -->
 <div class="rounded-3xl bg-surface-0 border border-line p-5 sm:p-6 shadow-xl flex flex-col md:flex-row items-start md:items-center justify-between gap-6 min-w-0 max-w-full">
 <div class="space-y-1 min-w-0 max-w-full">
 <div class="flex items-center gap-2">
 <span class="px-2.5 py-0.5 rounded-full text-xs font-bold bg-brand-50 text-brand-700 border border-brand-200 uppercase">
 {currentExam.format_type}
 </span>
 <span class="text-xs text-ink-500">Giáo viên ra đề: <strong class="text-ink-500">{currentExam.created_by}</strong></span>
 </div>
 <h1 class="text-xl md:text-2xl font-heading font-semibold text-ink-900">{currentExam.title}</h1>
 <p class="text-xs text-ink-500 max-w-2xl">{currentExam.description}</p>
 </div>

 <!-- Timer & Main Action -->
 <div class="flex flex-col sm:flex-row items-center gap-3 w-full sm:w-auto">
 <div class="text-center bg-surface-1 px-5 py-3 rounded-2xl border border-line shadow-inner w-full sm:w-auto">
 <div class="text-[10px] font-bold text-ink-500 uppercase tracking-wider">Thời Gian Còn Lại</div>
 <div class="text-2xl font-black font-mono {timeLeftSeconds < 300 ? 'text-rose-500 animate-pulse' : 'text-brand-600'}">
 {formatTime(timeLeftSeconds)}
 </div>
 </div>

 {#if !isStarted}
 <button
 onclick={startExam}
 class="w-full sm:w-auto px-6 py-3.5 rounded-2xl bg-brand-600 hover:bg-brand-500 text-white font-bold text-sm shadow-xl shadow-brand-600/30 transition-all hover:scale-105"
 >
 🚀 Bắt Đầu Làm Bài
 </button>
 {:else if !isSubmitted}
 <div class="flex flex-col items-end gap-2">
 {#if submitError}
 <div class="p-3 bg-rose-950/90 border border-rose-500 rounded-xl text-rose-300 text-xs flex items-center justify-between gap-3 max-w-md">
 <span>⚠️ {submitError}</span>
 <button
 onclick={submitExam}
 disabled={isSubmitting}
 class="px-3 py-1.5 bg-rose-600 hover:bg-rose-500 text-white rounded font-bold text-xs shrink-0 shadow"
 >
 {isSubmitting ? 'Đang gửi...' : 'Thử Nộp Lại'}
 </button>
 </div>
 {/if}
 <button
 onclick={submitExam}
 disabled={isSubmitting}
 class="px-6 py-3.5 rounded-2xl bg-gradient-to-r from-rose-600 to-red-600 hover:from-rose-500 hover:to-red-500 text-white font-bold text-sm shadow-xl shadow-rose-600/30 transition-all hover:scale-105 disabled:opacity-50"
 >
 {isSubmitting ? '⏳ Đang Nộp & Lưu D1...' : '🏁 Nộp Bài & Chấm Điểm'}
 </button>
 </div>
 {:else}
 <button
 onclick={startExam}
 class="px-5 py-3 rounded-2xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs"
 >
 🔄 Làm Lại Đề Này
 </button>
 {/if}
 </div>
 </div>

 <!-- RESULT CARD BANNER (After submission) -->
 {#if isSubmitted}
 <div id="exam-result-banner" class="p-6 md:p-8 rounded-3xl bg-slate-900 border border-slate-800 shadow-2xl space-y-4 animate-in zoom-in-95 duration-200">
 <div class="flex flex-col sm:flex-row items-center justify-between gap-4 border-b border-slate-800 pb-4">
 <div>
 <span class="text-xs font-bold text-emerald-400 uppercase tracking-wider">KẾT QUẢ ĐÁNH GIÁ LỘ TRÌNH CHÍNH THỨC</span>
 <h2 class="text-2xl font-black text-white mt-1">Thí Sinh: {studentName}</h2>
 <div class="text-xs text-ink-500 mt-0.5">Thời gian hoàn thành: {Math.floor(((currentExam.duration_minutes * 60) - timeLeftSeconds) / 60)} phút {((currentExam.duration_minutes * 60) - timeLeftSeconds) % 60} giây</div>
 </div>

 <div class="flex flex-wrap items-center gap-3">
 <div class="text-center p-3 rounded-2xl bg-slate-950 border border-indigo-500/30 min-w-[130px] shadow-lg">
 <div class="text-[10px] text-ink-500 font-bold uppercase tracking-wider">{formattedResultBadge.scaleName}</div>
 <div class="text-2xl font-black {formattedResultBadge.badgeColor}">
 {formattedResultBadge.value}
 </div>
 <div class="text-[10px] font-semibold text-ink-500 mt-0.5">{formattedResultBadge.sub}</div>
 </div>
 <div class="text-center p-3 rounded-2xl bg-slate-950 border border-slate-800 min-w-[80px]">
 <div class="text-[10px] text-ink-500 font-bold uppercase">Hệ 10</div>
 <div class="text-2xl font-black {parseFloat(calculatedScore) >= 7.0 ? 'text-emerald-400' : 'text-amber-400'}">
 {calculatedScore}
 </div>
 </div>
 <div class="text-center p-3 rounded-2xl bg-slate-950 border border-slate-800 min-w-[80px]">
 <div class="text-[10px] text-ink-500 font-bold uppercase">Số Câu Đúng</div>
 <div class="text-2xl font-black text-indigo-400">
 {correctCount}/{activeQuestions.length}
 </div>
 </div>
 </div>
 </div>

 <div class="text-xs text-slate-300 bg-slate-950 p-4 rounded-2xl border border-slate-800 flex flex-col sm:flex-row items-center justify-between gap-3">
 <div class="flex items-center gap-2">
 <span>✅ Kết quả bài thi của thí sinh <strong>{studentName}</strong> đã được lưu vào hệ thống Cloudflare D1.</span>
 {#if earnedStars > 0}
 <span class="px-2.5 py-1 rounded-xl bg-amber-500/20 text-amber-300 font-bold border border-amber-500/30 flex items-center gap-1">
 ⭐ Thưởng +{earnedStars} Sao
 </span>
 {/if}
 </div>
 <div class="flex items-center gap-3">
 <a href="/evaluations" class="text-indigo-400 font-bold hover:underline">Chuyển sang Đánh giá học viên ➔</a>
 <a href="/tuition" class="text-emerald-400 font-bold hover:underline">Xem trừ học phí sao ➔</a>
 </div>
 </div>
 </div>
 {/if}

 <!-- MAIN EXAM PLAYER BODY -->
 {#if !isStarted && !isSubmitted}
 <!-- Instructions Screen -->
 <div class="p-8 rounded-3xl bg-slate-900 border border-slate-800 text-center space-y-4">
 <div class="text-5xl">📝</div>
 <h2 class="text-xl font-bold text-white">Bạn Đã Sẵn Sàng Làm Bài?</h2>
 <p class="text-xs text-ink-500 max-w-lg mx-auto leading-relaxed">
 Bài thi gồm {activeQuestions.length} câu hỏi. Thời gian làm bài là {currentExam.duration_minutes} phút.
 Đồng hồ sẽ bắt đầu đếm ngược ngay khi bạn bấm nút bên dưới.
 </p>
 <button
 onclick={startExam}
 class="px-8 py-3.5 rounded-2xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-sm shadow-xl shadow-indigo-600/30 transition-all hover:scale-105"
 >
 Bắt Đầu Ngay
 </button>
 </div>
 {:else}
 <!-- MODULE: IELTS WRITING TASK 2 -->
 {#if currentExam.skill_category === 'writing'}
 <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
 <!-- Left: Prompt & Criteria -->
 <div class="rounded-3xl bg-slate-900 border border-slate-800 p-6 space-y-4">
 <div class="flex items-center justify-between border-b border-slate-800 pb-3">
 <span class="text-xs font-bold text-purple-400">WRITING TASK 2 PROMPT</span>
 <span class="text-xs font-bold text-ink-500">Yêu cầu tối thiểu: 250 từ</span>
 </div>

 <div class="p-4 rounded-2xl bg-slate-950 border border-slate-800 text-xs text-slate-200 leading-relaxed font-sans whitespace-pre-line">
 {activeQuestions[0]?.prompt || 'Viết một bài luận học thuật thảo luận về tác động của Trí Tuệ Nhân Tạo đối với giáo dục phổ thông.'}
 </div>

 <!-- Criteria Rubric Preview -->
 <div class="p-4 rounded-2xl bg-purple-950/20 border border-purple-500/20 space-y-2 text-xs">
 <div class="font-bold text-purple-300">4 Tiêu Chí Chấm Điểm Chuẩn Cambridge IELTS:</div>
 <ul class="list-disc pl-4 space-y-1 text-slate-300 text-[11px]">
 <li><strong>Task Response (25%):</strong> Trả lời trọn vẹn cả 2 quan điểm và nêu lập trường cá nhân xuyên suốt.</li>
 <li><strong>Coherence &amp; Cohesion (25%):</strong> Bố cục 4 đoạn mạch lạc, liên kết câu tự nhiên.</li>
 <li><strong>Lexical Resource (25%):</strong> Sử dụng linh hoạt vốn từ vựng học thuật B2-C1.</li>
 <li><strong>Grammatical Range &amp; Accuracy (25%):</strong> Đa dạng cấu trúc câu phức, câu điều kiện, câu bị động.</li>
 </ul>
 </div>
 </div>

 <!-- Right: Essay Editor -->
 <div class="rounded-3xl bg-slate-900 border border-slate-800 p-6 space-y-4 flex flex-col justify-between">
 <div class="flex items-center justify-between border-b border-slate-800 pb-3">
 <span class="text-xs font-bold text-slate-300">KHUNG BÀI LÀM CỦA THÍ SINH</span>
 <div class="flex items-center gap-2">
 <span class="text-xs font-mono font-bold {essayWordCount >= 250 ? 'text-emerald-400' : 'text-amber-400'}">
 {essayWordCount} từ {essayWordCount >= 250 ? '✓ Đạt chuẩn' : '(Cần thêm ' + (250 - essayWordCount) + ' từ)'}
 </span>
 </div>
 </div>

 <textarea
 bind:value={essayText}
 disabled={isSubmitted}
 rows="16"
 placeholder="Type your essay here in English... (Live word counter is enabled)"
 class="w-full flex-1 bg-slate-950 border border-slate-800 rounded-2xl p-4 text-xs font-sans text-slate-100 placeholder-slate-500 focus:outline-none focus:border-purple-500 leading-relaxed resize-none"
 ></textarea>

 <div class="flex justify-between items-center text-xs text-ink-500 pt-2">
 <span>Hệ thống tự động lưu từng ký tự</span>
 {#if !isSubmitted}
 <button
 onclick={submitExam}
 class="px-5 py-2 rounded-xl bg-purple-600 hover:bg-purple-500 text-white font-bold"
 >
 Nộp Bài Luận
 </button>
 {/if}
 </div>
 </div>
 </div>

 <!-- MODULE: IELTS SPEAKING MOCK -->
 {:else if currentExam.skill_category === 'speaking'}
 <div class="rounded-3xl bg-slate-900 border border-slate-800 p-8 max-w-3xl mx-auto space-y-6 text-center">
 <div class="space-y-2">
 <span class="text-xs font-bold text-rose-400 uppercase tracking-wider">IELTS SPEAKING PART 2 &amp; CUE CARD</span>
 <h2 class="text-xl font-black text-white">Luyện Thi Nói Trực Tiếp Với Microphone</h2>
 </div>

 <!-- Cue Card Box -->
 <div class="p-6 rounded-2xl bg-slate-950 border border-slate-800 text-left text-xs leading-relaxed text-slate-200 whitespace-pre-line">
 {activeQuestions[0]?.prompt || 'Describe a skill you learned that you found extremely useful.'}
 </div>

 <!-- Audio Recorder Controls -->
 <div class="p-6 rounded-2xl bg-slate-950 border border-slate-800 flex flex-col items-center gap-4">
 <div class="flex items-center gap-4">
 {#if !isRecording}
 <button
 onclick={startRecording}
 class="px-6 py-3 rounded-2xl bg-rose-600 hover:bg-rose-500 text-white font-bold text-xs flex items-center gap-2 shadow-lg shadow-rose-600/30 transition-all hover:scale-105"
 >
 <span>🎙️ Bắt Đầu Thu Âm Giọng Nói</span>
 </button>
 {:else}
 <button
 onclick={stopRecording}
 class="px-6 py-3 rounded-2xl bg-amber-600 hover:bg-amber-500 text-white font-bold text-xs flex items-center gap-2 animate-pulse"
 >
 <span>⏹️ Dừng Thu &amp; Phân Tích</span>
 </button>
 {/if}

 <button
 onclick={() => speakWord(activeQuestions[0]?.prompt?.split('\n')[0] || 'Describe a skill you learned')}
 class="px-4 py-3 rounded-2xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold flex items-center gap-2"
 >
 <span>🔊 Nghe Đề Bản Ngữ</span>
 </button>
 </div>

 {#if recordedAudioUrl}
 <div class="w-full max-w-md pt-2">
 <div class="text-[11px] text-emerald-400 font-bold mb-1">Bản Ghi Âm Của Bạn:</div>
 <audio controls src={recordedAudioUrl} class="w-full"></audio>
 </div>
 {/if}
 </div>
 </div>

 <!-- MODULE: STANDARD MULTIPLE CHOICE / READING / QUICK 15M / 45M (2-COLUMN EXAM HALL) -->
 {:else}
 <div class="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
 <!-- Main Column: Questions List (8 Cols) -->
 <div class="lg:col-span-8 space-y-6">
 {#each activeQuestions as q, idx}
 {@const parsedOptions = (() => {
 if (!q.options_json) return [];
 try {
 const arr = typeof q.options_json === 'string' ? JSON.parse(q.options_json) : q.options_json;
 return (arr || []).map((o, oIdx) => {
 if (typeof o === 'string') return o;
 if (o && typeof o === 'object') {
 if (o.label) return o.label;
 const letter = o.id || String.fromCharCode(65 + oIdx);
 const text = o.text || o.content || '';
 return `${letter}. ${text}`;
 }
 return String(o);
 });
 } catch {
 return [];
 }
 })()}
 {@const isCorrect = isSubmitted && userAnswers[idx]?.trim().toUpperCase() === q.correct_answer?.trim().toUpperCase()}
 {@const isWrong = isSubmitted && userAnswers[idx] && !isCorrect}

 <div id="q-{idx}" class="p-6 rounded-3xl bg-surface-0 border {isCorrect ? 'border-emerald-500 bg-emerald-50/20' : isWrong ? 'border-rose-500 bg-rose-50/20' : 'border-line shadow-sm'} space-y-4 transition-all scroll-mt-24">
 <!-- Header of Question -->
 <div class="flex items-center justify-between gap-3 text-xs">
 <div class="flex items-center gap-2">
 <span class="w-8 h-8 rounded-xl bg-brand-50 text-brand-700 font-bold flex items-center justify-center border border-brand-200">
 #{idx + 1}
 </span>
 <span class="font-bold text-ink-500 uppercase tracking-wider">{q.skill}</span>
 {#if q.cambridge_level}
 <span class="text-[10px] px-2 py-0.5 rounded-full bg-surface-1 text-brand-700 font-semibold border border-brand-200">
 {q.cambridge_level}
 </span>
 {/if}
 </div>

 {#if isSubmitted}
 <span class="font-bold {isCorrect ? 'text-emerald-600' : 'text-rose-600'}">
 {isCorrect ? '✓ Đúng (+1.0 điểm)' : '✕ Sai (Đáp án đúng: ' + q.correct_answer + ')'}
 </span>
 {/if}
 </div>

 <!-- Reading Passage if present -->
 {#if q.passage}
 <div class="p-4 rounded-2xl bg-surface-1 border border-line text-xs text-ink-500 leading-relaxed font-sans max-h-64 overflow-y-auto whitespace-pre-line">
 <strong class="text-brand-700 block mb-1">📖 Đoạn Văn Đọc Hiểu / Ngữ Cảnh:</strong>
 {q.passage}
 </div>
 {/if}

 <!-- Question Photo / Diagram (e.g. TOEIC Part 1) -->
 {#if q.image_url}
 <div class="my-3 text-center bg-surface-1 p-3 rounded-2xl border border-line">
 <img
 src={q.image_url}
 alt="Question Diagram or Scene"
 class="max-h-64 rounded-xl border border-line object-cover shadow-sm mx-auto"
 />
 <span class="text-[11px] text-ink-500 mt-2 block font-medium">📷 Hình ảnh ngữ cảnh bài thi</span>
 </div>
 {/if}

 <!-- Audio Listening Track -->
 {#if q.audio_url}
 <div class="my-2 p-3.5 rounded-2xl bg-brand-50 border border-brand-200 flex items-center justify-between gap-3 shadow-xs">
 <div class="flex items-center gap-2.5">
 <div class="w-9 h-9 rounded-xl bg-brand-600/10 text-brand-600 border border-brand-200 flex items-center justify-center text-lg">
 🎧
 </div>
 <div>
 <div class="text-xs font-bold text-brand-700">Listening Audio Track (Bản Nghe Đề Thi)</div>
 <div class="text-[10px] text-ink-500">Bấm nút để nghe đoạn audio / hội thoại của bài thi</div>
 </div>
 </div>
 <button
 type="button"
 onclick={() => playQuestionAudio(q.audio_url)}
 class="px-4 py-2 rounded-xl bg-brand-600 hover:bg-brand-500 text-white font-bold text-xs flex items-center gap-1.5 shadow-sm transition-all hover:scale-105 active:scale-95"
 >
 <span>🔊 Phát Audio</span>
 </button>
 </div>
 {/if}

 <!-- Question Prompt -->
 <div class="text-sm font-heading font-semibold text-ink-900 flex items-center justify-between gap-3">
 <span>{q.prompt}</span>
 <button
 onclick={() => speakWord(q.prompt)}
 class="text-xs p-2 rounded-lg bg-surface-1 text-ink-500 hover:text-brand-600 shrink-0 border border-line"
 title="Phát âm câu hỏi"
 >
 🔊
 </button>
 </div>

 <!-- Options Grid -->
 <div class="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-1">
 {#each parsedOptions as opt}
 {@const optLetter = opt.substring(0, 1).toUpperCase()}
 {@const isSelected = userAnswers[idx] === optLetter}
 {@const isThisCorrect = isSubmitted && q.correct_answer === optLetter}

 <button
 disabled={isSubmitted}
 onclick={() => selectOption(idx, optLetter)}
 class="p-3.5 rounded-2xl border text-left text-xs font-semibold transition-all {isThisCorrect ? 'bg-emerald-100 border-emerald-500 text-emerald-800 font-bold ring-2 ring-emerald-400' : isSelected && isWrong ? 'bg-rose-100 border-rose-500 text-rose-800 font-bold' : isSelected ? 'bg-brand-600 border-brand-600 text-white font-bold shadow-md ring-2 ring-brand-200' : 'bg-surface-1 border-line text-ink-900 hover:border-brand-200 hover:bg-brand-50'}"
 >
 {opt}
 </button>
 {/each}
 </div>

 <!-- Review Explanation (After submission) -->
 {#if isSubmitted && q.explanation}
 <div class="p-3.5 rounded-2xl bg-amber-50 border border-amber-200 text-xs text-amber-900 space-y-1">
 <strong class="text-amber-700 block font-bold">💡 Giải thích chi tiết:</strong>
 <div class="text-ink-500 font-sans">{q.explanation}</div>
 </div>
 {/if}
 </div>
 {/each}
 </div>

 <!-- Sticky Sidebar: Exam Room Navigation Palette (4 Cols) -->
 <div class="lg:col-span-4 sticky top-20 space-y-4">
 <div class="rounded-3xl bg-surface-0 border border-line p-5 shadow-lg space-y-4">
 <!-- Header of Sidebar -->
 <div class="flex items-center justify-between border-b border-line pb-3">
 <div class="text-xs font-bold text-brand-600 uppercase tracking-wider">
 📋 TIẾN ĐỘ PHÒNG THI
 </div>
 <div class="text-xs font-mono font-bold {timeLeftSeconds < 300 ? 'text-rose-500 animate-pulse' : 'text-brand-600'}">
 ⏱️ {formatTime(timeLeftSeconds)}
 </div>
 </div>

 <!-- Candidate summary -->
 <div class="p-3 rounded-2xl bg-surface-1 border border-line space-y-1 text-xs">
 <div class="flex items-center justify-between">
 <span class="text-ink-500">Thí sinh:</span>
 <span class="font-bold text-ink-900 truncate max-w-[140px]">{studentName}</span>
 </div>
 <div class="flex items-center justify-between">
 <span class="text-ink-500">Đã trả lời:</span>
 <span class="font-bold text-emerald-600">
 {Object.values(userAnswers).filter(a => !!a).length} / {activeQuestions.length} câu
 </span>
 </div>
 <!-- Progress Bar -->
 <div class="w-full bg-slate-200 rounded-full h-1.5 overflow-hidden mt-1.5">
 <div class="bg-brand-600 h-1.5 rounded-full transition-all duration-300" style="width: {(Object.values(userAnswers).filter(a => !!a).length / (activeQuestions.length || 1)) * 100}%"></div>
 </div>
 </div>

 <!-- Question Jump Matrix -->
 <div class="space-y-2">
 <div class="text-[11px] font-bold text-ink-500 uppercase">
 Ma trận câu hỏi (Bấm để nhảy đến):
 </div>
 <div class="grid grid-cols-5 gap-1.5 max-h-56 overflow-y-auto p-1">
 {#each activeQuestions as _, idx}
 {@const isAns = !!userAnswers[idx]}
 <button
 type="button"
 onclick={() => document.getElementById(`q-${idx}`)?.scrollIntoView({ behavior: 'smooth' })}
 class="h-8 rounded-lg text-xs font-bold transition-all flex items-center justify-center border {isAns ? 'bg-brand-600 text-white border-brand-600 shadow-xs' : 'bg-surface-1 text-ink-500 border-line hover:border-brand-200'}"
 >
 {idx + 1}
 </button>
 {/each}
 </div>
 </div>

 <!-- Submit CTA Button -->
 {#if !isSubmitted}
 <button
 onclick={submitExam}
 disabled={isSubmitting}
 class="w-full py-3 rounded-2xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-bold text-xs shadow-md shadow-emerald-600/25 transition-all hover:scale-[1.02] flex items-center justify-center gap-2 disabled:opacity-50"
 >
 <span>{isSubmitting ? '⏳ Đang nộp bài...' : '🏁 Nộp Bài & Chấm Điểm'}</span>
 </button>
 {/if}
 </div>
 </div>
 </div>
 {/if}
 {/if}
 </div><!-- /exam-popup-inner -->
 </div><!-- /exam-popup -->
 {/if}

 <!-- BATCH GRADING MODAL FOR ATTENDED STUDENTS -->
 {#if isBatchGradingOpen}
 <div class="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto animate-in fade-in duration-150">
 <div class="bg-slate-900 border border-emerald-500/30 rounded-3xl max-w-2xl w-full p-6 space-y-4 shadow-2xl my-8">
 <div class="flex items-center justify-between border-b border-slate-800 pb-3">
 <div>
 <div class="text-xs font-bold text-emerald-400 uppercase tracking-wider">CHẤM ĐIỂM HÀNG LOẠT THEO ĐIỂM DANH</div>
 <h2 class="text-lg font-black text-white mt-0.5">{currentExam.title}</h2>
 <div class="text-xs text-ink-500 mt-0.5">Lớp: {currentSession?.class_name} • Ngày: {selectedSessionDate} ({batchScores.length} học sinh có mặt)</div>
 </div>
 <button
 type="button"
 onclick={closeBatchGradingModal}
 class="w-8 h-8 rounded-full bg-slate-800 text-slate-400 hover:text-white flex items-center justify-center font-bold"
 >
 ✕
 </button>
 </div>

 {#if batchStatusMsg}
 <div class="p-3 rounded-2xl bg-emerald-950/60 border border-emerald-500 text-emerald-300 text-xs font-bold flex items-center gap-2">
 <span>{batchStatusMsg}</span>
 </div>
 {/if}

 <div class="max-h-96 overflow-y-auto space-y-2 pr-1">
 {#each batchScores as item, idx}
 <div class="p-3 rounded-2xl bg-slate-950 border border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
 <div class="flex items-center gap-3">
 <span class="w-6 h-6 rounded-lg bg-slate-800 text-emerald-400 font-bold text-xs flex items-center justify-center">
 #{idx + 1}
 </span>
 <div>
 <div class="text-xs font-bold text-white">{item.student_name}</div>
 <div class="text-[10px] text-ink-500">ID: {item.student_id}</div>
 </div>
 </div>

 <div class="flex items-center gap-2">
 <div class="flex items-center gap-1.5">
 <label class="text-[11px] font-bold text-ink-500" for="sc-{idx}">Điểm (0-10):</label>
 <input
 id="sc-{idx}"
 type="number"
 step="0.1"
 min="0"
 max="10"
 bind:value={item.score}
 class="w-16 bg-slate-900 border border-slate-700 rounded-xl px-2 py-1 text-center font-bold text-white text-xs focus:outline-none focus:border-emerald-500"
 />
 </div>

 <input
 type="text"
 bind:value={item.note}
 placeholder="Nhận xét bài thi..."
 class="flex-1 min-w-[140px] bg-slate-900 border border-slate-700 rounded-xl px-2.5 py-1 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-emerald-500"
 />
 </div>
 </div>
 {/each}
 {#if batchScores.length === 0}
 <div class="text-center py-6 text-ink-500 text-xs">
 Không có học sinh nào đủ điều kiện điểm danh trong buổi học này.
 </div>
 {/if}
 </div>

 <div class="flex items-center justify-between border-t border-slate-800 pt-3">
 <div class="text-[11px] text-ink-500">
 💡 Điểm từ 7.0 trở lên tự động cộng sao thưởng tích lũy (100 sao = 1.000 VNĐ trừ học phí)!
 </div>
 <div class="flex items-center gap-2">
 <button
 type="button"
 onclick={closeBatchGradingModal}
 class="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold text-xs"
 >
 Đóng
 </button>
 <button
 type="button"
 disabled={batchScores.length === 0}
 onclick={handleSaveBatchScores}
 class="px-5 py-2 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-bold text-xs shadow-lg shadow-emerald-600/30 flex items-center gap-1.5 disabled:opacity-50"
 >
 <span>💾 Lưu &amp; Báo Zalo Bot</span>
 </button>
 </div>
 </div>
 </div>
 </div>
 {/if}

 <!-- Guest Exam Modal -->
 <GuestExamModal bind:isOpen={showGuestModal} initialGrade={currentUser?.grade || ''} />
</div>
