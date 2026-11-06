import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { IsIn, IsOptional } from "class-validator";
import { ListDto } from "./auth.dto";
import { MetaDto, PageView } from "./response.dto";

export class AssessmentQuery extends ListDto {
  @ApiPropertyOptional({ enum: ["DRAFT", "PUBLISHED"] })
  @IsOptional()
  @IsIn(["DRAFT", "PUBLISHED"])
  status?: string;
}
export class GradeSnapshotView {
  @ApiProperty({ type: String, nullable: true }) score!: string | null;
  @ApiProperty() comment!: string;
}
export class GradeChangeView {
  @ApiProperty() id!: string;
  @ApiProperty() studentId!: string;
  @ApiProperty() fullName!: string;
  @ApiProperty() version!: number;
  @ApiProperty({ type: GradeSnapshotView, nullable: true })
  beforeValue!: GradeSnapshotView | null;
  @ApiProperty({ type: GradeSnapshotView }) afterValue!: GradeSnapshotView;
  @ApiProperty() actorUserId!: string;
  @ApiProperty({ type: String, nullable: true }) actorDisplayName!:
    | string
    | null;
  @ApiProperty({ type: String, nullable: true }) traceId!: string | null;
  @ApiProperty() recordedAt!: string;
}
export class GradeHistoryResponse {
  @ApiProperty({ type: [GradeChangeView] }) data!: GradeChangeView[];
  @ApiProperty({ type: PageView }) page!: PageView;
  @ApiProperty({ type: MetaDto }) meta!: MetaDto;
}
export class GradeLifecycleView {
  @ApiProperty() id!: string;
  @ApiProperty() action!: string;
  @ApiProperty({ type: Number, nullable: true }) version!: number | null;
  @ApiProperty({ type: String, nullable: true }) actorUserId!: string | null;
  @ApiProperty({ type: String, nullable: true }) actorDisplayName!:
    | string
    | null;
  @ApiProperty({ type: String, nullable: true }) reason!: string | null;
  @ApiProperty() traceId!: string;
  @ApiProperty() recordedAt!: string;
}
export class GradeLifecycleResponse {
  @ApiProperty({ type: [GradeLifecycleView] }) data!: GradeLifecycleView[];
  @ApiProperty({ type: PageView }) page!: PageView;
  @ApiProperty({ type: MetaDto }) meta!: MetaDto;
}
