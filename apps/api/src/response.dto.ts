import { ApiProperty } from "@nestjs/swagger";
import { Role, TenantStatus } from "@prisma/client";
export class MetaDto {
  @ApiProperty() traceId!: string;
}
export class TokenDto {
  @ApiProperty() accessToken!: string;
}
export class TokenResponse {
  @ApiProperty({ type: TokenDto }) data!: TokenDto;
  @ApiProperty({ type: MetaDto }) meta!: MetaDto;
}
export class MessageDto {
  @ApiProperty() message!: string;
}
export class MessageResponse {
  @ApiProperty({ type: MessageDto }) data!: MessageDto;
  @ApiProperty({ type: MetaDto }) meta!: MetaDto;
}
export class ResultDto {
  @ApiProperty() revoked!: boolean;
}
export class RevokeResponse {
  @ApiProperty({ type: ResultDto }) data!: ResultDto;
  @ApiProperty({ type: MetaDto }) meta!: MetaDto;
}
export class ResetResult {
  @ApiProperty() reset!: boolean;
}
export class ResetResponse {
  @ApiProperty({ type: ResetResult }) data!: ResetResult;
  @ApiProperty({ type: MetaDto }) meta!: MetaDto;
}
export class ActivationResult {
  @ApiProperty() activated!: boolean;
}
export class ActivationResponse {
  @ApiProperty({ type: ActivationResult }) data!: ActivationResult;
  @ApiProperty({ type: MetaDto }) meta!: MetaDto;
}
export class TenantView {
  @ApiProperty({ format: "uuid" }) id!: string;
  @ApiProperty() name!: string;
  @ApiProperty({ enum: TenantStatus, enumName: "TenantStatus" })
  status!: TenantStatus;
  @ApiProperty() timezone!: string;
}
export class RoleView {
  @ApiProperty({ enum: Role, enumName: "Role" }) role!: Role;
}
export class MembershipView {
  @ApiProperty({ type: TenantView }) tenant!: TenantView;
  @ApiProperty({ type: [RoleView] }) roles!: RoleView[];
}
export class MeView {
  @ApiProperty({ format: "uuid" }) id!: string;
  @ApiProperty() displayName!: string;
  @ApiProperty({ type: [MembershipView] }) memberships!: MembershipView[];
  @ApiProperty({ type: String, nullable: true, format: "uuid" })
  activeTenantId!: string | null;
  @ApiProperty({ enum: Role, enumName: "Role", nullable: true })
  activeRole!: Role | null;
}
export class MeResponse {
  @ApiProperty({ type: MeView }) data!: MeView;
  @ApiProperty({ type: MetaDto }) meta!: MetaDto;
}
export class TenantsResponse {
  @ApiProperty({ type: [MembershipView] }) data!: MembershipView[];
  @ApiProperty({ type: MetaDto }) meta!: MetaDto;
}
export class SessionView {
  @ApiProperty({ format: "uuid" }) id!: string;
  @ApiProperty({ format: "date-time" }) createdAt!: string;
  @ApiProperty({ format: "date-time" }) expiresAt!: string;
}
export class SessionsResponse {
  @ApiProperty({ type: [SessionView] }) data!: SessionView[];
  @ApiProperty({ type: MetaDto }) meta!: MetaDto;
}
export class InviteView {
  @ApiProperty({ format: "uuid" }) invitationId!: string;
  @ApiProperty({ format: "date-time" }) expiresAt!: string;
}
export class InviteResponse {
  @ApiProperty({ type: InviteView }) data!: InviteView;
  @ApiProperty({ type: MetaDto }) meta!: MetaDto;
}
export class ErrorView {
  @ApiProperty() code!: string;
  @ApiProperty() message!: string;
}
export class ErrorResponse {
  @ApiProperty({ type: ErrorView }) error!: ErrorView;
  @ApiProperty({ type: MetaDto }) meta!: MetaDto;
}
export class StudentView {
  @ApiProperty({ format: "uuid" }) id!: string;
  @ApiProperty() studentCode!: string;
  @ApiProperty() fullName!: string;
  @ApiProperty({ enum: ["ACTIVE", "PAUSED", "GRADUATED", "INACTIVE"] })
  status!: string;
}
export class StudentResponse {
  @ApiProperty({ type: StudentView }) data!: StudentView;
  @ApiProperty({ type: MetaDto }) meta!: MetaDto;
}
export class PageView {
  @ApiProperty() page!: number;
  @ApiProperty() limit!: number;
  @ApiProperty() total!: number;
  @ApiProperty() totalPages!: number;
}
export class StudentListResponse {
  @ApiProperty({ type: [StudentView] }) data!: StudentView[];
  @ApiProperty({ type: PageView }) page!: PageView;
  @ApiProperty({ type: MetaDto }) meta!: MetaDto;
}
