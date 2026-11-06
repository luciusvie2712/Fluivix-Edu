import { Prisma } from "@prisma/client";

function notificationIdentitySql(): Prisma.Sql {
  return Prisma.sql`EXISTS (
    SELECT 1 FROM tenant_memberships m
    JOIN users u ON u.id=m.user_id
    JOIN tenants t ON t.id=m.tenant_id
    JOIN membership_roles mr ON mr.membership_id=m.id AND mr.role=n.recipient_role
    WHERE m.tenant_id=n.tenant_id AND m.user_id=n.recipient_user_id
      AND m.status='ACTIVE' AND NOT m.activation_pending AND u.status='ACTIVE'
      AND t.status IN ('ACTIVE','PAST_DUE_GRACE','READ_ONLY')
  )`;
}

// Server-only policy for fixed SQL alias n. Recorded representative child
// remains historical; these IDs describe CURRENT authorized resource subjects.
export function notificationSubjectsSql(): Prisma.Sql {
  return Prisma.sql`
    SELECT s.id FROM student_profiles s
    WHERE s.tenant_id=n.tenant_id AND ${notificationIdentitySql()} AND (
      (n.recipient_role='guardian' AND EXISTS (
        SELECT 1 FROM guardian_student_links l
        WHERE l.tenant_id=s.tenant_id AND l.student_id=s.id
          AND l.guardian_user_id=n.recipient_user_id AND l.status='ACTIVE'
          AND l.verified_at IS NOT NULL AND l.verified_by IS NOT NULL
      )) OR (n.recipient_role='student' AND s.user_id=n.recipient_user_id)
    ) AND (
      (n.type='CLASS_SCHEDULE_CHANGED' AND n.entity_type='session' AND EXISTS (
        SELECT 1 FROM class_sessions lesson JOIN enrollments e
          ON e.tenant_id=lesson.tenant_id AND e.class_id=lesson.class_id
        WHERE lesson.tenant_id=n.tenant_id AND lesson.id=n.entity_id
          AND e.student_id=s.id AND e.joined_at<=lesson.scheduled_date
          AND (e.left_at IS NULL OR e.left_at>=lesson.scheduled_date)
      )) OR
      (n.type='ATTENDANCE_FINALIZED_ABSENT' AND n.entity_type='session' AND EXISTS (
        SELECT 1 FROM class_sessions lesson JOIN attendance_records a
          ON a.tenant_id=lesson.tenant_id AND a.session_id=lesson.id
        WHERE lesson.tenant_id=n.tenant_id AND lesson.id=n.entity_id
          AND lesson.status='COMPLETED' AND lesson.finalized_at IS NOT NULL
          AND a.student_id=s.id AND a.status IN ('ABSENT_EXCUSED','ABSENT_UNEXCUSED')
      )) OR
      (n.type='GRADE_PUBLISHED' AND n.entity_type='assessment' AND EXISTS (
        SELECT 1 FROM assessments a JOIN assessment_results r
          ON r.tenant_id=a.tenant_id AND r.assessment_id=a.id
        WHERE a.tenant_id=n.tenant_id AND a.id=n.entity_id AND a.status='PUBLISHED'
          AND a.published_at IS NOT NULL AND r.student_id=s.id
      )) OR
      (n.recipient_role='guardian' AND n.type='INVOICE_ISSUED' AND n.entity_type='invoice' AND EXISTS (
        SELECT 1 FROM invoices i WHERE i.tenant_id=n.tenant_id AND i.id=n.entity_id
          AND i.student_id=s.id AND i.billing_state IN ('ISSUED','VOID')
      )) OR
      (n.recipient_role='guardian' AND n.type='PAYMENT_RECORDED' AND n.entity_type='payment' AND EXISTS (
        SELECT 1 FROM payments p WHERE p.tenant_id=n.tenant_id AND p.id=n.entity_id
          AND p.student_id=s.id AND p.status IN ('CONFIRMED','REVERSED')
      ))
    )
  `;
}

export function notificationAudienceSql(): Prisma.Sql {
  return Prisma.sql`
    ${notificationIdentitySql()} AND (
      EXISTS (${notificationSubjectsSql()}) OR
      (n.recipient_role='teacher' AND n.type='CLASS_SCHEDULE_CHANGED'
        AND n.entity_type='session' AND EXISTS (
          SELECT 1 FROM class_sessions lesson
          JOIN teacher_profiles p ON p.tenant_id=lesson.tenant_id AND p.id=lesson.teacher_id
          JOIN class_teachers a ON a.tenant_id=lesson.tenant_id AND a.class_id=lesson.class_id AND a.teacher_id=p.id
          WHERE lesson.tenant_id=n.tenant_id AND lesson.id=n.entity_id
            AND p.user_id=n.recipient_user_id AND p.status='ACTIVE'
            AND a.effective_from<=lesson.scheduled_date
            AND (a.effective_to IS NULL OR a.effective_to>=lesson.scheduled_date)
        ))
    )
  `;
}
