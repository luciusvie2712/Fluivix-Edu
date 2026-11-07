import {
  ApiProperty,
  ApiPropertyOptional,
  PartialType,
  PickType,
  OmitType,
} from "@nestjs/swagger";
import {
  IsBoolean,
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  IsInt,
  Min,
  Matches,
  ValidateNested,
} from "class-validator";
import { Type } from "class-transformer";
import { Role } from "@prisma/client";
import { MetaDto, PageView } from "./response.dto";
import { ListDto } from "./auth.dto";
import { CreateStudentDto } from "./students";
export class ConsentInput {
  @ApiPropertyOptional({ format: "uuid" })
  @IsOptional()
  @IsUUID()
  subjectStudentId?: string;
  @ApiProperty() @IsString() @Length(1, 100) policyVersion!: string;
  @ApiProperty({ enum: ["NOTIFICATIONS"] })
  @IsIn(["NOTIFICATIONS"])
  purposeCode!: string;
  @ApiProperty() @IsBoolean() granted!: boolean;
}
export class ConsentView {
  @ApiProperty() id!: string;
  @ApiProperty({ type: String, nullable: true }) subjectStudentId!:
    | string
    | null;
  @ApiProperty() policyVersion!: string;
  @ApiProperty() purposeCode!: string;
  @ApiProperty() granted!: boolean;
  @ApiProperty({ format: "date-time" }) capturedAt!: string;
  @ApiProperty({ type: String, nullable: true }) revokedAt!: string | null;
  @ApiProperty({ type: String, nullable: true }) captureMethod!: string | null;
  @ApiProperty({ enum: Role, nullable: true }) capturedRole!: Role | null;
}
export class ConsentResponse {
  @ApiProperty({ type: ConsentView }) data!: ConsentView;
  @ApiProperty({ type: MetaDto }) meta!: MetaDto;
}
export class ConsentsResponse {
  @ApiProperty({ type: [ConsentView] }) data!: ConsentView[];
  @ApiProperty({ type: MetaDto }) meta!: MetaDto;
}
export class PolicyView {
  @ApiProperty() configured!: boolean;
  @ApiProperty({ type: String, nullable: true }) version!: string | null;
  @ApiProperty({ type: String, nullable: true }) noticeUrl!: string | null;
}
export class PolicyResponse {
  @ApiProperty({ type: PolicyView }) data!: PolicyView;
  @ApiProperty({ type: MetaDto }) meta!: MetaDto;
}
export class PrivacyRequestInput {
  @ApiPropertyOptional({ format: "uuid" })
  @IsOptional()
  @IsUUID()
  subjectStudentId?: string;
  @ApiProperty({ enum: ["ACCESS", "CORRECT", "EXPORT", "ERASE", "WITHDRAW"] })
  @IsIn(["ACCESS", "CORRECT", "EXPORT", "ERASE", "WITHDRAW"])
  type!: string;
}
export class PrivacyRequestView {
  @ApiProperty() id!: string;
  @ApiProperty() type!: string;
  @ApiProperty() status!: string;
  @ApiProperty({ format: "date-time" }) createdAt!: string;
  @ApiProperty() version!: number;
  @ApiProperty({ type: String, nullable: true, format: "uuid" })
  subjectStudentId!: string | null;
  @ApiProperty({ enum: Role, nullable: true }) requesterRole!: Role | null;
  @ApiProperty({ type: String, nullable: true }) scopeConfirmedAt!:
    | string
    | null;
  @ApiProperty({ type: String, nullable: true }) verifiedAt!: string | null;
  @ApiProperty({ type: String, nullable: true }) decidedAt!: string | null;
  @ApiProperty({ type: String, nullable: true }) decisionReason!: string | null;
  @ApiProperty({ type: String, nullable: true }) completedAt!: string | null;
  @ApiProperty({ type: String, nullable: true }) fulfillmentKind!:
    | string
    | null;
  @ApiProperty() scopeAvailable!: boolean;
  @ApiProperty() exportAvailable!: boolean;
  @ApiProperty({ type: [String] }) resultFields!: string[];
  @ApiProperty({ type: [String] }) retainedSections!: string[];
  @ApiProperty({ type: Number, nullable: true }) resultStudentVersion!:
    | number
    | null;
  @ApiProperty({ type: Number, nullable: true }) withdrawnConsentCount!:
    | number
    | null;
  @ApiProperty({ type: Number, nullable: true }) temporaryExportsPurged!:
    | number
    | null;
  @ApiProperty({ type: String, nullable: true }) configuredPolicyVersion!:
    | string
    | null;
  @ApiProperty({ type: String, nullable: true, format: "date-time" })
  exportExpiresAt!: string | null;
}
export const privacyRequestStates = [
  "RECEIVED",
  "VERIFIED",
  "APPROVED",
  "REJECTED",
  "COMPLETED",
] as const;
export class PrivacyPageQuery extends OmitType(ListDto, ["search"] as const) {}
export class PrivacyRequestsQuery extends PrivacyPageQuery {
  @ApiPropertyOptional({ enum: privacyRequestStates })
  @IsOptional()
  @IsIn(privacyRequestStates)
  status?: (typeof privacyRequestStates)[number];
  @ApiPropertyOptional({
    enum: ["ACCESS", "CORRECT", "EXPORT", "ERASE", "WITHDRAW"],
  })
  @IsOptional()
  @IsIn(["ACCESS", "CORRECT", "EXPORT", "ERASE", "WITHDRAW"])
  type?: string;
  @ApiPropertyOptional({ format: "uuid" })
  @IsOptional()
  @IsUUID()
  subjectStudentId?: string;
}
export class PrivacyRequestsResponse {
  @ApiProperty({ type: [PrivacyRequestView] }) data!: PrivacyRequestView[];
  @ApiProperty({ type: PageView }) page!: PageView;
  @ApiProperty({ type: MetaDto }) meta!: MetaDto;
}
export class PrivacyVersionInput {
  @ApiProperty({ minimum: 1 }) @IsInt() @Min(1) version!: number;
}
export class PrivacyReviewInput extends PrivacyVersionInput {
  @ApiProperty({ minLength: 10, maxLength: 500 })
  @IsString()
  @Length(10, 500)
  @Matches(/\S/)
  reason!: string;
}
export class PrivacyVerifyInput extends PrivacyReviewInput {
  @ApiProperty({
    enum: ["ACCOUNT_CONFIRMATION", "VERIFIED_GUARDIAN", "REVIEWED_EVIDENCE"],
  })
  @IsIn(["ACCOUNT_CONFIRMATION", "VERIFIED_GUARDIAN", "REVIEWED_EVIDENCE"])
  method!: string;
  @ApiProperty({
    description:
      "Opaque reference to verified evidence; no identity-document content or secret URL.",
    minLength: 3,
    maxLength: 150,
  })
  @IsString()
  @Matches(/^[A-Za-z0-9][A-Za-z0-9_./:-]{2,149}$/)
  evidenceRef!: string;
}
export class PrivacyDecisionInput extends PrivacyReviewInput {
  @ApiProperty({ enum: ["APPROVE", "REJECT"] })
  @IsIn(["APPROVE", "REJECT"])
  decision!: "APPROVE" | "REJECT";
}
export class PrivacyCorrectionInput extends PartialType(
  PickType(CreateStudentDto, [
    "fullName",
    "dateOfBirth",
    "contactEmail",
    "contactPhone",
  ] as const),
  { skipNullProperties: false },
) {}
export class PrivacyFulfillInput extends PrivacyReviewInput {
  @ApiPropertyOptional({ type: PrivacyCorrectionInput })
  @IsOptional()
  @ValidateNested()
  @Type(() => PrivacyCorrectionInput)
  correction?: PrivacyCorrectionInput;
  @ApiPropertyOptional({ minimum: 1 })
  @IsOptional()
  @IsInt()
  @Min(1)
  studentVersion?: number;
  @ApiPropertyOptional({
    description:
      "Explicit confirmation of the configured tenant profile redaction scope and retained financial/audit/global identity records.",
  })
  @IsOptional()
  @IsBoolean()
  confirmRetainedRecords?: boolean;
}
export class PrivacyEventView {
  @ApiProperty() version!: number;
  @ApiProperty() eventType!: string;
  @ApiProperty({ type: String, nullable: true }) beforeStatus!: string | null;
  @ApiProperty() afterStatus!: string;
  @ApiProperty({ type: String, nullable: true }) actorUserId!: string | null;
  @ApiProperty({ type: String, nullable: true }) reason!: string | null;
  @ApiProperty({ format: "date-time" }) recordedAt!: string;
}
export class PrivacyEventsResponse {
  @ApiProperty({ type: [PrivacyEventView] }) data!: PrivacyEventView[];
  @ApiProperty({ type: PageView }) page!: PageView;
  @ApiProperty({ type: MetaDto }) meta!: MetaDto;
}
export class PrivacyAdminRequestView extends PrivacyRequestView {
  @ApiProperty({ type: Number, nullable: true }) subjectVersion!: number | null;
  @ApiProperty() requesterUserId!: string;
  @ApiProperty() requesterDisplayName!: string;
  @ApiProperty({ type: String, nullable: true }) subjectFullName!:
    | string
    | null;
  @ApiProperty({ type: String, nullable: true }) verificationMethod!:
    | string
    | null;
  @ApiProperty({ type: String, nullable: true }) verificationEvidenceRef!:
    | string
    | null;
}
export class PrivacyAdminRequestResponse {
  @ApiProperty({ type: PrivacyAdminRequestView })
  data!: PrivacyAdminRequestView;
  @ApiProperty({ type: MetaDto }) meta!: MetaDto;
}
export class PrivacyAdminRequestsResponse {
  @ApiProperty({ type: [PrivacyAdminRequestView] })
  data!: PrivacyAdminRequestView[];
  @ApiProperty({ type: PageView }) page!: PageView;
  @ApiProperty({ type: MetaDto }) meta!: MetaDto;
}
export class PrivacyExportView {
  @ApiProperty() filename!: string;
  @ApiProperty({
    description:
      "UTF-8 JSON file content, transient; do not persist in browser/AsyncStorage.",
  })
  json!: string;
  @ApiProperty() sha256!: string;
  @ApiProperty({ format: "date-time" }) expiresAt!: string;
}
export class PrivacyExportResponse {
  @ApiProperty({ type: PrivacyExportView }) data!: PrivacyExportView;
  @ApiProperty({ type: MetaDto }) meta!: MetaDto;
}
export class PrivacyRequestResponse {
  @ApiProperty({ type: PrivacyRequestView }) data!: PrivacyRequestView;
  @ApiProperty({ type: MetaDto }) meta!: MetaDto;
}
