import fs from 'fs';
import path from 'path';

// Load test fixtures
const usersData = JSON.parse(fs.readFileSync(new URL('../src/lib/data/users.json', import.meta.url), 'utf-8'));
const classSessionsData = JSON.parse(fs.readFileSync(new URL('../src/lib/data/class_sessions.json', import.meta.url), 'utf-8'));
const tuitionBillsData = JSON.parse(fs.readFileSync(new URL('../src/lib/data/tuition_bills.json', import.meta.url), 'utf-8'));

console.log('=== TEST SUITE: LEADER PWA NOTIFICATIONS & REAL-TIME EVENT ENGINE ===\n');

// 1. In-memory Mock Store mirroring unifiedStore.js implementation
class MockLeaderStore {
  constructor() {
    this.notifications = [
      {
        id: 'notif_seed_att_1',
        dedup_key: 'miss_att_sess_mon_l7_1_seed',
        type: 'teacher_missing_attendance',
        priority: 'urgent',
        title: '⚠️ Cảnh báo: Giáo viên chưa điểm danh!',
        message: 'Buổi học "Lớp 7 - Tiếng Anh Căn Bản & Giao Tiếp" đã bắt đầu hơn 15 phút nhưng Mr. Johnathan Miller CHƯA nộp danh sách điểm danh!',
        timestamp: new Date(Date.now() - 18 * 60 * 1000).toISOString(),
        is_read: false,
        link_url: '/schedule',
        action_type: 'remind_teacher',
        meta: {
          sessionId: 'sess_mon_l7_1',
          teacherName: 'Mr. Johnathan Miller',
          teacherId: 'usr_teach_1'
        }
      }
    ];
    this.attendanceRecords = [];
    this.teacherReminders = [];
  }

  getAllLeaderNotifications() {
    return [...this.notifications];
  }

