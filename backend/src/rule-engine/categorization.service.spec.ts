import { jest } from '@jest/globals';
import { CategorizationService } from './categorization.service';

function queryChain(result: unknown[]) {
  const chain: any = {};

  chain.from = jest.fn(() => chain);
  chain.innerJoin = jest.fn(() => chain);
  chain.where = jest.fn(() => chain);
  chain.orderBy = jest.fn(async () => result);
  chain.limit = jest.fn(async () => result);

  return chain;
}

describe('CategorizationService', () => {
  let service: CategorizationService;
  let db: any;

  beforeEach(() => {
    db = {
      select: jest.fn(),
    };

    service = new CategorizationService(db);
  });

  it('skips internal transfers', async () => {
    const result = await service.categorize({
      userId: 'user-id',
      direction: 'OUT',
      kind: 'INTERNAL_TRANSFER',
      reviewStatus: 'CONFIRMED',
      merchantName: 'GRABFOOD',
      counterpartyAccount: null,
    });

    expect(result).toEqual({
      categoryId: null,
      source: 'NONE',
      matchedRuleId: null,
    });

    expect(db.select).not.toHaveBeenCalled();
  });

  it('skips transactions pending review', async () => {
    const result = await service.categorize({
      userId: 'user-id',
      direction: 'OUT',
      kind: 'NORMAL',
      reviewStatus: 'PENDING_REVIEW',
      merchantName: 'GRABFOOD',
      counterpartyAccount: null,
    });

    expect(result).toEqual({
      categoryId: null,
      source: 'NONE',
      matchedRuleId: null,
    });

    expect(db.select).not.toHaveBeenCalled();
  });

  it('uses a matching user rule first', async () => {
    db.select.mockReturnValueOnce(
      queryChain([
        {
          id: 'rule-id',
          categoryId: 'food-category-id',
          matchField: 'MERCHANT_NAME',
          operator: 'CONTAINS',
          pattern: 'GRABFOOD',
          priority: 1,
        },
      ]),
    );

    const result = await service.categorize({
      userId: 'user-id',
      direction: 'OUT',
      kind: 'NORMAL',
      reviewStatus: 'CONFIRMED',
      merchantName: 'Thanh toán GrabFood',
      counterpartyAccount: null,
    });

    expect(result).toEqual({
      categoryId: 'food-category-id',
      source: 'USER_RULE',
      matchedRuleId: 'rule-id',
    });

    expect(db.select).toHaveBeenCalledTimes(1);
  });

  it('falls back to default keywords', async () => {
    // Query thứ nhất: không có user rule.
    db.select.mockReturnValueOnce(queryChain([]));

    // Query thứ hai: tìm thấy category "Ăn uống".
    db.select.mockReturnValueOnce(
      queryChain([
        {
          id: 'food-category-id',
        },
      ]),
    );

    const result = await service.categorize({
      userId: 'user-id',
      direction: 'OUT',
      kind: 'NORMAL',
      reviewStatus: 'CONFIRMED',
      merchantName: 'GRABFOOD',
      counterpartyAccount: null,
    });

    expect(result).toEqual({
      categoryId: 'food-category-id',
      source: 'DEFAULT_KEYWORD',
      matchedRuleId: null,
    });
  });

  it('returns NONE when nothing matches', async () => {
    db.select.mockReturnValueOnce(queryChain([]));

    const result = await service.categorize({
      userId: 'user-id',
      direction: 'OUT',
      kind: 'NORMAL',
      reviewStatus: 'CONFIRMED',
      merchantName: 'UNKNOWN MERCHANT',
      counterpartyAccount: null,
    });

    expect(result).toEqual({
      categoryId: null,
      source: 'NONE',
      matchedRuleId: null,
    });
  });
});
