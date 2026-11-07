import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Req,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CategorizationRulesService } from './categorization-rules.service';
import { CreateCategorizationRuleDto } from './dto/create-categorization-rule.dto';
import { UpdateCategorizationRuleDto } from './dto/update-categorization-rule.dto';
import { QueryCategorizationRuleDto } from './dto/query-categorization-rule.dto';

@ApiTags('categorization-rules')
@ApiBearerAuth()
@Controller('categorization-rules')
export class CategorizationRulesController {
  constructor(private readonly service: CategorizationRulesService) {}

  @Post()
  create(@Req() req: any, @Body() dto: CreateCategorizationRuleDto) {
    return this.service.create(req.user.id, dto);
  }

  @Get()
  findAll(@Req() req: any, @Query() query: QueryCategorizationRuleDto) {
    return this.service.findAll(req.user.id, query);
  }

  @Get(':id')
  findOne(@Req() req: any, @Param('id', ParseUUIDPipe) id: string) {
    return this.service.findOne(req.user.id, id);
  }

  @Patch(':id')
  update(
    @Req() req: any,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateCategorizationRuleDto,
  ) {
    return this.service.update(req.user.id, id, dto);
  }

  @Delete(':id')
  remove(@Req() req: any, @Param('id', ParseUUIDPipe) id: string) {
    return this.service.remove(req.user.id, id);
  }
}
