import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Req,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { QueryPendingReviewDto } from './dto/query-pending-review.dto';
import { ResolvePendingReviewDto } from './dto/resolve-pending-review.dto';
import { PendingReviewsService } from './pending-reviews.service';

@ApiTags('pending-reviews')
@ApiBearerAuth()
@Controller('pending-reviews')
export class PendingReviewsController {
  constructor(private readonly service: PendingReviewsService) {}

  @Get()
  findAll(@Req() req: any, @Query() query: QueryPendingReviewDto) {
    return this.service.findAll(req.user.id, query);
  }

  @Get(':id')
  findOne(@Req() req: any, @Param('id', ParseUUIDPipe) id: string) {
    return this.service.findOne(req.user.id, id);
  }

  @Post(':id/resolve')
  resolve(
    @Req() req: any,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ResolvePendingReviewDto,
  ) {
    return this.service.resolve(req.user.id, id, dto);
  }
}
