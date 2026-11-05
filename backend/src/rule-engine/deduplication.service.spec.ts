import { jest } from '@jest/globals';
import { DeduplicationService } from './deduplication.service';
import type {
  ObservationIdentityInput,
  ObservationRecord,
  TransactionCandidateInput,
} from './deduplication.types';

function queryChain(result: unknown[]) {
  const chain: any = {};

  chain.from = jest.fn(() => chain);
  chain.innerJoin = jest.fn(() => chain);
  chain.where = jest.fn(() => chain);
  chain.limit = jest.fn(async () => result);

  return chain;
}

describe('DeduplicationService', () => {
  let service: DeduplicationService;
  let db: any;
  let queuedResults: unknown[][];

  const observationInput: ObservationIdentityInput = {
    userId: '88689eac-926c-4742-9e65-1e4a44f9fa55',
    source: 'VIETCOMBANK',
    channel: 'EMAIL',
    sourceMessageId: null,
    rawText: 'Số dư TK VCB 9000000001 +80,000 VND lúc 14-10-2026 12:47:59.',
    observedAt: '2026-10-14T12:48:00+07:00',
  };

  const existingObservation: ObservationRecord = {
    id: '83c2a5d2-4762-4f33-86f9-acc05827984e',
    userId: observationInput.userId,
    walletId: 'ea71c41b-38e4-40ac-a523-3b993d2105fd',
    transactionId: 'decd65cd-9078-4d4e-bf3f-19d0a262e86e',

    source: observationInput.source,
    channel: observationInput.channel,
    sourceMessageId: 'gmail-message-001',

    rawText: observationInput.rawText,
    rawPayload: {
      test: true,
    },

    payloadHash: 'existing-payload-hash',
    normalizedContentHash: 'existing-normalized-hash',

    observedAt: new Date(observationInput.observedAt),

    status: 'PARSED',
    parserRule: 'vcb-notification-v1',
    parseErrorCode: null,

    createdAt: new Date('2026-11-03T09:22:25.580Z'),
  };

  const input: TransactionCandidateInput = {
    userId: '88689eac-926c-4742-9e65-1e4a44f9fa55',
    source: 'VIETCOMBANK',
    channel: 'ANDROID_NOTIFICATION',
    amount: 80000,
    direction: 'IN',
    transactionTime: new Date('2026-10-14T05:47:59.000Z'),
    referenceCode: '9000TPBVI0000001',
    merchantName: 'NGUYEN VAN A',
    counterpartyAccount: null,
  };

  beforeEach(() => {
    queuedResults = [];

    db = {
      select: jest.fn(() => queryChain(queuedResults.shift() ?? [])),
    };

    service = new DeduplicationService(db);
  });

  it('creates the same normalized hash for whitespace variants', () => {
    const first = service.createNormalizedContentHash('Số tiền  50.000 VND');

    const second = service.createNormalizedContentHash(
      '  số tiền\u00a050.000 VND  ',
    );

    expect(first).toBe(second);
  });

  it('detects an exact duplicate by reference code', async () => {
    queuedResults.push([
      {
        transactionId: 'decd65cd-9078-4d4e-bf3f-19d0a262e86e',
        transactionTime: new Date('2026-10-14T05:47:59.000Z'),
      },
    ]);

    const result = await service.evaluateTransaction(input);

    expect(result).toEqual({
      kind: 'EXACT_DUPLICATE',
      canonicalTransactionId: 'decd65cd-9078-4d4e-bf3f-19d0a262e86e',
      reason: 'REFERENCE_CODE',
      confidence: 100,
    });
  });

  it('auto merges one fuzzy candidate with the same merchant', async () => {
    queuedResults.push([
      {
        transactionId: 'decd65cd-9078-4d4e-bf3f-19d0a262e86e',
        transactionTime: new Date('2026-10-14T05:48:30.000Z'),
        merchantName: 'Nguyen Van A',
        counterpartyAccount: null,
        source: 'VIETCOMBANK',
        channel: 'EMAIL',
      },
    ]);

    const result = await service.evaluateTransaction({
      ...input,
      referenceCode: null,
    });

    expect(result).toEqual({
      kind: 'AUTO_MERGE',
      canonicalTransactionId: 'decd65cd-9078-4d4e-bf3f-19d0a262e86e',
      reason: 'MERCHANT_NAME',
      confidence: 90,
    });
  });

  it('requires review when only amount and time match', async () => {
    queuedResults.push([
      {
        transactionId: 'decd65cd-9078-4d4e-bf3f-19d0a262e86e',
        transactionTime: new Date('2026-10-14T05:48:30.000Z'),
        merchantName: null,
        counterpartyAccount: null,
        source: 'MOMO',
        channel: 'ANDROID_NOTIFICATION',
      },
    ]);

    const result = await service.evaluateTransaction({
      ...input,
      referenceCode: null,
      merchantName: null,
    });

    expect(result.kind).toBe('PENDING_REVIEW');

    if (result.kind === 'PENDING_REVIEW') {
      expect(result.reason).toBe('AMOUNT_TIME_ONLY');
      expect(result.candidates).toHaveLength(1);
      expect(result.candidates[0].confidence).toBe(60);
    }
  });

  it('does not match a transaction from the same source and channel', async () => {
    queuedResults.push([
      {
        transactionId: 'decd65cd-9078-4d4e-bf3f-19d0a262e86e',
        transactionTime: new Date('2026-10-14T05:48:30.000Z'),
        merchantName: 'NGUYEN VAN A',
        counterpartyAccount: null,
        source: 'VIETCOMBANK',
        channel: 'ANDROID_NOTIFICATION',
      },
    ]);

    const result = await service.evaluateTransaction({
      ...input,
      referenceCode: null,
    });

    expect(result).toEqual({
      kind: 'NO_DUPLICATE',
    });
  });

  it('requires review when multiple fuzzy candidates exist', async () => {
    queuedResults.push([
      {
        transactionId: 'transaction-1',
        transactionTime: new Date('2026-10-14T05:48:20.000Z'),
        merchantName: 'NGUYEN VAN A',
        counterpartyAccount: null,
        source: 'VIETCOMBANK',
        channel: 'EMAIL',
      },
      {
        transactionId: 'transaction-2',
        transactionTime: new Date('2026-10-14T05:48:40.000Z'),
        merchantName: 'NGUYEN VAN A',
        counterpartyAccount: null,
        source: 'MOMO',
        channel: 'ANDROID_NOTIFICATION',
      },
    ]);

    const result = await service.evaluateTransaction({
      ...input,
      referenceCode: null,
    });

    expect(result.kind).toBe('PENDING_REVIEW');

    if (result.kind === 'PENDING_REVIEW') {
      expect(result.reason).toBe('MULTIPLE_FUZZY_MATCHES');
      expect(result.candidates).toHaveLength(2);
    }
  });
  it('detects an observation duplicate by source message id first', async () => {
    queuedResults.push([existingObservation]);

    const result = await service.findExistingObservation({
      ...observationInput,
      sourceMessageId: 'gmail-message-001',
    });

    expect(result.duplicate).toBe(true);
    expect(result.matchedBy).toBe('SOURCE_MESSAGE_ID');
    expect(result.observation).toEqual(existingObservation);

    // Khi đã tìm thấy sourceMessageId thì không truy vấn payload hash.
    expect(db.select).toHaveBeenCalledTimes(1);
  });
  it('detects an observation duplicate by payload hash', async () => {
    queuedResults.push([existingObservation]);

    const result = await service.findExistingObservation({
      ...observationInput,
      sourceMessageId: null,
    });

    expect(result.duplicate).toBe(true);
    expect(result.matchedBy).toBe('PAYLOAD_HASH');
    expect(result.observation).toEqual(existingObservation);
    expect(result.payloadHash).toBe(
      service.createPayloadHash(observationInput),
    );

    expect(db.select).toHaveBeenCalledTimes(1);
  });
  it('detects an observation duplicate by normalized content hash', async () => {
    // Truy vấn payload hash không tìm thấy.
    queuedResults.push([]);

    // Truy vấn normalizedContentHash tìm thấy.
    queuedResults.push([existingObservation]);

    const result = await service.findExistingObservation({
      ...observationInput,
      sourceMessageId: null,
    });

    expect(result.duplicate).toBe(true);
    expect(result.matchedBy).toBe('NORMALIZED_CONTENT_HASH');
    expect(result.observation).toEqual(existingObservation);

    expect(db.select).toHaveBeenCalledTimes(2);
  });
  it('returns no observation duplicate when all identity checks miss', async () => {
    // Payload hash không khớp.
    queuedResults.push([]);

    // Normalized content hash không khớp.
    queuedResults.push([]);

    const result = await service.findExistingObservation({
      ...observationInput,
      sourceMessageId: null,
    });

    expect(result.duplicate).toBe(false);
    expect(result.matchedBy).toBeNull();
    expect(result.observation).toBeNull();

    expect(result.payloadHash).toHaveLength(64);
    expect(result.normalizedContentHash).toHaveLength(64);

    expect(db.select).toHaveBeenCalledTimes(2);
  });
  it('auto merges one fuzzy candidate with the same counterparty account', async () => {
    queuedResults.push([
      {
        transactionId: 'decd65cd-9078-4d4e-bf3f-19d0a262e86e',
        transactionTime: new Date('2026-10-14T05:48:30.000Z'),
        merchantName: null,

        // Cố tình thêm khoảng trắng để kiểm tra normalizeAccount.
        counterpartyAccount: '9000 000 001',

        source: 'VIETCOMBANK',
        channel: 'EMAIL',
      },
    ]);

    const result = await service.evaluateTransaction({
      ...input,
      referenceCode: null,
      merchantName: null,
      counterpartyAccount: '9000000001',
    });

    expect(result).toEqual({
      kind: 'AUTO_MERGE',
      canonicalTransactionId: 'decd65cd-9078-4d4e-bf3f-19d0a262e86e',
      reason: 'COUNTERPARTY_ACCOUNT',
      confidence: 95,
    });
  });
  it('requires review when multiple transactions share the same reference code', async () => {
    queuedResults.push([
      {
        transactionId: 'transaction-1',
        transactionTime: new Date('2026-10-14T05:47:30.000Z'),
      },
      {
        transactionId: 'transaction-2',
        transactionTime: new Date('2026-10-14T05:48:30.000Z'),
      },
    ]);

    const result = await service.evaluateTransaction(input);

    expect(result.kind).toBe('PENDING_REVIEW');

    if (result.kind === 'PENDING_REVIEW') {
      expect(result.reason).toBe('MULTIPLE_REFERENCE_MATCHES');

      expect(result.candidates).toHaveLength(2);

      expect(
        result.candidates.every((candidate) => candidate.confidence === 100),
      ).toBe(true);
    }

    // Không chạy fuzzy query sau khi đã có nhiều reference matches.
    expect(db.select).toHaveBeenCalledTimes(1);
  });
  it('returns no duplicate when no transaction candidate exists', async () => {
    queuedResults.push([]);

    const result = await service.evaluateTransaction({
      ...input,
      referenceCode: null,
      merchantName: null,
      counterpartyAccount: null,
    });

    expect(result).toEqual({
      kind: 'NO_DUPLICATE',
    });

    expect(db.select).toHaveBeenCalledTimes(1);
  });
});
