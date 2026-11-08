import { ApiProperty } from "@nestjs/swagger";
import { IsISO8601, Matches } from "class-validator";
import { ListDto } from "./auth.dto";
import { MetaDto, PageView } from "./response.dto";

export class StudentAttendanceQuery extends ListDto {
  @ApiProperty({ format: "date" })
  @Matches(/^(?!0000)\d{4}-\d{2}-\d{2}$/)
  @IsISO8601({ strict: true })
  from!: string;
  @ApiProperty({ format: "date" })
  @Matches(/^(?!0000)\d{4}-\d{2}-\d{2}$/)
  @IsISO8601({ strict: true })
  to!: string;
}
export class StudentEnrollmentHistoryView {
  @ApiProperty() id!: string;
  @ApiProperty() classId!: string;
  @ApiProperty() classCode!: string;
  @ApiProperty() className!: string;
  @ApiProperty() classStatus!: string;
  @ApiProperty() status!: string;
  @ApiProperty() version!: number;
  @ApiProperty({ format: "date" }) joinedAt!: string;
  @ApiProperty({ type: String, format: "date", nullable: true }) leftAt!:
    | string
    | null;
}
export class StudentEnrollmentHistoryResponse {
  @ApiProperty({ type: [StudentEnrollmentHistoryView] })
  data!: StudentEnrollmentHistoryView[];
  @ApiProperty({ type: PageView }) page!: PageView;
  @ApiProperty({ type: MetaDto }) meta!: MetaDto;
}
export class StudentAttendanceHistoryView {
  @ApiProperty() sessionId!: string;
  @ApiProperty() classId!: string;
  @ApiProperty() classCode!: string;
  @ApiProperty() className!: string;
  @ApiProperty({ format: "date" }) scheduledDate!: string;
  @ApiProperty({ format: "date-time" }) startsAt!: string;
  @ApiProperty({ format: "date-time" }) endsAt!: string;
  @ApiProperty({
    enum: ["PRESENT", "LATE", "ABSENT_EXCUSED", "ABSENT_UNEXCUSED"],
  })
  status!: string;
}
export class StudentAttendanceHistoryResponse {
  @ApiProperty({ type: [StudentAttendanceHistoryView] })
  data!: StudentAttendanceHistoryView[];
  @ApiProperty({ type: PageView }) page!: PageView;
  @ApiProperty({ type: MetaDto }) meta!: MetaDto;
}
