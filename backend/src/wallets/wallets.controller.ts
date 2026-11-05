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
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { CreateWalletDto } from './dto/create-wallet.dto';
import { UpdateWalletDto } from './dto/update-wallet.dto';
import { WalletsService } from './wallets.service';

@ApiTags('wallets')
@ApiBearerAuth()
@Controller('wallets')
export class WalletsController {
  constructor(private readonly walletsService: WalletsService) {}

  @Post()
  create(
    @CurrentUser('id') userId: string,
    @Body() createWalletDto: CreateWalletDto,
  ) {
    return this.walletsService.create(userId, createWalletDto);
  }

  @Get()
  findAll(
    @CurrentUser('id') userId: string,
    @Query('includeArchived') includeArchived?: string,
  ) {
    return this.walletsService.findAll(userId, includeArchived === 'true');
  }

  @Get(':id')
  findOne(
    @CurrentUser('id') userId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.walletsService.findOne(userId, id);
  }

  @Patch(':id')
  update(
    @CurrentUser('id') userId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() updateWalletDto: UpdateWalletDto,
  ) {
    return this.walletsService.update(userId, id, updateWalletDto);
  }

  @Delete(':id')
  remove(
    @CurrentUser('id') userId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.walletsService.archive(userId, id);
  }
}
