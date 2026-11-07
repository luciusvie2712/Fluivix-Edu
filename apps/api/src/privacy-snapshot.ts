import { ConflictException, NotFoundException } from "@nestjs/common";
import { Prisma, type Role } from "@prisma/client";
import type { PrivacyTx } from "./privacy-access";
import { invoiceValueScope } from "./invoice-query";
import { financialTimezone } from "./finance-query";

/** One SQL statement gives all exported surfaces the same database snapshot.
 * The selected requester role and current subject relation bound every section.
 * No credential, private lesson/student note or other learner enters the payload.
 */
export async function privacySnapshot(
  tx: PrivacyTx,
  tenantId: string,
  userId: string,
  role: Role,
  subject: string | null,
) {
  const canFinance = role === "guardian" && !!subject;
  const timezone = await financialTimezone(tx, tenantId);
  const { scoped } = invoiceValueScope(
    tenantId,
    { page: 1, limit: 100 },
    timezone,
    canFinance ? subject! : "00000000-0000-0000-0000-000000000000",
  );
  const invoices = canFinance
    ? Prisma.sql`COALESCE((SELECT jsonb_agg(x.item) FROM (
    SELECT jsonb_build_object('id',id,'invoiceNo',invoice_no,'issuedAt',issued_at,'dueAt',due_at,
      'billingState',billing_state,'paymentStatus',payment_status,'totalAmountVnd',total_amount_vnd::text,
      'paidAmountVnd',paid_amount::text,'balanceVnd',balance::text) AS item
    FROM valued ORDER BY issued_at,id LIMIT 5001
  ) x),'[]'::jsonb)`
    : Prisma.sql`'[]'::jsonb`;
  const payments = canFinance
    ? Prisma.sql`COALESCE((SELECT jsonb_agg(x.item) FROM (
    SELECT jsonb_build_object('id',p.id,'receiptNo',p.receipt_no,'method',p.method,'receivedAt',p.received_at,
      'receivedAmountVnd',p.received_amount_vnd::text,'status',p.status) AS item
    FROM payments p WHERE p.tenant_id=${tenantId}::uuid AND p.student_id=${subject}::uuid
      AND p.status IN ('CONFIRMED','REVERSED') ORDER BY p.received_at,p.id LIMIT 5001
  ) x),'[]'::jsonb)`
    : Prisma.sql`'[]'::jsonb`;
  const [row] = await tx.$queryRaw<
    { payload: Prisma.JsonObject }[]
  >(Prisma.sql`${scoped}
    SELECT jsonb_build_object(
      'schemaVersion',1,'asOf',now(),'requesterRole',${role}::text,
      'dataScope','CURRENT_AUTHORIZED_P0_DATA',
      'excludedSections',jsonb_build_array('credentials','privateStaffNotes','otherLearners','dataOutsideSelectedRole'),
      'tenant',jsonb_build_object('id',t.id,'name',t.name,'timezone',t.timezone),
      'account',jsonb_build_object('id',u.id,'displayName',u.display_name,'email',u.email),
      'teacherProfile',CASE WHEN ${role}::text='teacher' THEN (SELECT jsonb_build_object('id',p.id,'teacherCode',p.teacher_code,'fullName',p.full_name,'status',p.status)
        FROM teacher_profiles p WHERE p.tenant_id=t.id AND p.user_id=u.id) ELSE NULL END,
      'student',(SELECT jsonb_build_object('id',s.id,'studentCode',s.student_code,'fullName',s.full_name,
         'status',s.status,'dateOfBirth',s.date_of_birth,'contactEmail',s.contact_email,'contactPhone',s.contact_phone)
         FROM student_profiles s WHERE s.tenant_id=t.id AND s.id=${subject}::uuid),
      'enrollments',COALESCE((SELECT jsonb_agg(x.item) FROM (
         SELECT jsonb_build_object('classId',c.id,'classCode',c.code,'className',c.name,'joinedAt',e.joined_at,'leftAt',e.left_at,'status',e.status) AS item
         FROM enrollments e JOIN classes c ON c.tenant_id=e.tenant_id AND c.id=e.class_id
         WHERE e.tenant_id=t.id AND e.student_id=${subject}::uuid ORDER BY e.joined_at,e.id LIMIT 5001
      ) x),'[]'::jsonb),
      'schedule',COALESCE((SELECT jsonb_agg(x.item) FROM (
         SELECT jsonb_build_object('sessionId',l.id,'classId',c.id,'className',c.name,'scheduledDate',l.scheduled_date,'startsAt',l.starts_at,'endsAt',l.ends_at,'status',l.status) AS item
         FROM class_sessions l JOIN classes c ON c.tenant_id=l.tenant_id AND c.id=l.class_id
         WHERE l.tenant_id=t.id AND EXISTS(SELECT 1 FROM enrollments e WHERE e.tenant_id=l.tenant_id AND e.class_id=l.class_id
           AND e.student_id=${subject}::uuid AND e.joined_at<=l.scheduled_date AND (e.left_at IS NULL OR e.left_at>=l.scheduled_date))
         ORDER BY l.starts_at,l.id LIMIT 5001
      ) x),'[]'::jsonb),
      'publishedAttendance',COALESCE((SELECT jsonb_agg(x.item) FROM (
         SELECT jsonb_build_object('sessionId',l.id,'scheduledDate',l.scheduled_date,'status',a.status,'finalizedAt',l.finalized_at) AS item
         FROM attendance_records a JOIN class_sessions l ON l.tenant_id=a.tenant_id AND l.id=a.session_id
         WHERE a.tenant_id=t.id AND a.student_id=${subject}::uuid AND l.status='COMPLETED' AND l.finalized_at IS NOT NULL
           AND a.status IN ('PRESENT','LATE','ABSENT_EXCUSED','ABSENT_UNEXCUSED') ORDER BY l.starts_at,l.id LIMIT 5001
      ) x),'[]'::jsonb),
      'publishedGrades',COALESCE((SELECT jsonb_agg(x.item) FROM (
         SELECT jsonb_build_object('assessmentId',a.id,'title',a.title,'heldAt',a.held_at,'maxScore',a.max_score::text,
           'score',r.score::text,'comment',r.comment,'publishedAt',a.published_at) AS item
         FROM assessment_results r JOIN assessments a ON a.tenant_id=r.tenant_id AND a.id=r.assessment_id
         WHERE r.tenant_id=t.id AND r.student_id=${subject}::uuid AND a.status='PUBLISHED' AND a.published_at IS NOT NULL
         ORDER BY a.held_at,a.id LIMIT 5001
      ) x),'[]'::jsonb),
      'invoices',${invoices},'payments',${payments},
      'consents',COALESCE((SELECT jsonb_agg(x.item) FROM (
         SELECT jsonb_build_object('id',p.id,'policyVersion',p.policy_version,'purposeCode',p.purpose_code,
           'granted',p.granted,'capturedAt',p.captured_at,'revokedAt',p.revoked_at) AS item
         FROM privacy_consents p WHERE p.tenant_id=t.id AND p.consenting_user_id=u.id AND p.subject_student_id IS NOT DISTINCT FROM ${subject}::uuid
         ORDER BY p.captured_at,p.id LIMIT 5001
      ) x),'[]'::jsonb)
    ) AS payload FROM tenants t JOIN users u ON u.id=${userId}::uuid
    WHERE t.id=${tenantId}::uuid AND privacy_subject_is_authorized(t.id,u.id,${subject}::uuid,${role}::"Role",false)
  `);
  if (!row)
    throw new NotFoundException("Phạm vi dữ liệu không còn được phép xuất.");
  if (
    Object.values(row.payload).some(
      (value) => Array.isArray(value) && value.length > 5000,
    )
  )
    throw new ConflictException(
      "Phạm vi dữ liệu vượt giới hạn bản xuất trực tuyến; cần kênh xử lý riêng được phê duyệt.",
    );
  return JSON.stringify(row.payload, null, 2);
}
