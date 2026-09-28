/**
 * notificationPolicy.js
 * Authoritative Resource Authorization Policy for System Notifications
 * 
 * Contract: (Audience matches) AND (Public non-sensitive OR Resource-authorized)
 * Used uniformly across:
 * - GET /api/notifications
 * - POST /api/notifications (action: mark_read for single notification)
 * - POST /api/notifications (action: mark_all)
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
    // Student notification policy:
    // 1. Audience: Personally addressed to student, or broadcast to student/all
    // 2. Resource Gate:
    //    - Allowlist: category IS NULL or category = 'system' (non-sensitive system announcements)
    //    - Homework: MUST be actively enrolled in the class of the referenced assignment,
    //      OR be the author of the referenced submission
    //    - All other / unknown categories: FAIL-CLOSED (filtered out)
    return {
      whereSql: `
        (
          (n.target_user_id = ?)
          OR (n.target_user_id IS NULL AND (n.target_role = 'student' OR n.target_role = 'all'))
        )
        AND (
          (n.category IS NULL OR n.category = 'system')
          OR (n.category = 'homework' AND (
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
        )
      `,
      params: [userId, userId, userId]
    };
  }

  if (role === 'parent') {
    // Parent notification policy:
    // 1. Audience: Personally addressed to parent, or broadcast to parent/all
    // 2. Resource Gate:
    //    - Allowlist: category IS NULL or category = 'system' (non-sensitive system announcements)
    //    - Homework personal (target_user_id IS NOT NULL):
    //      Must have verified link with child actively enrolled in the assignment's class,
    //      OR verified link with student of the referenced submission
    //    - Homework broadcast (target_user_id IS NULL):
    //      Must have verified link with child actively enrolled in the referenced assignment's class
    //    - All other / unknown categories: FAIL-CLOSED (filtered out)
    return {
      whereSql: `
        (
          (n.target_user_id = ?)
          OR (n.target_user_id IS NULL AND (n.target_role = 'parent' OR n.target_role = 'all'))
        )
        AND (
          (n.category IS NULL OR n.category = 'system')
          OR (n.target_user_id IS NOT NULL AND n.category = 'homework' AND (
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
          OR (n.target_user_id IS NULL AND n.category = 'homework' AND EXISTS (
            SELECT 1 FROM parent_student_links psl
            JOIN class_enrollments ce ON ce.user_id = psl.student_user_id AND ce.status = 'active'
            JOIN homework_assignments ha ON ha.id = n.reference_id AND ha.class_id = ce.class_id
            WHERE psl.parent_user_id = ? AND psl.verification_status = 'verified'
          ))
        )
      `,
      params: [userId, userId, userId, userId]
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
