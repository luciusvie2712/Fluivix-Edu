import {
  ConflictException,
  UnprocessableEntityException,
} from "@nestjs/common";
import type { DataSubjectRequest, Prisma } from "@prisma/client";
import type { PrivacyTx } from "./privacy-access";
import type { PrivacyFulfillInput } from "./privacy.dto";
import { privateFields, tenantDate } from "./students";
import { financialTimezone } from "./finance-query";
import { privacySnapshot } from "./privacy-snapshot";
import {
  privacyExportTtlMinutes,
  sealPrivacyExport,
} from "./privacy-export-crypto";

function erasurePolicy() {
  const version = process.env.PRIVACY_ERASURE_POLICY_VERSION;
  const reference = process.env.PRIVACY_ERASURE_APPROVAL_REF;
  const fields = (process.env.PRIVACY_ERASURE_FIELDS ?? "")
    .split(",")
    .map((s) => s.trim())
    .sort();
  const required = [
    "contactEmail",
    "contactPhone",
    "dateOfBirth",
    "fullName",
    "notesPrivate",
  ].sort();
  if (
    !version ||
    version.length > 100 ||
    version.trim() !== version ||
    !reference ||
    !/^[A-Za-z0-9][A-Za-z0-9_./:-]{2,149}$/.test(reference) ||
    JSON.stringify(fields) !== JSON.stringify(required)
  )
    throw new ConflictException(
      "Chưa có cấu hình chính sách và phạm vi che thông tin được phê duyệt. Yêu cầu chưa được thực thi.",
    );
  // This operator configuration is not proof of qualified legal approval.
  return { version, reference };
}

/** Called only inside the locked, currently authorized admin request transaction.
 * There is no endpoint that accepts a caller-supplied completion outcome.
 */
