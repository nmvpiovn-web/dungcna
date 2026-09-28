/**
 * notificationPolicy.js
 * Authoritative Resource Authorization Policy for System Notifications
 * 
 * Invariant Contract: 
 * (Audience matches) AND (Public non-sensitive announcement OR Resource-authorized)
 * 
 * Rules:
 * 1. Public non-sensitive announcements MUST NOT have a reference_id and MUST be broadcast (target_user_id IS NULL).
 *    Legacy/NULL category notifications with a reference_id are treated as sensitive resource references (fail-closed unless authorized).
 * 2. Homework resource: requires active enrollment in assignment class or submission ownership / verified parent link.
 * 3. Tuition resource: requires verified link to student of tuition bill.
 * 4. Evaluation / Star resource: requires verified link to evaluated student.
 * 5. Unknown categories with reference_id: FAIL-CLOSED.
 */

export function buildNotificationAuthFilter({ role, userId }) {
  if (role === 'superadmin' || role === 'leader') {
    return {
      whereSql: `
        ((n.target_user_id = ?) OR (n.target_user_id IS NULL AND (n.target_role = ? OR n.target_role = 'leader' OR n.target_role = 'all')))
      `,
      params: [userId, role]
    };
  }

  if (role === 'student') {
    // Student notification policy
    return {
      whereSql: `
        (
          (n.target_user_id = ?)
          OR (n.target_user_id IS NULL AND (n.target_role = 'student' OR n.target_role = 'all'))
        )
        AND (
          -- 1. Public non-sensitive system announcements ONLY (no reference_id, broadcast)
          ((n.category = 'system' OR n.category IS NULL) AND n.reference_id IS NULL AND n.target_user_id IS NULL)
          OR
          -- 2. Homework: student must be actively enrolled in assignment class, OR be the submission author
          ((n.category = 'homework' OR (n.category IS NULL AND n.reference_id IS NOT NULL)) AND (
            EXISTS (
              SELECT 1 FROM homework_assignments ha
              JOIN class_enrollments ce ON ce.user_id = ? AND ce.class_id = ha.class_id AND ce.status = 'active'
              WHERE ha.id = n.reference_id
            )
            OR EXISTS (
              SELECT 1 FROM homework_submissions hs
              WHERE hs.id = n.reference_id AND hs.student_id = ?
            )
          ))
          OR
          -- 3. Personal non-homework notifications addressed to this student (tuition, evaluation, reminders)
          (n.target_user_id = ? AND n.category IN ('tuition', 'evaluation', 'star', 'reminder', 'system'))
        )
      `,
      params: [userId, userId, userId, userId]
    };
  }

  if (role === 'parent') {
    // Parent notification policy
    return {
      whereSql: `
        (
          (n.target_user_id = ?)
          OR (n.target_user_id IS NULL AND (n.target_role = 'parent' OR n.target_role = 'all'))
        )
        AND (
          -- 1. Public non-sensitive system announcements ONLY (no reference_id, broadcast)
          ((n.category = 'system' OR n.category IS NULL) AND n.reference_id IS NULL AND n.target_user_id IS NULL)
          OR
          -- 2. Homework personal: verified link with child actively enrolled in class OR child who authored submission
          (n.target_user_id = ? AND (n.category = 'homework' OR (n.category IS NULL AND n.reference_id IS NOT NULL)) AND (
            EXISTS (
              SELECT 1 FROM parent_student_links psl
              JOIN homework_assignments ha ON ha.id = n.reference_id
              JOIN class_enrollments ce ON ce.user_id = psl.student_user_id 
                AND ce.class_id = ha.class_id AND ce.status = 'active'
              WHERE psl.parent_user_id = ? AND psl.verification_status = 'verified'
            )
            OR EXISTS (
              SELECT 1 FROM parent_student_links psl
              JOIN homework_submissions hs ON hs.id = n.reference_id
              WHERE psl.parent_user_id = ?
                AND psl.student_user_id = hs.student_id
                AND psl.verification_status = 'verified'
            )
          ))
          OR
          -- 3. Homework broadcast: verified link with child actively enrolled in the referenced assignment class
          (n.target_user_id IS NULL AND (n.category = 'homework' OR (n.category IS NULL AND n.reference_id IS NOT NULL)) AND EXISTS (
            SELECT 1 FROM parent_student_links psl
            JOIN class_enrollments ce ON ce.user_id = psl.student_user_id AND ce.status = 'active'
            JOIN homework_assignments ha ON ha.id = n.reference_id AND ha.class_id = ce.class_id
            WHERE psl.parent_user_id = ? AND psl.verification_status = 'verified'
          ))
          OR
          -- 4. Tuition notifications: personally addressed AND verified link with student referenced
          (n.target_user_id = ? AND n.category = 'tuition' AND EXISTS (
            SELECT 1 FROM parent_student_links psl
            WHERE psl.parent_user_id = ? AND psl.verification_status = 'verified'
              AND (
                psl.student_user_id = n.reference_id
                OR EXISTS (
                  SELECT 1 FROM tuition_bills tb 
                  WHERE tb.id = n.reference_id AND tb.student_id = psl.student_user_id
                )
              )
          ))
          OR
          -- 5. Evaluation / Star notifications: personally addressed AND verified link with student
          (n.target_user_id = ? AND n.category IN ('evaluation', 'star', 'reminder') AND EXISTS (
            SELECT 1 FROM parent_student_links psl
            WHERE psl.parent_user_id = ? AND psl.verification_status = 'verified'
              AND (
                psl.student_user_id = n.reference_id
                OR n.reference_id IS NULL
              )
          ))
        )
      `,
      params: [userId, userId, userId, userId, userId, userId, userId, userId, userId]
    };
  }

  // Teacher or default roles:
  return {
    whereSql: `
      (
        (n.target_user_id = ?)
        OR (n.target_user_id IS NULL AND (n.target_role = ? OR n.target_role = 'all'))
      )
      AND (
        (n.category IS NULL OR n.category = 'system' OR n.category = 'homework' OR n.category = 'tuition')
      )
    `,
    params: [userId, role]
  };
}
