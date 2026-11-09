import {
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { jest } from '@jest/globals';
import { ObservationsService } from './observations.service';
import { CreateObservationDto } from './dto/create-observation.dto';

const userId = '88689eac-926c-4742-9e65-1e4a44f9fa55';
const walletId = 'ea71c41b-38e4-40ac-a523-3b993d2105fd';
const observationId = '83c2a5d2-4762-4f33-86f9-acc05827984e';
const transactionId = 'decd65cd-9078-4d4e-bf3f-19d0a262e86e';

const validDto: CreateObservationDto = {
  walletId,
  source: 'VIETCOMBANK',
  channel: 'ANDROID_NOTIFICATION',
  rawText:
    'Số dư TK VCB 9000000001 +80,000 VND lúc 14-10-2026 12:47:59. Số dư 1,159,903 VND. Ref 9000TPBVI0000001.NGUYEN VAN A chuyen khoan nhanh qua Zalo.20261014.124758.90000000001.NGUYEN VAN A.970423',
  rawPayload: { fixtureId: 'vcb-in-001', test: true },
  observedAt: '2026-10-14T12:48:00+07:00',
};

const counterpartyDto: CreateObservationDto = {
  ...validDto,
  rawText:
    'Số dư TK VCB 9000000001 -40,000 VND lúc 14-10-2026 10:51:42. Số dư 1,079,903 VND. Ref MBVCB.90000000001.9000BFTV00000001.NGUYEN VAN A chuyen khoan nhanh qua Z....CT tu 9000000001 NGUYEN VAN A toi 9000000002 NGUYEN VAN B tai TECHCOMBANK',
  rawPayload: { fixtureId: 'vcb-out-with-counterparty-001', test: true },
  observedAt: '2026-10-14T10:51:47+07:00',
};

function queryChain(result: unknown[]) {
  const chain: any = {};
  chain.from = jest.fn(() => chain);
  chain.where = jest.fn(() => chain);
  chain.limit = jest.fn(async () => result);
  chain.orderBy = jest.fn(async () => result);
  return chain;
}

function insertChain(result: unknown[]) {
  const chain: any = {};
  chain.values = jest.fn(() => chain);
  chain.onConflictDoNothing = jest.fn(() => chain);
  chain.returning = jest.fn(async () => result);
  return chain;
}

function updateChain(result: unknown[]) {
  const chain: any = {};
  chain.set = jest.fn(() => chain);
  chain.where = jest.fn(() => chain);
  chain.returning = jest.fn(async () => result);
  return chain;
}

function linkInsertChain(result: unknown[]) {
  const chain: any = {};

  chain.values = jest.fn(() => chain);
  chain.onConflictDoNothing = jest.fn(() => chain);
  chain.returning = jest.fn(async () => result);

  return chain;
}

function makeObservation(
  status:
    | 'PENDING'
    | 'PARSED'
    | 'REJECTED'
    | 'DUPLICATE'
    | 'PENDING_REVIEW' = 'PENDING',
) {
  return {
    id: observationId,
    userId,
    walletId,
    transactionId: status === 'PARSED' ? transactionId : null,
    sourceMessageId: null,
    normalizedContentHash: 'normalized-content-hash',
    source: validDto.source,
    channel: validDto.channel,
    rawText: validDto.rawText,
    rawPayload: validDto.rawPayload,
    payloadHash: 'payload-hash',
    observedAt: new Date(validDto.observedAt),
    status,
    parserRule: status === 'PARSED' ? 'vcb-notification-v1' : null,
    parseErrorCode: status === 'REJECTED' ? 'UNSUPPORTED_FORMAT' : null,
    createdAt: new Date('2026-11-03T09:22:25.580Z'),
  };
}

describe('ObservationsService', () => {
  let db: any;
  let service: ObservationsService;
  let deduplicationService: any;
  let categorizationService: {
    categorize: jest.Mock;
  };
  let reconciliationService: {
    evaluate: jest.Mock;
  };

  beforeEach(() => {
    db = {
      select: jest.fn(),
      insert: jest.fn(),
      update: jest.fn(),
      transaction: jest.fn(),
    };

    deduplicationService = {
      findExistingObservation: jest.fn(async () => ({
        duplicate: false,
        matchedBy: null,
        observation: null,
        payloadHash: 'payload-hash',
        normalizedContentHash: 'normalized-content-hash',
      })),

      evaluateTransaction: jest.fn(async () => ({
        kind: 'NO_DUPLICATE',
      })),
    };

    reconciliationService = {
      evaluate: jest.fn(async () => ({
        kind: 'NO_MATCH',
      })),
    };

    categorizationService = {
      categorize: jest.fn(async () => ({
        categoryId: null,
        source: 'NONE',
        matchedRuleId: null,
      })),
    };

    /*
     * Chỉ tạo ObservationsService sau khi tất cả mock
     * dependency đã được khởi tạo.
     */
    service = new ObservationsService(
      db,
      deduplicationService as any,
      reconciliationService as any,
      categorizationService as any,
    );
  });

  function mockSuccessfulTransaction(overrides: Record<string, unknown> = {}) {
    const createdTransaction = {
      id: transactionId,
      userId,
      walletId,

      categoryId: null,

      amount: 80000,
      direction: 'IN',

      kind: 'NORMAL',
      reviewStatus: 'CONFIRMED',

      categorizationSource: 'NONE',
      matchedRuleId: null,

      origin: 'PARSER',

      // Test có thể truyền giá trị khác để ghi đè.
      ...overrides,
    };

    const parsedObservation = {
      ...makeObservation('PARSED'),
      transactionId,
    };

    const txInsert = insertChain([createdTransaction]);
    const txUpdate = updateChain([parsedObservation]);

    const tx = {
      insert: jest.fn(() => txInsert),
      update: jest.fn(() => txUpdate),
    };

    db.transaction.mockImplementation((callback: (value: any) => unknown) =>
      callback(tx),
    );

    return {
      createdTransaction,
      parsedObservation,
      txInsert,
      txUpdate,
    };
  }

  it('stores a valid observation and creates a PARSER transaction', async () => {
    const pendingObservation = makeObservation();
    const observationInsert = insertChain([pendingObservation]);
    db.select.mockReturnValueOnce(
      queryChain([{ id: walletId, isArchived: false }]),
    );
    db.insert.mockReturnValueOnce(observationInsert);
    const { txInsert } = mockSuccessfulTransaction();

    const result = await service.create(userId, validDto);

    expect(result.duplicate).toBe(false);
    expect(result.observation.status).toBe('PARSED');
    if (!('transaction' in result)) {
      throw new Error('Expected a parsed transaction result');
    }
    expect(result.transaction.origin).toBe('PARSER');
    expect(txInsert.values).toHaveBeenCalledWith(
      expect.objectContaining({
        userId,
        walletId,
        amount: 80000,
        direction: 'IN',
        origin: 'PARSER',
      }),
    );
    expect(reconciliationService.evaluate).toHaveBeenCalledWith(
      expect.objectContaining({
        userId,
        walletId,
        source: 'VIETCOMBANK',
        amount: 80000,
        direction: 'IN',
      }),
      expect.anything(),
    );
  });

  it('returns an existing duplicate observation before parsing', async () => {
    const existing = makeObservation('PARSED');

    deduplicationService.findExistingObservation = jest.fn(async () => ({
      duplicate: true,
      matchedBy: 'PAYLOAD_HASH',
      observation: existing,
      payloadHash: existing.payloadHash,
      normalizedContentHash: existing.normalizedContentHash,
    }));

    db.select.mockReturnValueOnce(
      queryChain([
        {
          id: walletId,
          isArchived: false,
        },
      ]),
    );

    const result = await service.create(userId, validDto);

    expect(result).toEqual({
      duplicate: true,
      stage: 'OBSERVATION',
      matchedBy: 'PAYLOAD_HASH',
      observation: existing,
    });

    expect(db.insert).not.toHaveBeenCalled();
    expect(deduplicationService.evaluateTransaction).not.toHaveBeenCalled();
    expect(db.transaction).not.toHaveBeenCalled();
  });

  it('keeps unsupported input as REJECTED and creates no transaction', async () => {
    const pendingObservation = {
      ...makeObservation(),
      rawText: 'Mã OTP của quý khách là 123456',
    };
    const rejectedObservation = {
      ...pendingObservation,
      status: 'REJECTED',
      parseErrorCode: 'UNSUPPORTED_FORMAT',
    };
    const rejectedDto = {
      ...validDto,
      rawText: pendingObservation.rawText,
    };

    db.select.mockReturnValueOnce(
      queryChain([{ id: walletId, isArchived: false }]),
    );
    db.insert.mockReturnValueOnce(insertChain([pendingObservation]));
    db.update.mockReturnValueOnce(updateChain([rejectedObservation]));

    await expect(service.create(userId, rejectedDto)).rejects.toBeInstanceOf(
      UnprocessableEntityException,
    );
    expect(db.transaction).not.toHaveBeenCalled();
  });

  it('rejects a wallet that does not belong to the authenticated user', async () => {
    db.select.mockReturnValueOnce(queryChain([]));

    await expect(service.create(userId, validDto)).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(db.insert).not.toHaveBeenCalled();
  });

  it('can reprocess an observation left in PENDING', async () => {
    const pendingObservation = makeObservation();
    db.select
      .mockReturnValueOnce(queryChain([pendingObservation]))
      .mockReturnValueOnce(queryChain([{ id: walletId, isArchived: false }]));
    mockSuccessfulTransaction();

    const result = await service.reprocess(userId, observationId);

    expect(result.duplicate).toBe(false);

    if (result.duplicate) {
      throw new Error('Expected a newly created transaction.');
    }

    expect(result.observation.status).toBe('PARSED');
    expect(result.transaction.id).toBe(transactionId);
  });

  it('attaches an exact duplicate observation to the canonical transaction', async () => {
    const pendingObservation = makeObservation();

    const duplicateObservation = {
      ...pendingObservation,
      status: 'DUPLICATE',
      transactionId,
      parserRule: 'vcb-notification-v1',
    };

    db.select.mockReturnValueOnce(
      queryChain([
        {
          id: walletId,
          isArchived: false,
        },
      ]),
    );

    db.insert.mockReturnValueOnce(insertChain([pendingObservation]));

    deduplicationService.evaluateTransaction = jest.fn(async () => ({
      kind: 'EXACT_DUPLICATE',
      canonicalTransactionId: transactionId,
      reason: 'REFERENCE_CODE',
      confidence: 100,
    }));

    const txUpdate = updateChain([duplicateObservation]);

    const tx = {
      update: jest.fn(() => txUpdate),
      insert: jest.fn(),
    };

    db.transaction.mockImplementation((callback: (value: any) => unknown) =>
      callback(tx),
    );

    const result = await service.create(userId, validDto);

    expect(result.duplicate).toBe(true);

    if (!result.duplicate || result.stage !== 'TRANSACTION') {
      throw new Error('Expected a transaction-level duplicate.');
    }

    expect(result.stage).toBe('TRANSACTION');
    expect(result.canonicalTransactionId).toBe(transactionId);

    expect(tx.insert).not.toHaveBeenCalled();

    expect(txUpdate.set).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'DUPLICATE',
        transactionId,
      }),
    );
    expect(reconciliationService.evaluate).not.toHaveBeenCalled();
  });

  it('creates a pending transaction and possible-duplicate link', async () => {
    const pendingObservation = makeObservation();

    const pendingTransaction = {
      id: 'new-transaction-id',
      userId,
      walletId,

      categoryId: null,

      amount: 80000,
      direction: 'IN',

      kind: 'NORMAL',
      reviewStatus: 'PENDING_REVIEW',

      categorizationSource: 'NONE',
      matchedRuleId: null,

      origin: 'PARSER',
    };

    const reviewedObservation = {
      ...pendingObservation,
      status: 'PENDING_REVIEW',
      transactionId: pendingTransaction.id,
    };

    const createdLink = {
      id: 'link-id',
      userId,
      primaryTransactionId: transactionId,
      relatedTransactionId: pendingTransaction.id,
      linkType: 'POSSIBLE_DUPLICATE',
      status: 'PENDING_REVIEW',
      confidence: 60,
    };

    db.select.mockReturnValueOnce(
      queryChain([
        {
          id: walletId,
          isArchived: false,
        },
      ]),
    );

    db.insert.mockReturnValueOnce(insertChain([pendingObservation]));

    deduplicationService.evaluateTransaction = jest.fn(async () => ({
      kind: 'PENDING_REVIEW',
      reason: 'AMOUNT_TIME_ONLY',
      candidates: [
        {
          transactionId,
          timeDeltaMs: 30_000,
          merchantMatched: false,
          accountMatched: false,
          confidence: 60,
        },
      ],
    }));

    const transactionInsert = insertChain([pendingTransaction]);

    const linksInsert = linkInsertChain([createdLink]);

    const observationUpdate = updateChain([reviewedObservation]);

    const insertQueue = [transactionInsert, linksInsert];

    const tx = {
      insert: jest.fn(() => insertQueue.shift()),
      update: jest.fn(() => observationUpdate),
    };

    db.transaction.mockImplementation((callback: (value: any) => unknown) =>
      callback(tx),
    );

    const result = await service.create(userId, validDto);

    expect(result.duplicate).toBe(false);

    if (result.duplicate) {
      throw new Error('Expected a transaction pending review.');
    }

    expect(result.pendingReview).toBe(true);
    expect(result.transaction.reviewStatus).toBe('PENDING_REVIEW');
    expect(result.links).toHaveLength(1);

    expect(linksInsert.values).toHaveBeenCalledWith([
      expect.objectContaining({
        primaryTransactionId: transactionId,
        relatedTransactionId: pendingTransaction.id,
        linkType: 'POSSIBLE_DUPLICATE',
        status: 'PENDING_REVIEW',
        confidence: 60,
      }),
    ]);

    expect(observationUpdate.set).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'PENDING_REVIEW',
        transactionId: pendingTransaction.id,
      }),
    );

    expect(reconciliationService.evaluate).not.toHaveBeenCalled();
  });

  it('stores categorization result on parsed transaction', async () => {
    const categoryId = '11111111-1111-4111-8111-111111111111';

    const pendingObservation = {
      ...makeObservation(),
      rawText: counterpartyDto.rawText,
      rawPayload: counterpartyDto.rawPayload,
      observedAt: new Date(counterpartyDto.observedAt),
    };

    // Giả lập CategorizationService tìm thấy category mặc định.
    categorizationService.categorize = jest.fn(async () => ({
      categoryId,
      source: 'DEFAULT_KEYWORD',
      matchedRuleId: null,
    }));

    // Giả lập ví tồn tại và thuộc user.
    db.select.mockReturnValueOnce(
      queryChain([
        {
          id: walletId,
          isArchived: false,
        },
      ]),
    );

    // Giả lập lưu observation ở trạng thái PENDING.
    db.insert.mockReturnValueOnce(insertChain([pendingObservation]));

    // Giả lập transaction được PostgreSQL trả về sau khi insert.
    const { txInsert } = mockSuccessfulTransaction({
      categoryId,
      categorizationSource: 'DEFAULT_KEYWORD',
      matchedRuleId: null,
    });

    const result = await service.create(userId, counterpartyDto);

    expect(result.duplicate).toBe(false);

    if (!('transaction' in result)) {
      throw new Error('Expected a parsed transaction result');
    }

    // Kiểm tra service phân loại đã được gọi đúng dữ liệu.
    expect(categorizationService.categorize).toHaveBeenCalledWith(
      expect.objectContaining({
        userId,
        direction: 'OUT',
        kind: 'NORMAL',
        reviewStatus: 'CONFIRMED',
        counterpartyAccount: '9000000002',
      }),
      expect.anything(),
    );

    // Kiểm tra dữ liệu gửi vào câu lệnh INSERT transaction.
    expect(txInsert.values).toHaveBeenCalledWith(
      expect.objectContaining({
        categoryId,
        categorizationSource: 'DEFAULT_KEYWORD',
        matchedRuleId: null,
        counterpartyAccount: '9000000002',
      }),
    );

    // Kiểm tra transaction trả về có kết quả phân loại.
    expect(result.transaction.categoryId).toBe(categoryId);
    expect(result.transaction.categorizationSource).toBe('DEFAULT_KEYWORD');
  });

  it('auto-confirms a strong internal-transfer match', async () => {
    const candidateTransactionId = '11111111-1111-4111-8111-111111111111';

    const pendingObservation = makeObservation();

    const internalTransaction = {
      id: transactionId,
      userId,
      walletId,

      categoryId: null,

      amount: 80000,
      direction: 'IN',

      kind: 'INTERNAL_TRANSFER',
      reviewStatus: 'CONFIRMED',

      categorizationSource: 'NONE',
      matchedRuleId: null,

      origin: 'PARSER',
    };

    const updatedCandidate = {
      id: candidateTransactionId,
      userId,

      kind: 'INTERNAL_TRANSFER',
      reviewStatus: 'CONFIRMED',

      categoryId: null,
      categorizationSource: 'NONE',
      matchedRuleId: null,
    };

    const createdLink = {
      id: '22222222-2222-4222-8222-222222222222',
      userId,

      primaryTransactionId: candidateTransactionId,
      relatedTransactionId: transactionId,

      linkType: 'INTERNAL_TRANSFER',
      status: 'AUTO_CONFIRMED',
      confidence: 100,
    };

    const parsedObservation = {
      ...makeObservation('PARSED'),
      transactionId,
    };

    db.select.mockReturnValueOnce(
      queryChain([{ id: walletId, isArchived: false }]),
    );

    db.insert.mockReturnValueOnce(insertChain([pendingObservation]));

    reconciliationService.evaluate = jest.fn(async () => ({
      kind: 'AUTO_CONFIRMED',
      reason: 'STRONG_INTERNAL_TRANSFER_MATCH',
      candidate: {
        transactionId: candidateTransactionId,
        walletId: '33333333-3333-4333-8333-333333333333',

        source: 'MBBANK',
        channel: 'ANDROID_NOTIFICATION',

        timeDeltaMs: 30_000,

        referenceMatched: true,
        accountMatched: false,

        confidence: 100,
      },
    }));

    const transactionInsert = insertChain([internalTransaction]);
    const linkInsert = linkInsertChain([createdLink]);

    const candidateUpdate = updateChain([updatedCandidate]);
    const observationUpdate = updateChain([parsedObservation]);

    const insertQueue = [transactionInsert, linkInsert];
    const updateQueue = [candidateUpdate, observationUpdate];

    const tx = {
      insert: jest.fn(() => insertQueue.shift()),
      update: jest.fn(() => updateQueue.shift()),
    };

    db.transaction.mockImplementation((callback: (value: any) => unknown) =>
      callback(tx),
    );

    const result = await service.create(userId, validDto);

    expect(result.duplicate).toBe(false);

    if (result.duplicate) {
      throw new Error('Expected a new internal transfer.');
    }

    expect(result.pendingReview).toBe(false);
    expect(result.transaction.kind).toBe('INTERNAL_TRANSFER');
    expect(result.transaction.reviewStatus).toBe('CONFIRMED');

    expect(candidateUpdate.set).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: 'INTERNAL_TRANSFER',
        categoryId: null,
        categorizationSource: 'NONE',
        matchedRuleId: null,
      }),
    );

    expect(linkInsert.values).toHaveBeenCalledWith(
      expect.objectContaining({
        primaryTransactionId: candidateTransactionId,
        relatedTransactionId: transactionId,
        linkType: 'INTERNAL_TRANSFER',
        status: 'AUTO_CONFIRMED',
        confidence: 100,
      }),
    );

    expect(result.reconciliation.kind).toBe('AUTO_CONFIRMED');
  });

  it('creates a pending internal-transfer review for a weak match', async () => {
    const candidateTransactionId = '44444444-4444-4444-8444-444444444444';

    const pendingObservation = makeObservation();

    const pendingTransaction = {
      id: transactionId,
      userId,
      walletId,

      categoryId: null,

      amount: 80000,
      direction: 'IN',

      kind: 'NORMAL',
      reviewStatus: 'PENDING_REVIEW',

      categorizationSource: 'NONE',
      matchedRuleId: null,

      origin: 'PARSER',
    };

    const createdLink = {
      id: '55555555-5555-4555-8555-555555555555',
      userId,

      primaryTransactionId: candidateTransactionId,
      relatedTransactionId: transactionId,

      linkType: 'INTERNAL_TRANSFER',
      status: 'PENDING_REVIEW',
      confidence: 85,
    };

    const reviewedObservation = {
      ...makeObservation('PENDING_REVIEW'),
      transactionId,
    };

    db.select.mockReturnValueOnce(
      queryChain([{ id: walletId, isArchived: false }]),
    );

    db.insert.mockReturnValueOnce(insertChain([pendingObservation]));

    reconciliationService.evaluate = jest.fn(async () => ({
      kind: 'PENDING_REVIEW',
      reason: 'AMOUNT_TIME_OPPOSITE_DIRECTION',
      candidates: [
        {
          transactionId: candidateTransactionId,
          walletId: '66666666-6666-4666-8666-666666666666',

          source: 'MBBANK',
          channel: 'ANDROID_NOTIFICATION',

          timeDeltaMs: 30_000,

          referenceMatched: false,
          accountMatched: false,

          confidence: 85,
        },
      ],
    }));

    const transactionInsert = insertChain([pendingTransaction]);
    const linkInsert = linkInsertChain([createdLink]);
    const observationUpdate = updateChain([reviewedObservation]);

    const insertQueue = [transactionInsert, linkInsert];

    const tx = {
      insert: jest.fn(() => insertQueue.shift()),
      update: jest.fn(() => observationUpdate),
    };

    db.transaction.mockImplementation((callback: (value: any) => unknown) =>
      callback(tx),
    );

    const result = await service.create(userId, validDto);

    expect(result.duplicate).toBe(false);

    if (result.duplicate) {
      throw new Error('Expected a pending internal transfer.');
    }

    expect(result.pendingReview).toBe(true);
    expect(result.transaction.kind).toBe('NORMAL');
    expect(result.transaction.reviewStatus).toBe('PENDING_REVIEW');

    expect(linkInsert.values).toHaveBeenCalledWith([
      expect.objectContaining({
        primaryTransactionId: candidateTransactionId,
        relatedTransactionId: transactionId,
        linkType: 'INTERNAL_TRANSFER',
        status: 'PENDING_REVIEW',
        confidence: 85,
      }),
    ]);

    expect(observationUpdate.set).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'PENDING_REVIEW',
        transactionId,
      }),
    );

    expect(result.reconciliation.kind).toBe('PENDING_REVIEW');
  });
});