export async function fulfillPrivacyRequest(
  tx: PrivacyTx,
  r: DataSubjectRequest,
  input: PrivacyFulfillInput,
): Promise<Prisma.InputJsonObject> {
  if (!r.requesterRole)
    throw new ConflictException(
      "Cần người yêu cầu xác nhận lại phạm vi hiện tại.",
    );
  if (r.type === "ACCESS" || r.type === "EXPORT") {
    if (
      input.correction ||
      input.studentVersion !== undefined ||
      input.confirmRetainedRecords !== undefined
    )
      throw new UnprocessableEntityException(
        "Bản xuất không nhận thông tin sửa hoặc xóa hồ sơ.",
      );
    const json = await privacySnapshot(
      tx,
      r.tenantId,
      r.requesterUserId,
      r.requesterRole,
      r.subjectStudentId,
    );
    const sealed = sealPrivacyExport(r.tenantId, r.id, json),
      createdAt = new Date(),
      expiresAt = new Date(
        createdAt.getTime() + privacyExportTtlMinutes() * 60000,
      );
    const artifact = await tx.privacyExportArtifact.create({
      data: {
        tenantId: r.tenantId,
        requestId: r.id,
        ...sealed,
        createdAt,
        expiresAt,
      },
    });
    return {
      kind: r.type,
      scope: "CURRENT_AUTHORIZED_P0_DATA",
      artifactId: artifact.id,
      sha256: sealed.sha256,
      byteCount: sealed.byteCount,
      expiresAt: expiresAt.toISOString(),
    };
  }
  if (r.type === "WITHDRAW") {
    if (
      input.correction ||
      input.studentVersion !== undefined ||
      input.confirmRetainedRecords !== undefined
    )
      throw new UnprocessableEntityException(
        "Rút đồng ý không sửa hoặc xóa hồ sơ.",
      );
    const changed = await tx.privacyConsent.updateMany({
      where: {
        tenantId: r.tenantId,
        consentingUserId: r.requesterUserId,
        subjectStudentId: r.subjectStudentId,
        purposeCode: "NOTIFICATIONS",
        granted: true,
        revokedAt: null,
      },
      data: { revokedAt: new Date() },
    });
    return {
      kind: "WITHDRAW",
      purposeCode: "NOTIFICATIONS",
      revokedConsentCount: changed.count,
    };
  }
  if (!r.subjectStudentId)
    throw new ConflictException(
      "Yêu cầu sửa/xóa này cần phạm vi hồ sơ học viên tại trung tâm. Định danh toàn cục cần quy trình riêng; chưa có thay đổi nào được thực hiện.",
    );
  if (input.studentVersion === undefined)
    throw new UnprocessableEntityException(
      "Cần phiên bản hồ sơ học viên đã kiểm tra.",
    );
  await tx.$queryRaw`SELECT id FROM student_profiles WHERE tenant_id=${r.tenantId}::uuid AND id=${r.subjectStudentId}::uuid FOR UPDATE`;
  const student = await tx.student.findFirstOrThrow({
    where: { tenantId: r.tenantId, id: r.subjectStudentId },
  });
  if (student.version !== input.studentVersion)
    throw new ConflictException(
      "Hồ sơ đã thay đổi. Tải lại trước khi thực thi.",
    );
  if (r.type === "CORRECT") {
    if (!input.correction || input.confirmRetainedRecords !== undefined)
      throw new UnprocessableEntityException(
        "Cần thông tin sửa hồ sơ trong phạm vi được hỗ trợ.",
      );
    const d = input.correction;
    const allowed = {
      ...(d.dateOfBirth !== undefined ? { dateOfBirth: d.dateOfBirth } : {}),
      ...(d.contactEmail !== undefined ? { contactEmail: d.contactEmail } : {}),
      ...(d.contactPhone !== undefined ? { contactPhone: d.contactPhone } : {}),
    };
    const patch = {
      ...privateFields(
        allowed,
        tenantDate(await financialTimezone(tx, r.tenantId)),
      ),
      ...(d.fullName !== undefined ? { fullName: d.fullName.trim() } : {}),
    };
    const fields = Object.entries(patch)
      .filter(
        ([key, value]) =>
          JSON.stringify(value) !==
          JSON.stringify(student[key as keyof typeof student]),
      )
      .map(([key]) => key);
    if (!fields.length)
      throw new ConflictException(
        "Không có giá trị hồ sơ thay đổi. Kiểm tra lại đề nghị hoặc ghi nhận quyết định phù hợp.",
      );
    await tx.student.update({
      where: { tenantId_id: { tenantId: r.tenantId, id: student.id } },
      data: { ...patch, version: { increment: 1 } },
    });
    return {
      kind: "CORRECT",
      studentId: student.id,
      studentVersion: student.version + 1,
      fields,
    };
  }
  if (r.type === "ERASE") {
    if (input.correction || input.confirmRetainedRecords !== true)
      throw new UnprocessableEntityException(
        "Cần xác nhận rõ phạm vi che thông tin và các chứng từ/định danh được giữ lại.",
      );
    const policy = erasurePolicy();
    if (student.status !== "INACTIVE")
      throw new ConflictException(
        "Hồ sơ còn hoạt động; cần xem xét và hoàn tất các nghiệp vụ liên quan trước khi che thông tin.",
      );
    const [active] = await tx.$queryRaw<{ n: number }[]>`
      SELECT count(*)::integer AS n FROM enrollments e JOIN classes cl ON cl.tenant_id=e.tenant_id AND cl.id=e.class_id
      JOIN tenants t ON t.id=e.tenant_id WHERE e.tenant_id=${r.tenantId}::uuid AND e.student_id=${student.id}::uuid
        AND e.status='ACTIVE' AND (e.left_at IS NULL OR e.left_at>=(now() AT TIME ZONE t.timezone)::date)
        AND cl.status IN ('DRAFT','ACTIVE') AND (cl.end_date IS NULL OR cl.end_date>=(now() AT TIME ZONE t.timezone)::date)
    `;
    if (active?.n)
      throw new ConflictException(
        "Còn ghi danh đang vận hành hoặc sắp tới. Yêu cầu chưa được thực thi.",
      );
    if (
      student.fullName === "Học viên đã che thông tin" &&
      student.dateOfBirth === null &&
      student.contactEmail === null &&
      student.contactPhone === null &&
      student.notesPrivate === null
    )
      throw new ConflictException(
        "Các trường hồ sơ đã được che. Không tạo thêm thay đổi không có nội dung.",
      );
    const prior = await tx.dataSubjectRequest.findMany({
      where: {
        tenantId: r.tenantId,
        subjectStudentId: student.id,
        type: { in: ["ACCESS", "EXPORT"] },
      },
      select: { id: true },
    });
    const purged = await tx.privacyExportArtifact.updateMany({
      where: {
        tenantId: r.tenantId,
        requestId: { in: prior.map((p) => p.id) },
        ciphertext: { not: null },
      },
      data: { ciphertext: null, purgedAt: new Date(), erasedByRequestId: r.id },
    });
    await tx.student.update({
      where: { tenantId_id: { tenantId: r.tenantId, id: student.id } },
      data: {
        fullName: "Học viên đã che thông tin",
        dateOfBirth: null,
        contactEmail: null,
        contactPhone: null,
        notesPrivate: null,
        version: { increment: 1 },
      },
    });
    const withdrawn = await tx.privacyConsent.updateMany({
      where: {
        tenantId: r.tenantId,
        subjectStudentId: student.id,
        purposeCode: "NOTIFICATIONS",
        granted: true,
        revokedAt: null,
      },
      data: { revokedAt: new Date() },
    });
    return {
      kind: "ERASE_PROFILE",
      fields: [
        "fullName",
        "dateOfBirth",
        "contactEmail",
        "contactPhone",
        "notesPrivate",
      ],
      studentId: student.id,
      studentVersion: student.version + 1,
      policyVersion: policy.version,
      operatorApprovalReference: policy.reference,
      temporaryExportsPurged: purged.count,
      notificationConsentsRevoked: withdrawn.count,
      retained: [
        "studentCode",
        "globalAccount",
        "financialRecords",
        "attendanceHistory",
        "publishedGrades",
        "auditHistory",
      ],
    };
  }
  throw new UnprocessableEntityException("Loại yêu cầu chưa được hỗ trợ.");
}
