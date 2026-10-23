import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import {
  IsEmail,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Max,
  Min,
} from "class-validator";
import { Role } from "@prisma/client";
import { Type } from "class-transformer";
export class LoginDto {
  @ApiProperty({ format: "email", maxLength: 254 })
  @IsEmail()
  @Length(3, 254)
  email!: string;
  @ApiProperty({ minLength: 12, maxLength: 128 })
  @IsString()
  @Length(12, 128)
  password!: string;
}
export class ForgotDto {
  @ApiProperty({ format: "email", maxLength: 254 })
  @IsEmail()
  @Length(3, 254)
  email!: string;
}
export class ResetDto {
  @ApiProperty({ minLength: 43, maxLength: 43 })
  @IsString()
  @Length(43, 43)
  token!: string;
  @ApiProperty({ minLength: 12, maxLength: 128 })
  @IsString()
  @Length(12, 128)
  password!: string;
}
export class AcceptInvitationDto extends ResetDto {
  @ApiProperty({ minLength: 1, maxLength: 150 })
  @IsString()
  @Length(1, 150)
  displayName!: string;
}
export class ContextDto {
  @ApiProperty({ format: "uuid" }) @IsUUID() tenantId!: string;
  @ApiProperty({ enum: Role }) @IsEnum(Role) role!: Role;
}
export class InviteDto extends ForgotDto {
  @ApiProperty({ enum: Role }) @IsEnum(Role) role!: Role;
}
export class ListDto {
  @ApiPropertyOptional({ default: 1, minimum: 1 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Type(() => Number)
  page: number = 1;
  @ApiPropertyOptional({ default: 20, minimum: 1, maximum: 100 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  @Type(() => Number)
  limit: number = 20;
  @ApiPropertyOptional({ maxLength: 100 })
  @IsOptional()
  @IsString()
  @Length(0, 100)
  search?: string;
}
