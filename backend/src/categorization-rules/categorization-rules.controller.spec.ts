import { Test, TestingModule } from '@nestjs/testing';
import { CategorizationRulesController } from './categorization-rules.controller';
import { CategorizationRulesService } from './categorization-rules.service';

describe('CategorizationRulesController', () => {
  let controller: CategorizationRulesController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [CategorizationRulesController],
      providers: [
        {
          provide: CategorizationRulesService,
          useValue: {},
        },
      ],
    }).compile();

    controller = module.get<CategorizationRulesController>(
      CategorizationRulesController,
    );
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
