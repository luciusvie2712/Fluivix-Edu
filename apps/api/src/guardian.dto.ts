import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { MembershipStatus } from "@prisma/client";
import {
  IsEnum,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Min,
} from "class-validator";
import { ForgotDto, ListDto } from "./auth.dto";
import { MetaDto, PageView } from "./response.dto";
import { InvitationLifecycleView } from "./invitation-view";
const linkStates = ["PENDING", "ACTIVE", "REVOKED"];
export class GuardianProvisionInput extends ForgotDto {}
export class GuardianDirectoryQuery extends ListDto {
  @ApiPropertyOptional({ enum: MembershipStatus })
  @IsOptional()
  @IsEnum(MembershipStatus)
  membershipStatus?: MembershipStatus;
  @ApiPropertyOptional({ enum: linkStates })
  @IsOptional()
  @IsIn(linkStates)
  relationshipStatus?: string;
}
export class GuardianLinksQuery extends ListDto {
  @ApiPropertyOptional({ enum: linkStates })
  @IsOptional()
  @IsIn(linkStates)
  status?: string;
}
export class LinkInput {
  @ApiProperty({ format: "uuid" }) @IsUUID() guardianUserId!: string;
  @ApiProperty({ enum: ["PARENT", "GUARDIAN", "OTHER"] })
  @IsIn(["PARENT", "GUARDIAN", "OTHER"])
  relationType!: string;
}
export class GuardianVersion {
  // Existing clients still use state-validated transitions; new editors supply
  // version for an explicit stale-write conflict under the same tenant lock.
  @ApiPropertyOptional({ minimum: 1 })
  @IsOptional()
  @IsInt()
  @Min(1)
  version?: number;
}
export class VerifyLink extends GuardianVersion {
  @ApiProperty({ minLength: 10, maxLength: 500 })
  @IsString()
  @Length(10, 500)
  verificationMethod!: string;
}
export class RevokeLink extends GuardianVersion {
  @ApiProperty({ minLength: 10, maxLength: 500 })
  @IsString()
  @Length(10, 500)
  reason!: string;
}
export class GuardianLinkView {
  @ApiProperty() id!: string;
  @ApiProperty() guardianUserId!: string;
  @ApiProperty() studentId!: string;
  @ApiProperty({ enum: linkStates }) status!: string;
  @ApiProperty() relationType!: string;
  @ApiProperty() version!: number;
  @ApiProperty({ type: String, nullable: true }) verifiedAt!: string | null;
}
export class GuardianLinkListView extends GuardianLinkView {
  @ApiProperty() studentName!: string;
  @ApiProperty() studentCode!: string;
  @ApiProperty() guardianDisplayName!: string;
  @ApiProperty() guardianEmail!: string;
}
export class GuardianUserView {
  @ApiProperty() userId!: string;
  @ApiProperty() displayName!: string;
  @ApiProperty() email!: string;
  @ApiProperty({ enum: MembershipStatus }) membershipStatus!: MembershipStatus;
  @ApiProperty() activationPending!: boolean;
  @ApiProperty() guardianRoleGranted!: boolean;
  @ApiProperty() accessReady!: boolean;
  @ApiProperty() relationshipEligible!: boolean;
  @ApiProperty({ minimum: 0 }) activeStudents!: number;
  @ApiProperty() recordedAt!: string;
}
export class GuardianLinkEventView {
  @ApiProperty() id!: string;
  @ApiProperty() version!: number;
  @ApiProperty() eventType!: string;
  @ApiProperty({ type: String, nullable: true }) beforeStatus!: string | null;
  @ApiProperty() afterStatus!: string;
  @ApiProperty() relationType!: string;
  @ApiProperty({ type: String, nullable: true }) verificationMethod!:
    | string
    | null;
  @ApiProperty({ type: String, nullable: true }) verifiedAt!: string | null;
  @ApiProperty({ type: String, nullable: true }) actorDisplayName!:
    | string
    | null;
  @ApiProperty({ type: String, nullable: true }) reason!: string | null;
  @ApiProperty({ type: String, nullable: true }) traceId!: string | null;
  @ApiProperty() recordedAt!: string;
}
export class GuardianLinkResponse {
  @ApiProperty({ type: GuardianLinkView }) data!: GuardianLinkView;
  @ApiProperty({ type: MetaDto }) meta!: MetaDto;
}
export class GuardianLinksResponse {
  @ApiProperty({ type: [GuardianLinkListView] }) data!: GuardianLinkListView[];
  @ApiProperty({ type: PageView }) page!: PageView;
  @ApiProperty({ type: MetaDto }) meta!: MetaDto;
}
export class GuardiansResponse {
  @ApiProperty({ type: [GuardianUserView] }) data!: GuardianUserView[];
  @ApiProperty({ type: PageView }) page!: PageView;
  @ApiProperty({ type: MetaDto }) meta!: MetaDto;
}
export class GuardianUserResponse {
  @ApiProperty({ type: GuardianUserView }) data!: GuardianUserView;
  @ApiProperty({ type: MetaDto }) meta!: MetaDto;
}
export class GuardianHistoryResponse {
  @ApiProperty({ type: [GuardianLinkEventView] })
  data!: GuardianLinkEventView[];
  @ApiProperty({ type: PageView }) page!: PageView;
  @ApiProperty({ type: MetaDto }) meta!: MetaDto;
}
export class GuardianInvitationsResponse {
  @ApiProperty({ type: [InvitationLifecycleView] })
  data!: InvitationLifecycleView[];
  @ApiProperty({ type: PageView }) page!: PageView;
  @ApiProperty({ type: MetaDto }) meta!: MetaDto;
}