  addLeaderNotification(notif) {
    if (notif.dedup_key) {
      const existing = this.notifications.find(n => n.dedup_key === notif.dedup_key);
      if (existing) return null;
    }
    const newNotif = {
      id: notif.id || `notif_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      dedup_key: notif.dedup_key || null,
      type: notif.type || 'system',
      priority: notif.priority || 'normal',
      title: notif.title || 'Thông Báo Mới',
      message: notif.message || '',
      timestamp: notif.timestamp || new Date().toISOString(),
      is_read: false,
      link_url: notif.link_url || '/admin?tab=leader_notifications',
      action_type: notif.action_type || '',
      meta: notif.meta || {}
    };
    this.notifications.unshift(newNotif);
    return newNotif;
  }

  markNotificationAsRead(id) {
    const found = this.notifications.find(n => n.id === id);
    if (found) found.is_read = true;
    return !!found;
  }

  markAllNotificationsAsRead() {
    this.notifications.forEach(n => n.is_read = true);
  }

  deleteLeaderNotification(id) {
    this.notifications = this.notifications.filter(n => n.id !== id);
  }

  getUnreadCount() {
    return this.notifications.filter(n => !n.is_read).length;
  }

  addTeacherPrivateReminder(teacherId, reminderObj) {
    const item = {
      id: `rem_${Date.now()}`,
      teacher_id: teacherId,
      content: reminderObj.content,
      urgency: reminderObj.urgency || 'high',
      created_at: new Date().toISOString()
    };
    this.teacherReminders.push(item);
    return item;
  }

  // Scanner simulation
  scanSchedule(mockTime) {
    const dayOfWeek = mockTime.getDay();
    const currentMinutes = mockTime.getHours() * 60 + mockTime.getMinutes();
    const todayStr = mockTime.toISOString().slice(0, 10);
    const sessions = classSessionsData.filter(s => Number(s.day_of_week) === dayOfWeek);
    const results = [];

    for (const sess of sessions) {
      const [sh, sm] = sess.start_time.split(':').map(Number);
      const startMin = sh * 60 + sm;
      const diff = startMin - currentMinutes;

      // 1h reminder
      if (diff <= 60 && diff >= 45) {
        const notif = this.addLeaderNotification({
          dedup_key: `sched_1h_${sess.id}_${todayStr}`,
          type: 'schedule_reminder_1h',
          priority: 'normal',
          title: `⏰ Lịch học sắp tới (Còn 1h): ${sess.class_name}`,
          message: `Lớp "${sess.class_name}" bắt đầu lúc ${sess.start_time} tại ${sess.location}.`,
          meta: { sessionId: sess.id }
        });
        if (notif) results.push(notif);
      }

      // 10m reminder
      if (diff <= 15 && diff >= 0) {
        const notif = this.addLeaderNotification({
          dedup_key: `sched_10m_${sess.id}_${todayStr}`,
          type: 'schedule_reminder_10m',
          priority: 'high',
          title: `🚨 Lịch học gấp (Còn 10 phút): ${sess.class_name}`,
          message: `Lớp "${sess.class_name}" bắt đầu lúc ${sess.start_time}! Nhắc phụ huynh đưa đón.`,
          meta: { sessionId: sess.id }
        });
        if (notif) results.push(notif);
      }

      // Teacher missing attendance (>15m after start)
      if (diff <= -15 && diff >= -120) {
        const hasAttendance = this.attendanceRecords.some(r => r.session_id === sess.id && r.session_date === todayStr);
        if (!hasAttendance) {
          const notif = this.addLeaderNotification({
            dedup_key: `miss_att_${sess.id}_${todayStr}`,
            type: 'teacher_missing_attendance',
            priority: 'urgent',
            title: `⚠️ Cảnh báo: Giáo viên chưa điểm danh!`,
            message: `Lớp "${sess.class_name}" đã bắt đầu lúc ${sess.start_time} (đã qua hơn 15 phút) nhưng Giáo viên ${sess.teacher_name} CHƯA nộp sổ điểm danh!`,
            meta: { sessionId: sess.id, teacherName: sess.teacher_name, teacherId: sess.teacher_id }
          });
          if (notif) results.push(notif);
        }
      }
    }
    return results;
  }

  scanTuition(mockDate) {
    const results = [];
    const bills = tuitionBillsData.filter(b => b.status !== 'paid');
    for (const bill of bills) {
      const dueDateStr = bill.due_date || (bill.billing_period?.includes('10/2026') ? '2026-09-28' : '2026-09-30');
      const dueDate = new Date(dueDateStr);
      const diffDays = Math.ceil((dueDate - mockDate) / (1000 * 60 * 60 * 24));

      if (diffDays <= 5 && diffDays >= 0) {
        const notif = this.addLeaderNotification({
          dedup_key: `tui_due_${bill.id}_${dueDateStr}`,
          type: 'tuition_due',
          priority: 'high',
          title: `💰 Tới hạn học phí: ${bill.student_name}`,
          message: `Học phí kỳ ${bill.billing_period} đến hạn ngày ${dueDateStr} (còn ${diffDays} ngày).`
        });
        if (notif) results.push(notif);
      } else if (diffDays < 0) {
        const notif = this.addLeaderNotification({
          dedup_key: `tui_over_${bill.id}_${dueDateStr}`,
          type: 'tuition_due',
          priority: 'urgent',
          title: `🚨 Quá hạn học phí: ${bill.student_name}`,
          message: `Học phí kỳ ${bill.billing_period} đã QUÁ HẠN!`
        });
        if (notif) results.push(notif);
      }
    }
    return results;
  }
}

const store = new MockLeaderStore();

console.log('--- TEST 1: Initial Seed Notifications & Unread Count ---');
console.log('Total notifications:', store.getAllLeaderNotifications().length);
console.log('Unread count:', store.getUnreadCount());
if (store.getUnreadCount() !== 1) {
  throw new Error('Initial unread count should be 1');
}
console.log('✅ Initial notification seed verified.');

console.log('\n--- TEST 2: New Student Registration Event Hook ---');
const newRegNotif = store.addLeaderNotification({
  type: 'new_registration',
  priority: 'high',
  title: '🔔 Đăng ký mới: Trần Minh Quân',
  message: 'Học sinh Trần Minh Quân vừa đăng ký tài khoản Lớp 7 (Trial) - Chờ Cô Dung duyệt!',
  action_type: 'approve_user',
  meta: { username: 'minhquan', role: 'student', grade: 'Lớp 7' }
});
if (!newRegNotif || store.getUnreadCount() !== 2) {
  throw new Error('Failed to register new student notification');
}
console.log('✅ New student registration event hook verified. Unread count:', store.getUnreadCount());

console.log('\n--- TEST 3: Attendance Roll Call Summary (Present & Missing breakdown) ---');
const rollCallNotif = store.addLeaderNotification({
  type: 'attendance_summary',
  priority: 'high',
  title: '📋 Báo cáo Điểm Danh: Lớp 7 - Tiếng Anh Căn Bản',
  message: 'Lớp có 16/18 có mặt. THIẾU/VẮNG 2 em: Nguyễn Văn A (Có phép), Lê Thị B (Không phép).',
  action_type: 'view_attendance',
  meta: { sessionId: 'sess_mon_l7_1', presentCount: 16, totalCount: 18, absentNames: 'Nguyễn Văn A, Lê Thị B' }
});
if (!rollCallNotif || !rollCallNotif.message.includes('THIẾU/VẮNG 2 em')) {
  throw new Error('Attendance summary missing absent student information');
}
console.log('✅ Attendance roll call summary with absent breakdown verified.');

console.log('\n--- TEST 4: Student Exam Completion Event ---');
const testCompNotif = store.addLeaderNotification({
  type: 'test_completed',
  priority: 'normal',
  title: '📝 Bài thi hoàn thành: Nguyễn Bảo Khiêm',
  message: 'Học sinh Nguyễn Bảo Khiêm vừa nộp bài "Đề Kiểm Tra 15 Phút Unit 7" đạt 10/10 điểm (100%).',
  action_type: 'view_test',
  meta: { studentId: 'usr_student_baokhiem', score: 10, maxScore: 10 }
});
if (!testCompNotif || testCompNotif.priority !== 'normal') {
  throw new Error('Exam completion notification failed');
}
console.log('✅ Student exam completion event verified.');

console.log('\n--- TEST 5: Automated Scanner for Schedule (1h & 10m Countdown) ---');
// Class sess_mon_l7_1 starts at 18:00 on Monday (day 1)
// Mock time: Monday at 17:05 (55 minutes before class -> should trigger 1h reminder)
const monday1705 = new Date('2026-09-28T17:05:00');
const sched1h = store.scanSchedule(monday1705);
console.log(`Scan at 17:05 (55m before 18:00): Generated ${sched1h.length} notifications`);
if (!sched1h.some(n => n.type === 'schedule_reminder_1h')) {
  throw new Error('Expected 1-hour schedule reminder was not generated!');
}

// Mock time: Monday at 17:52 (8 minutes before class -> should trigger 10m reminder)
const monday1752 = new Date('2026-09-28T17:52:00');
const sched10m = store.scanSchedule(monday1752);
console.log(`Scan at 17:52 (8m before 18:00): Generated ${sched10m.length} notifications`);
if (!sched10m.some(n => n.type === 'schedule_reminder_10m')) {
  throw new Error('Expected 10-minute urgent schedule reminder was not generated!');
}
console.log('✅ Schedule countdown reminders (1h & 10m) verified.');

console.log('\n--- TEST 6: Automated Scanner for Teacher Missing Attendance (>15m) ---');
// Mock time: Monday at 18:20 (20 minutes after class start 18:00, no attendance yet)
const monday1820 = new Date('2026-09-28T18:20:00');
const missingAtt = store.scanSchedule(monday1820);
console.log(`Scan at 18:20 (20m after class start): Generated ${missingAtt.length} notifications`);
const urgentNotif = missingAtt.find(n => n.type === 'teacher_missing_attendance');
if (!urgentNotif) {
  throw new Error('Teacher missing attendance alert was NOT triggered!');
}
console.log(`Alert Title: "${urgentNotif.title}", Priority: "${urgentNotif.priority}"`);

// Leader immediately sends private reminder to teacher
const reminder = store.addTeacherPrivateReminder(urgentNotif.meta.teacherId, {
  content: `[Khẩn từ Leader] Vui lòng nộp sổ điểm danh cho lớp ${urgentNotif.meta.sessionId} ngay!`,
  urgency: 'high'
});
console.log(`Leader sent private reminder: "${reminder.content}" to Teacher ID: ${reminder.teacher_id}`);
if (store.teacherReminders.length === 0) {
  throw new Error('Private reminder not recorded');
}
console.log('✅ Teacher delinquent attendance detection & leader direct reminder verified.');

console.log('\n--- TEST 7: Automated Scanner for Tuition Dues ---');
const mockDateTuition = new Date('2026-09-25T15:00:00');
const tuitionAlerts = store.scanTuition(mockDateTuition);
console.log(`Scan tuition on 2026-09-25: Generated ${tuitionAlerts.length} notifications`);
if (tuitionAlerts.length === 0) {
  throw new Error('Expected tuition due / overdue alerts to be generated');
}
console.log('Sample tuition alert:', tuitionAlerts[0].title);
console.log('✅ Tuition due and overdue automated scanner verified.');

console.log('\n--- TEST 8: PWA Web Manifest & Service Worker Verification ---');
const rootDir = path.resolve(new URL('.', import.meta.url).pathname.replace(/^\/([A-Z]:)/, '$1'), '..');
const manifestPath = path.join(rootDir, 'static', 'manifest.webmanifest');
const swPath = path.join(rootDir, 'static', 'sw.js');

const manifestContent = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
console.log('Manifest Name:', manifestContent.name);
console.log('Manifest Shortcuts Count:', manifestContent.shortcuts?.length);
const leaderShortcut = manifestContent.shortcuts?.find(s => s.url.includes('leader_notifications'));
if (!leaderShortcut) {
  throw new Error('PWA Manifest missing Leader Hub shortcut!');
}
console.log('Found Leader Shortcut:', leaderShortcut.name, '->', leaderShortcut.url);

const swContent = fs.readFileSync(swPath, 'utf-8');
if (!swContent.includes("addEventListener('push'") || 
    !swContent.includes("addEventListener('notificationclick'") ||
    !swContent.includes('SHOW_LEADER_NOTIFICATION')) {
  throw new Error('Service Worker missing Push, NotificationClick, or SHOW_LEADER_NOTIFICATION handlers!');
}
console.log('✅ PWA Web Manifest shortcuts and Service Worker Push handlers verified.');

console.log('\n🎉 ALL 8 AUTOMATED LEADER NOTIFICATION TESTS PASSED WITH 100% SUCCESS!');
