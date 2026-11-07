import { Inject, Injectable } from '@nestjs/common';
import { and, asc, eq, inArray } from 'drizzle-orm';
import { DATABASE, type Database } from '../database/database.module';
import { categories, categorizationRules } from '../database/schema';
import { DEFAULT_CATEGORY_KEYWORDS } from './default-category-keywords';
import type {
  CategorizationDecision,
  CategorizationInput,
} from './categorization.types';

type QueryExecutor = Pick<Database, 'select'>;

const NONE_DECISION: CategorizationDecision = {
  categoryId: null,
  source: 'NONE',
  matchedRuleId: null,
};

@Injectable()
export class CategorizationService {
  constructor(
    @Inject(DATABASE)
    private readonly db: Database,
  ) {}

  /**
   * Chuẩn hóa chữ để so sánh không phân biệt:
   * - hoa/thường
   * - dấu tiếng Việt
   * - khoảng trắng
   * - ký tự đặc biệt
   */
  normalizeText(value: string | null | undefined): string | null {
    if (!value) {
      return null;
    }

    const normalized = value
      .normalize('NFD')
      .replace(/[Đđ]/g, 'D')
      .replace(/\p{M}/gu, '')
      .toUpperCase()
      .replace(/[^A-Z0-9]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();

    return normalized || null;
  }

  /**
   * Tài khoản có thể chứa số, chữ hoặc dấu cách.
   * Khi so sánh chỉ giữ A-Z và 0-9.
   */
  normalizeAccount(value: string | null | undefined): string | null {
    if (!value) {
      return null;
    }

    const normalized = value
      .normalize('NFKC')
      .toUpperCase()
      .replace(/[^A-Z0-9]/g, '');

    return normalized || null;
  }

  private matches(
    source: string | null,
    pattern: string | null,
    operator: 'EXACT' | 'CONTAINS',
  ): boolean {
    if (!source || !pattern) {
      return false;
    }

    if (operator === 'EXACT') {
      return source === pattern;
    }

    return source.includes(pattern);
  }

  async categorize(
    input: CategorizationInput,
    executor: QueryExecutor = this.db,
  ): Promise<CategorizationDecision> {
    /**
     * Chuyển tiền nội bộ không phải thu nhập hoặc chi tiêu,
     * vì vậy không gắn danh mục chi tiêu.
     */
    if (input.kind === 'INTERNAL_TRANSFER') {
      return NONE_DECISION;
    }

    /**
     * Giao dịch chưa được xác nhận có thể là duplicate.
     * Chỉ phân loại sau khi nó được CONFIRMED.
     */
    if (input.reviewStatus === 'PENDING_REVIEW') {
      return NONE_DECISION;
    }

    const userRuleDecision = await this.matchUserRules(input, executor);

    if (userRuleDecision) {
      return userRuleDecision;
    }

    const defaultDecision = await this.matchDefaultKeywords(input, executor);

    return defaultDecision ?? NONE_DECISION;
  }

  private async matchUserRules(
    input: CategorizationInput,
    executor: QueryExecutor,
  ): Promise<CategorizationDecision | null> {
    const rules = await executor
      .select({
        id: categorizationRules.id,
        categoryId: categorizationRules.categoryId,
        matchField: categorizationRules.matchField,
        operator: categorizationRules.operator,
        pattern: categorizationRules.pattern,
        priority: categorizationRules.priority,
      })
      .from(categorizationRules)
      .innerJoin(categories, eq(categories.id, categorizationRules.categoryId))
      .where(
        and(
          eq(categorizationRules.userId, input.userId),
          eq(categorizationRules.isActive, true),
          eq(categories.isArchived, false),
          inArray(categories.scope, [input.direction, 'BOTH']),
        ),
      )
      .orderBy(
        asc(categorizationRules.priority),
        asc(categorizationRules.createdAt),
      );

    for (const rule of rules) {
      const source =
        rule.matchField === 'MERCHANT_NAME'
          ? this.normalizeText(input.merchantName)
          : this.normalizeAccount(input.counterpartyAccount);

      const pattern =
        rule.matchField === 'MERCHANT_NAME'
          ? this.normalizeText(rule.pattern)
          : this.normalizeAccount(rule.pattern);

      if (this.matches(source, pattern, rule.operator)) {
        return {
          categoryId: rule.categoryId,
          source: 'USER_RULE',
          matchedRuleId: rule.id,
        };
      }
    }

    return null;
  }

  private async matchDefaultKeywords(
    input: CategorizationInput,
    executor: QueryExecutor,
  ): Promise<CategorizationDecision | null> {
    const searchableText = this.normalizeText(
      [input.merchantName ?? '', input.rawText ?? ''].join(' '),
    );

    if (!searchableText) {
      return null;
    }

    const keywordRule = DEFAULT_CATEGORY_KEYWORDS.find((rule) => {
      if (rule.direction !== input.direction) {
        return false;
      }

      return rule.keywords.some((keyword) => {
        const normalizedKeyword = this.normalizeText(keyword);

        return (
          normalizedKeyword !== null &&
          searchableText.includes(normalizedKeyword)
        );
      });
    });

    if (!keywordRule) {
      return null;
    }

    const [category] = await executor
      .select({
        id: categories.id,
      })
      .from(categories)
      .where(
        and(
          eq(categories.userId, input.userId),
          eq(categories.name, keywordRule.categoryName),
          eq(categories.isArchived, false),
          inArray(categories.scope, [input.direction, 'BOTH']),
        ),
      )
      .limit(1);

    if (!category) {
      return null;
    }

    return {
      categoryId: category.id,
      source: 'DEFAULT_KEYWORD',
      matchedRuleId: null,
    };
  }
}
