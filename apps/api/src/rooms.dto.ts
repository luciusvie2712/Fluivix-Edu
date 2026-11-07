import { ApiProperty, ApiPropertyOptional, PickType } from "@nestjs/swagger";
import {
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Length,
  Matches,
  Max,
  Min,
} from "class-validator";
import { ListDto } from "./auth.dto";
import { MetaDto, PageView } from "./response.dto";
import { LifecycleVersion, RoomView } from "./teaching.dto";

export class RoomQuery extends ListDto {
  @ApiPropertyOptional({ enum: ["true", "false"] })
  @IsOptional()
  @IsIn(["true", "false"])
  active?: "true" | "false";
}
export class RoomHistoryQuery extends PickType(ListDto, [
  "page",
  "limit",
] as const) {}
export class RoomUpdateInput extends LifecycleVersion {
  @ApiProperty() @IsString() @Matches(/\S/) @Length(1, 150) name!: string;
  @ApiProperty({ minimum: 1, maximum: 1000 })
  @IsInt()
  @Min(1)
  @Max(1000)
  capacity!: number;
  @ApiProperty() @IsBoolean() active!: boolean;
}
export class RoomUsageView {
  @ApiProperty() activeOrDraftClasses!: number;
  @ApiProperty() futureActiveRules!: number;
  @ApiProperty() upcomingOrOngoingSessions!: number;
  @ApiProperty() requiredCapacity!: number;
}
export class RoomDetailView extends RoomView {
  @ApiProperty({ type: RoomUsageView }) usage!: RoomUsageView;
  @ApiProperty() timezone!: string;
}
export class RoomDetailResponse {
  @ApiProperty({ type: RoomDetailView }) data!: RoomDetailView;
  @ApiProperty({ type: MetaDto }) meta!: MetaDto;
}
export class RoomSnapshotView {
  @ApiProperty() code!: string;
  @ApiProperty() name!: string;
  @ApiProperty() capacity!: number;
  @ApiProperty() active!: boolean;
  @ApiProperty() version!: number;
}
export class RoomHistoryItem {
  @ApiProperty() id!: string;
  @ApiProperty({ enum: ["room.created", "room.updated"] }) action!:
    | "room.created"
    | "room.updated";
  @ApiProperty({ type: String, nullable: true }) actorId!: string | null;
  @ApiProperty({ type: String, nullable: true }) actorName!: string | null;
  @ApiProperty({ format: "date-time" }) createdAt!: string;
  @ApiProperty({ type: String, nullable: true }) reason!: string | null;
  @ApiProperty() hasDetails!: boolean;
  @ApiProperty({ type: RoomSnapshotView, nullable: true })
  before!: RoomSnapshotView | null;
  @ApiProperty({ type: RoomSnapshotView, nullable: true })
  after!: RoomSnapshotView | null;
}
export class RoomHistoryResponse {
  @ApiProperty({ type: [RoomHistoryItem] }) data!: RoomHistoryItem[];
  @ApiProperty({ type: PageView }) page!: PageView;
  @ApiProperty({ type: MetaDto }) meta!: MetaDto;
}
