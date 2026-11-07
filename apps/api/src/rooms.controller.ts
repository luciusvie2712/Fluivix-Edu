import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Query,
  Req,
  UseGuards,
} from "@nestjs/common";
import { ApiOkResponse, ApiTags } from "@nestjs/swagger";
import { AccessGuard, TenantPermission } from "./guards";
import { requestClaims } from "./auth.controller";
import type { ApiRequest } from "./http";
import { RoomsService } from "./rooms.service";
import {
  RoomDetailResponse,
  RoomHistoryQuery,
  RoomHistoryResponse,
  RoomUpdateInput,
} from "./rooms.dto";

// Existing TeachingController GET/POST /rooms remain to preserve operationIds.
@ApiTags("rooms")
@Controller("rooms")
@UseGuards(AccessGuard)
export class RoomsController {
  constructor(private readonly service: RoomsService) {}
  @Get(":id")
  @TenantPermission("teaching.manage")
  @ApiOkResponse({ type: RoomDetailResponse })
  read(@Req() r: ApiRequest, @Param("id", ParseUUIDPipe) id: string) {
    return this.service.read(requestClaims(r), id);
  }
  @Patch(":id")
  @TenantPermission("teaching.manage")
  @ApiOkResponse({ type: RoomDetailResponse })
  update(
    @Req() r: ApiRequest,
    @Param("id", ParseUUIDPipe) id: string,
    @Body() input: RoomUpdateInput,
  ) {
    return this.service.update(requestClaims(r), id, input, r.traceId);
  }
  @Get(":id/history")
  @TenantPermission("teaching.manage")
  @ApiOkResponse({ type: RoomHistoryResponse })
  history(
    @Req() r: ApiRequest,
    @Param("id", ParseUUIDPipe) id: string,
    @Query() q: RoomHistoryQuery,
  ) {
    return this.service.history(requestClaims(r), id, q);
  }
}
