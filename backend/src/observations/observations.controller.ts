import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { CreateObservationDto } from './dto/create-observation.dto';
import { ObservationsService } from './observations.service';

@ApiTags('observations')
@ApiBearerAuth()
@Controller('observations')
export class ObservationsController {
  constructor(private readonly observationsService: ObservationsService) {}

  @Post()
  create(@CurrentUser('id') userId: string, @Body() dto: CreateObservationDto) {
    return this.observationsService.create(userId, dto);
  }

  @Get()
  findAll(@CurrentUser('id') userId: string) {
    return this.observationsService.findAll(userId);
  }

  @Get(':id')
  findOne(
    @CurrentUser('id') userId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.observationsService.findOne(userId, id);
  }

  @Post(':id/reprocess')
  reprocess(
    @CurrentUser('id') userId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.observationsService.reprocess(userId, id);
  }
}
