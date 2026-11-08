import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { jest } from '@jest/globals';
import { PendingReviewsService } from './pending-reviews.service';

const userId = '11111111-1111-4111-8111-111111111111';
const otherUserId = '22222222-2222-4222-8222-222222222222';
const walletId = '33333333-3333-4333-8333-333333333333';
const reviewId = '44444444-4444-4444-8444-444444444444';
const primaryId = '55555555-5555-4555-8555-555555555555';
const relatedId = '66666666-6666-4666-8666-666666666666';
const observationId = '77777777-7777-4777-8777-777777777777';
const categoryId = '88888888-8888-4888-8888-888888888888';

type QueryTerminal = 'where' | 'orderBy' | 'limit' | 'offset' | 'for';

/**
 * Mô phỏng Drizzle query chain.
 *
 * Ví dụ:
 * queryChain(result, 'limit')
 * tương ứng query kết thúc bằng .limit().
 */
function queryChain(result: unknown[], terminal: QueryTerminal) {
  const chain: any = {};

  const next = (method: QueryTerminal) =>
    method === terminal ? Promise.resolve(result) : chain;

  chain.from = jest.fn(() => chain);
  chain.innerJoin = jest.fn(() => chain);
  chain.where = jest.fn(() => next('where'));
  chain.orderBy = jest.fn(() => next('orderBy'));
  chain.limit = jest.fn(() => next('limit'));
  chain.offset = jest.fn(() => next('offset'));
  chain.for = jest.fn(() => next('for'));

  return chain;
}

/**
 * Nếu returning=true:
 *
 * update().set().where().returning()
 *
 * Nếu returning=false:
 *
 * update().set().where()
 */
function updateChain(result: unknown[] = [], returning = false) {
  const chain: any = {};

  chain.set = jest.fn(() => chain);

  chain.where = jest.fn(() => (returning ? chain : Promise.resolve(result)));

  chain.returning = jest.fn(async () => result);

  return chain;
}

function makePrimaryTransaction() {
  return {
    id: primaryId,
    userId,
    walletId,
    categoryId: null,
    amount: 100000,
    direction: 'OUT',
    kind: 'NORMAL',
    reviewStatus: 'CONFIRMED',
    transactionTime: new Date('2026-11-07T10:00:00+07:00'),
    referenceCode: 'PRIMARY-REF',
    merchantName: 'GRAB',
    counterpartyAccount: null,
    categorizationSource: 'NONE',
    matchedRuleId: null,
    note: null,
    origin: 'PARSER',
    createdAt: new Date('2026-11-07T10:00:00+07:00'),
    updatedAt: new Date('2026-11-07T10:00:00+07:00'),
  };
}

function makeRelatedTransaction() {
  return {
    ...makePrimaryTransaction(),
    id: relatedId,
    reviewStatus: 'PENDING_REVIEW',
    transactionTime: new Date('2026-11-07T10:00:30+07:00'),
    referenceCode: 'RELATED-REF',
  };
}

function makePendingLink() {
  return {
    id: reviewId,
    userId,
    primaryTransactionId: primaryId,
    relatedTransactionId: relatedId,
    linkType: 'POSSIBLE_DUPLICATE',
    status: 'PENDING_REVIEW',
    confidence: 75,
    metadata: {
      reason: 'AMOUNT_AND_TIME_MATCH',
    },
    createdAt: new Date('2026-11-07T10:01:00+07:00'),
    resolvedAt: null,
  };
}

function makeObservation() {
  return {
    id: observationId,
    userId,
    walletId,
    transactionId: relatedId,
    source: 'MBBANK',
    channel: 'EMAIL',
    rawText: 'Thanh toán GRAB 100.000 VND',
    observedAt: new Date('2026-11-07T10:00:30+07:00'),
    status: 'PENDING_REVIEW',
  };
}

