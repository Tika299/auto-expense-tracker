import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import { and, eq, gte, lt, sql } from 'drizzle-orm';
import { DATABASE, type Database } from '../database/database.module';
import { transactions } from '../database/schema';
import { QueryReportDto } from './dto/query-report.dto';

@Injectable()
export class ReportsService {
  constructor(
    @Inject(DATABASE)
    private readonly db: Database,
  ) {}

  async getSummary(userId: string, query: QueryReportDto) {
    const from = query.from ? new Date(query.from) : null;
    const to = query.to ? new Date(query.to) : null;

    if (from && to && from.getTime() >= to.getTime()) {
      throw new BadRequestException('`from` phải nhỏ hơn `to`.');
    }

    const conditions = [eq(transactions.userId, userId)];

    if (query.walletId) {
      conditions.push(eq(transactions.walletId, query.walletId));
    }

    if (from) {
      conditions.push(gte(transactions.transactionTime, from));
    }

    if (to) {
      conditions.push(lt(transactions.transactionTime, to));
    }

    const [totals] = await this.db
      .select({
        income: sql<number>`
          COALESCE(
            SUM(
              CASE
                WHEN ${transactions.reviewStatus} = 'CONFIRMED'
                  AND ${transactions.kind} = 'NORMAL'
                  AND ${transactions.direction} = 'IN'
                THEN ${transactions.amount}
                ELSE 0
              END
            ),
            0
          )::bigint
        `.mapWith(Number),

        expense: sql<number>`
          COALESCE(
            SUM(
              CASE
                WHEN ${transactions.reviewStatus} = 'CONFIRMED'
                  AND ${transactions.kind} = 'NORMAL'
                  AND ${transactions.direction} = 'OUT'
                THEN ${transactions.amount}
                ELSE 0
              END
            ),
            0
          )::bigint
        `.mapWith(Number),

        internalTransferIn: sql<number>`
          COALESCE(
            SUM(
              CASE
                WHEN ${transactions.reviewStatus} = 'CONFIRMED'
                  AND ${transactions.kind} = 'INTERNAL_TRANSFER'
                  AND ${transactions.direction} = 'IN'
                THEN ${transactions.amount}
                ELSE 0
              END
            ),
            0
          )::bigint
        `.mapWith(Number),

        internalTransferOut: sql<number>`
          COALESCE(
            SUM(
              CASE
                WHEN ${transactions.reviewStatus} = 'CONFIRMED'
                  AND ${transactions.kind} = 'INTERNAL_TRANSFER'
                  AND ${transactions.direction} = 'OUT'
                THEN ${transactions.amount}
                ELSE 0
              END
            ),
            0
          )::bigint
        `.mapWith(Number),

        normalTransactionCount: sql<number>`
          COUNT(*) FILTER (
            WHERE ${transactions.reviewStatus} = 'CONFIRMED'
              AND ${transactions.kind} = 'NORMAL'
          )::int
        `.mapWith(Number),

        internalTransferTransactionCount: sql<number>`
          COUNT(*) FILTER (
            WHERE ${transactions.reviewStatus} = 'CONFIRMED'
              AND ${transactions.kind} = 'INTERNAL_TRANSFER'
          )::int
        `.mapWith(Number),

        pendingReviewCount: sql<number>`
          COUNT(*) FILTER (
            WHERE ${transactions.reviewStatus} = 'PENDING_REVIEW'
          )::int
        `.mapWith(Number),
      })
      .from(transactions)
      .where(and(...conditions));

    const income = totals?.income ?? 0;
    const expense = totals?.expense ?? 0;
    const internalTransferIn = totals?.internalTransferIn ?? 0;
    const internalTransferOut = totals?.internalTransferOut ?? 0;

    return {
      period: {
        from: query.from ?? null,
        to: query.to ?? null,
      },

      walletId: query.walletId ?? null,

      income,
      expense,

      // Dòng tiền thực sự làm tăng/giảm tài sản.
      netCashFlow: income - expense,

      internalTransfer: {
        in: internalTransferIn,
        out: internalTransferOut,

        // Khi báo cáo toàn bộ ví, giá trị này thường bằng 0.
        net: internalTransferIn - internalTransferOut,

        transactionCount: totals?.internalTransferTransactionCount ?? 0,
      },

      normalTransactionCount: totals?.normalTransactionCount ?? 0,

      pendingReviewCount: totals?.pendingReviewCount ?? 0,
    };
  }
}
