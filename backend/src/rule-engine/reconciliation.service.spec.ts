import { jest } from '@jest/globals';
import { ReconciliationService } from './reconciliation.service';
import type { ReconciliationInput } from './reconciliation.types';

function queryChain(result: unknown[]) {
  const chain: any = {};

  chain.from = jest.fn(() => chain);
  chain.innerJoin = jest.fn(() => chain);
  chain.where = jest.fn(() => chain);
  chain.limit = jest.fn(async () => result);

  return chain;
}

describe('ReconciliationService', () => {
  let service: ReconciliationService;
  let db: any;
  let rows: unknown[];

  const userId = '11111111-1111-4111-8111-111111111111';

  const bankWalletId = '22222222-2222-4222-8222-222222222222';

  const momoWalletId = '33333333-3333-4333-8333-333333333333';

  const transactionId = '44444444-4444-4444-8444-444444444444';

  const transactionTime = new Date('2026-11-08T10:00:00+07:00');

  const input: ReconciliationInput = {
    userId,
    walletId: bankWalletId,

    source: 'VIETCOMBANK',
    channel: 'ANDROID_NOTIFICATION',

    amount: 100000,
    direction: 'OUT',
    transactionTime,

    referenceCode: null,
    counterpartyAccount: null,
  };

  function makeCandidate(overrides: Record<string, unknown> = {}) {
    return {
      transactionId,
      userId,
      walletId: momoWalletId,

      amount: 100000,
      direction: 'IN',

      kind: 'NORMAL',
      reviewStatus: 'CONFIRMED',

      transactionTime: new Date(transactionTime.getTime() + 30000),

      referenceCode: null,
      counterpartyAccount: null,

      source: 'MOMO',
      channel: 'ANDROID_NOTIFICATION',

      ...overrides,
    };
  }

  beforeEach(() => {
    rows = [];

    db = {
      select: jest.fn(() => queryChain(rows)),
    };

    service = new ReconciliationService(db);
  });

  it('returns NO_MATCH when no candidate exists', async () => {
    rows = [];

    const result = await service.evaluate(input);

    expect(result).toEqual({
      kind: 'NO_MATCH',
    });
  });

  it('requires review when amount, time and opposite direction match', async () => {
    rows = [makeCandidate()];

    const result = await service.evaluate(input);

    expect(result.kind).toBe('PENDING_REVIEW');

    if (result.kind === 'PENDING_REVIEW') {
      expect(result.reason).toBe('AMOUNT_TIME_OPPOSITE_DIRECTION');

      expect(result.candidates).toHaveLength(1);

      expect(result.candidates[0].confidence).toBe(85);

      expect(result.candidates[0].timeDeltaMs).toBe(30000);
    }
  });

  it('auto confirms one close candidate with matching reference', async () => {
    rows = [
      makeCandidate({
        referenceCode: 'INTERNAL-REF-001',
      }),
    ];

    const result = await service.evaluate({
      ...input,
      referenceCode: ' internal-ref-001 ',
    });

    expect(result.kind).toBe('AUTO_CONFIRMED');

    if (result.kind === 'AUTO_CONFIRMED') {
      expect(result.reason).toBe('STRONG_INTERNAL_TRANSFER_MATCH');

      expect(result.candidate.transactionId).toBe(transactionId);

      expect(result.candidate.referenceMatched).toBe(true);

      expect(result.candidate.confidence).toBe(100);
    }
  });

  it('auto confirms matching account after normalization', async () => {
    rows = [
      makeCandidate({
        counterpartyAccount: '9000 000 001',
      }),
    ];

    const result = await service.evaluate({
      ...input,
      counterpartyAccount: '9000000001',
    });

    expect(result.kind).toBe('AUTO_CONFIRMED');

    if (result.kind === 'AUTO_CONFIRMED') {
      expect(result.candidate.accountMatched).toBe(true);

      expect(result.candidate.confidence).toBe(100);
    }
  });

  it('does not auto confirm a strong match outside the close 60-second window', async () => {
    rows = [
      makeCandidate({
        transactionTime: new Date(transactionTime.getTime() + 120000),
        referenceCode: 'INTERNAL-REF-001',
      }),
    ];

    const result = await service.evaluate({
      ...input,
      referenceCode: 'INTERNAL-REF-001',
    });

    expect(result.kind).toBe('PENDING_REVIEW');

    if (result.kind === 'PENDING_REVIEW') {
      expect(result.candidates[0].confidence).toBe(85);
    }
  });

  it('requires review when multiple candidates exist', async () => {
    rows = [
      makeCandidate({
        transactionId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      }),

      makeCandidate({
        transactionId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',

        walletId: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',

        transactionTime: new Date(transactionTime.getTime() + 45000),
      }),
    ];

    const result = await service.evaluate(input);

    expect(result.kind).toBe('PENDING_REVIEW');

    if (result.kind === 'PENDING_REVIEW') {
      expect(result.reason).toBe('MULTIPLE_INTERNAL_TRANSFER_CANDIDATES');

      expect(result.candidates).toHaveLength(2);
    }
  });

  it('deduplicates multiple observations of the same transaction', async () => {
    rows = [
      makeCandidate({
        channel: 'EMAIL',
      }),

      makeCandidate({
        channel: 'ANDROID_NOTIFICATION',
      }),
    ];

    const result = await service.evaluate(input);

    expect(result.kind).toBe('PENDING_REVIEW');

    if (result.kind === 'PENDING_REVIEW') {
      expect(result.candidates).toHaveLength(1);
    }
  });

  it('ignores a transaction with the same direction', async () => {
    rows = [
      makeCandidate({
        direction: 'OUT',
      }),
    ];

    const result = await service.evaluate(input);

    expect(result).toEqual({
      kind: 'NO_MATCH',
    });
  });

  it('ignores a transaction with a different amount', async () => {
    rows = [
      makeCandidate({
        amount: 200000,
      }),
    ];

    const result = await service.evaluate(input);

    expect(result).toEqual({
      kind: 'NO_MATCH',
    });
  });

  it('ignores a transaction from the same wallet', async () => {
    rows = [
      makeCandidate({
        walletId: bankWalletId,
      }),
    ];

    const result = await service.evaluate(input);

    expect(result).toEqual({
      kind: 'NO_MATCH',
    });
  });

  it('ignores a transaction outside the three-minute window', async () => {
    rows = [
      makeCandidate({
        transactionTime: new Date(
          transactionTime.getTime() + 3 * 60 * 1000 + 1,
        ),
      }),
    ];

    const result = await service.evaluate(input);

    expect(result).toEqual({
      kind: 'NO_MATCH',
    });
  });

  it.each([
    [
      'another user',
      {
        userId: '99999999-9999-4999-8999-999999999999',
      },
    ],

    [
      'a pending transaction',
      {
        reviewStatus: 'PENDING_REVIEW',
      },
    ],

    [
      'an excluded transaction',
      {
        reviewStatus: 'EXCLUDED',
      },
    ],

    [
      'an existing internal transfer',
      {
        kind: 'INTERNAL_TRANSFER',
      },
    ],

    [
      'the same source',
      {
        source: 'VIETCOMBANK',
      },
    ],
  ] as Array<[string, Record<string, unknown>]>)(
    'ignores %s',
    async (_description, overrides) => {
      rows = [makeCandidate(overrides)];

      const result = await service.evaluate(input);

      expect(result).toEqual({
        kind: 'NO_MATCH',
      });
    },
  );
});
