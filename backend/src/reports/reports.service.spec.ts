import { BadRequestException } from '@nestjs/common';
import { jest } from '@jest/globals';
import { ReportsService } from './reports.service';

function selectChain(result: unknown[]) {
  const chain: any = {};

  chain.from = jest.fn(() => chain);
  chain.where = jest.fn(async () => result);

  return chain;
}

describe('ReportsService', () => {
  let service: ReportsService;
  let db: {
    select: jest.Mock;
  };

  beforeEach(() => {
    db = {
      select: jest.fn(),
    };

    service = new ReportsService(db as any);
  });

  it('separates internal transfers from income and expense', async () => {
    db.select.mockReturnValue(
      selectChain([
        {
          income: 3_000_000,
          expense: 1_200_000,
          internalTransferIn: 500_000,
          internalTransferOut: 500_000,
          normalTransactionCount: 8,
          internalTransferTransactionCount: 2,
          pendingReviewCount: 1,
        },
      ]),
    );

    const result = await service.getSummary(
      '88689eac-926c-4742-9e65-1e4a44f9fa55',
      {
        from: '2026-11-01T00:00:00+07:00',
        to: '2026-12-01T00:00:00+07:00',
      },
    );

    expect(result).toEqual({
      period: {
        from: '2026-11-01T00:00:00+07:00',
        to: '2026-12-01T00:00:00+07:00',
      },
      walletId: null,
      income: 3_000_000,
      expense: 1_200_000,
      netCashFlow: 1_800_000,
      internalTransfer: {
        in: 500_000,
        out: 500_000,
        net: 0,
        transactionCount: 2,
      },
      normalTransactionCount: 8,
      pendingReviewCount: 1,
    });
  });

  it('returns zero when there are no transactions', async () => {
    db.select.mockReturnValue(
      selectChain([
        {
          income: 0,
          expense: 0,
          internalTransferIn: 0,
          internalTransferOut: 0,
          normalTransactionCount: 0,
          internalTransferTransactionCount: 0,
          pendingReviewCount: 0,
        },
      ]),
    );

    const result = await service.getSummary('user-id', {});

    expect(result.income).toBe(0);
    expect(result.expense).toBe(0);
    expect(result.netCashFlow).toBe(0);
    expect(result.internalTransfer.net).toBe(0);
  });

  it('rejects an invalid date range', async () => {
    await expect(
      service.getSummary('user-id', {
        from: '2026-12-01T00:00:00+07:00',
        to: '2026-11-01T00:00:00+07:00',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(db.select).not.toHaveBeenCalled();
  });
});
