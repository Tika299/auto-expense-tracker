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

    service = new ObservationsService(db, deduplicationService);
  });

  function mockSuccessfulTransaction() {
    const createdTransaction = {
      id: transactionId,
      userId,
      walletId,
      amount: 80000,
      direction: 'IN',

      kind: 'NORMAL',
      reviewStatus: 'CONFIRMED',
      categorizationSource: 'NONE',

      origin: 'PARSER',
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

    return { createdTransaction, parsedObservation, txInsert, txUpdate };
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
  });

  it('creates a pending transaction and possible-duplicate link', async () => {
    const pendingObservation = makeObservation();

    const pendingTransaction = {
      id: 'new-transaction-id',
      userId,
      walletId,
      amount: 80000,
      direction: 'IN',
      kind: 'NORMAL',
      reviewStatus: 'PENDING_REVIEW',
      categorizationSource: 'NONE',
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
  });
});