describe('PendingReviewsService', () => {
  let db: any;
  let service: PendingReviewsService;
  let categorizationService: any;

  beforeEach(() => {
    db = {
      select: jest.fn(),
      update: jest.fn(),
      transaction: jest.fn(),
    };

    categorizationService = {
      categorize: jest.fn(async () => ({
        categoryId,
        source: 'DEFAULT_KEYWORD',
        matchedRuleId: null,
      })),
    };

    service = new PendingReviewsService(db, categorizationService);
  });

  it('returns pending review list', async () => {
    const expected = [
      {
        id: reviewId,
        linkType: 'POSSIBLE_DUPLICATE',
        status: 'PENDING_REVIEW',
        confidence: 75,
        metadata: {
          reason: 'AMOUNT_AND_TIME_MATCH',
        },
        createdAt: new Date(),
        primaryTransaction: makePrimaryTransaction(),
        relatedTransaction: makeRelatedTransaction(),
      },
    ];

    db.select.mockReturnValueOnce(queryChain(expected, 'offset'));

    const result = await service.findAll(userId, {
      limit: 20,
      offset: 0,
    });

    expect(result).toEqual(expected);
    expect(db.select).toHaveBeenCalledTimes(1);
  });

  it('returns review detail with observations', async () => {
    const review = {
      id: reviewId,
      linkType: 'POSSIBLE_DUPLICATE',
      status: 'PENDING_REVIEW',
      confidence: 75,
      metadata: {},
      createdAt: new Date(),
      resolvedAt: null,
      primaryTransaction: makePrimaryTransaction(),
      relatedTransaction: makeRelatedTransaction(),
    };

    const observation = makeObservation();

    db.select
      .mockReturnValueOnce(queryChain([review], 'limit'))
      .mockReturnValueOnce(queryChain([observation], 'orderBy'));

    const result = await service.findOne(userId, reviewId);

    expect(result).toEqual({
      ...review,
      observations: [observation],
    });

    expect(db.select).toHaveBeenCalledTimes(2);
  });

  it('throws NotFoundException when review does not belong to user', async () => {
    db.select.mockReturnValueOnce(queryChain([], 'limit'));

    await expect(service.findOne(otherUserId, reviewId)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('CONFIRM_DUPLICATE excludes related transaction', async () => {
    const link = makePendingLink();
    const primary = makePrimaryTransaction();
    const related = makeRelatedTransaction();

    const updatedLink = {
      ...link,
      status: 'USER_CONFIRMED',
      resolvedAt: new Date(),
    };

    const linkQuery = queryChain([link], 'for');
    const transactionsQuery = queryChain([primary, related], 'where');

    const primaryUpdate = updateChain();
    const relatedUpdate = updateChain();
    const observationUpdate = updateChain();
    const linkUpdate = updateChain([updatedLink], true);

    const tx = {
      select: jest
        .fn()
        .mockReturnValueOnce(linkQuery)
        .mockReturnValueOnce(transactionsQuery),

      update: jest
        .fn()
        .mockReturnValueOnce(primaryUpdate)
        .mockReturnValueOnce(relatedUpdate)
        .mockReturnValueOnce(observationUpdate)
        .mockReturnValueOnce(linkUpdate),
    };

    db.transaction.mockImplementation(
      async (callback: (value: any) => unknown) => callback(tx),
    );

    const result = await service.resolve(userId, reviewId, {
      decision: 'CONFIRM_DUPLICATE',
      note: 'Cùng một giao dịch',
    });

    expect(result.decision).toBe('CONFIRM_DUPLICATE');

    expect(primaryUpdate.set).toHaveBeenCalledWith(
      expect.objectContaining({
        reviewStatus: 'CONFIRMED',
      }),
    );

    expect(relatedUpdate.set).toHaveBeenCalledWith(
      expect.objectContaining({
        reviewStatus: 'EXCLUDED',
        categoryId: null,
        categorizationSource: 'NONE',
        matchedRuleId: null,
      }),
    );

    expect(observationUpdate.set).toHaveBeenCalledWith({
      transactionId: primaryId,
      status: 'DUPLICATE',
    });

    expect(linkUpdate.set).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'USER_CONFIRMED',
        metadata: expect.objectContaining({
          decision: 'CONFIRM_DUPLICATE',
          resolutionNote: 'Cùng một giao dịch',
        }),
      }),
    );

    expect(categorizationService.categorize).not.toHaveBeenCalled();
  });

  it('KEEP_BOTH confirms and categorizes related transaction', async () => {
    const link = makePendingLink();
    const primary = makePrimaryTransaction();
    const related = makeRelatedTransaction();
    const observation = makeObservation();

    const updatedLink = {
      ...link,
      status: 'USER_REJECTED',
      resolvedAt: new Date(),
    };

    const linkQuery = queryChain([link], 'for');
    const transactionsQuery = queryChain([primary, related], 'where');
    const observationQuery = queryChain([observation], 'limit');

    const relatedUpdate = updateChain();
    const observationUpdate = updateChain();
    const linkUpdate = updateChain([updatedLink], true);

    const tx = {
      select: jest
        .fn()
        .mockReturnValueOnce(linkQuery)
        .mockReturnValueOnce(transactionsQuery)
        .mockReturnValueOnce(observationQuery),

      update: jest
        .fn()
        .mockReturnValueOnce(relatedUpdate)
        .mockReturnValueOnce(observationUpdate)
        .mockReturnValueOnce(linkUpdate),
    };

    db.transaction.mockImplementation(
      async (callback: (value: any) => unknown) => callback(tx),
    );

    const result = await service.resolve(userId, reviewId, {
      decision: 'KEEP_BOTH',
      note: 'Hai giao dịch độc lập',
    });

    expect(result.decision).toBe('KEEP_BOTH');

    expect(categorizationService.categorize).toHaveBeenCalledWith(
      expect.objectContaining({
        userId,
        direction: 'OUT',
        kind: 'NORMAL',
        reviewStatus: 'CONFIRMED',
        merchantName: related.merchantName,
        rawText: observation.rawText,
      }),
      tx,
    );

    expect(relatedUpdate.set).toHaveBeenCalledWith(
      expect.objectContaining({
        reviewStatus: 'CONFIRMED',
        categoryId,
        categorizationSource: 'DEFAULT_KEYWORD',
        matchedRuleId: null,
      }),
    );

    expect(observationUpdate.set).toHaveBeenCalledWith({
      status: 'PARSED',
    });

    expect(linkUpdate.set).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'USER_REJECTED',
        metadata: expect.objectContaining({
          decision: 'KEEP_BOTH',
          resolutionNote: 'Hai giao dịch độc lập',
        }),
      }),
    );
  });

  it('rejects an already resolved review', async () => {
    const resolvedLink = {
      ...makePendingLink(),
      status: 'USER_CONFIRMED',
    };

    const tx = {
      select: jest.fn(() => queryChain([resolvedLink], 'for')),
      update: jest.fn(),
    };

    db.transaction.mockImplementation(
      async (callback: (value: any) => unknown) => callback(tx),
    );

    await expect(
      service.resolve(userId, reviewId, {
        decision: 'CONFIRM_DUPLICATE',
      }),
    ).rejects.toBeInstanceOf(ConflictException);

    expect(tx.update).not.toHaveBeenCalled();
  });

  it('rejects an unsupported link type', async () => {
    const internalTransferLink = {
      ...makePendingLink(),
      linkType: 'INTERNAL_TRANSFER',
    };

    const tx = {
      select: jest.fn(() => queryChain([internalTransferLink], 'for')),
      update: jest.fn(),
    };

    db.transaction.mockImplementation(
      async (callback: (value: any) => unknown) => callback(tx),
    );

    await expect(
      service.resolve(userId, reviewId, {
        decision: 'CONFIRM_DUPLICATE',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(tx.update).not.toHaveBeenCalled();
  });
});
