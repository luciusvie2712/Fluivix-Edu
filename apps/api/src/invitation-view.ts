import { ApiProperty } from "@nestjs/swagger";
import { Role, type Invitation } from "@prisma/client";
export class InvitationLifecycleView {
  @ApiProperty({ format: "uuid" }) id!: string;
  @ApiProperty() email!: string;
  @ApiProperty({ enum: Role, enumName: "Role" }) role!: Role;
  @ApiProperty() expiresAt!: string;
  @ApiProperty({ enum: ["PENDING", "EXPIRED", "ACCEPTED", "REVOKED"] })
  status!: string;
}
export function invitationView(
  i: Pick<
    Invitation,
    "id" | "email" | "role" | "expiresAt" | "usedAt" | "revokedAt"
  >,
): InvitationLifecycleView {
  return {
    id: i.id,
    email: i.email,
    role: i.role,
    expiresAt: i.expiresAt.toISOString(),
    status: i.usedAt
      ? "ACCEPTED"
      : i.revokedAt
        ? "REVOKED"
        : i.expiresAt <= new Date()
          ? "EXPIRED"
          : "PENDING",
  };
}
