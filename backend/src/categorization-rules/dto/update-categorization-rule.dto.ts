import { PartialType } from '@nestjs/swagger';
import { CreateCategorizationRuleDto } from './create-categorization-rule.dto';

export class UpdateCategorizationRuleDto extends PartialType(
  CreateCategorizationRuleDto,
) {}
