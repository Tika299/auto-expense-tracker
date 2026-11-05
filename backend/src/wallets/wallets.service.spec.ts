import { Test, TestingModule } from '@nestjs/testing';
import { DATABASE } from '../database/database.module';
import { WalletsService } from './wallets.service';

describe('WalletsService', () => {
  let service: WalletsService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [WalletsService, { provide: DATABASE, useValue: {} }],
    }).compile();

    service = module.get<WalletsService>(WalletsService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
