import { Inject, Injectable } from '@nestjs/common';
import { and, eq, gte, lte, ne } from 'drizzle-orm';
import { DATABASE, type Database } from '../database/database.module';
import { transactionObservations, transactions } from '../database/schema';
import type {
  InternalTransferCandidate,
  ReconciliationDecision,
  ReconciliationInput,
} from './reconciliation.types';

/**
 * Chỉ tìm transaction trong khoảng cộng/trừ 3 phút.
 */
const RECONCILIATION_WINDOW_MS = 3 * 60 * 1000;

/**
 * Giao dịch cách nhau không quá 60 giây
 * được cộng thêm điểm tin cậy.
 */
const CLOSE_TIME_WINDOW_MS = 60 * 1000;

/**
 * Chỉ tự động xác nhận khi confidence đạt ít nhất 90.
 */
const AUTO_CONFIRM_THRESHOLD = 90;
type ReconciliationQueryExecutor = Pick<Database, 'select'>;

@Injectable()
export class ReconciliationService {
  constructor(
    @Inject(DATABASE)
    private readonly db: Database,
  ) {}

  async evaluate(
    input: ReconciliationInput,
    executor: ReconciliationQueryExecutor = this.db,
  ): Promise<ReconciliationDecision> {
    const oppositeDirection = input.direction === 'IN' ? 'OUT' : 'IN';

    const windowStart = new Date(
      input.transactionTime.getTime() - RECONCILIATION_WINDOW_MS,
    );

    const windowEnd = new Date(
      input.transactionTime.getTime() + RECONCILIATION_WINDOW_MS,
    );

    /*
     * Query chỉ lấy những transaction có khả năng
     * là chiều còn lại của chuyển tiền nội bộ.
     */
    const rows = await executor
      .select({
        transactionId: transactions.id,
        userId: transactions.userId,
        walletId: transactions.walletId,

        amount: transactions.amount,
        direction: transactions.direction,

        kind: transactions.kind,
        reviewStatus: transactions.reviewStatus,

        transactionTime: transactions.transactionTime,

        referenceCode: transactions.referenceCode,
        counterpartyAccount: transactions.counterpartyAccount,

        source: transactionObservations.source,
        channel: transactionObservations.channel,
      })
      .from(transactions)
      .innerJoin(
        transactionObservations,
        eq(transactionObservations.transactionId, transactions.id),
      )
      .where(
        and(
          eq(transactions.userId, input.userId),
          eq(transactions.amount, input.amount),

          eq(transactions.direction, oppositeDirection),

          ne(transactions.walletId, input.walletId),

          eq(transactions.kind, 'NORMAL'),
          eq(transactions.reviewStatus, 'CONFIRMED'),

          gte(transactions.transactionTime, windowStart),

          lte(transactions.transactionTime, windowEnd),
        ),
      )
      .limit(50);

    /*
     * Một transaction có thể có nhiều observation.
     * Map bảo đảm mỗi transaction chỉ xuất hiện một lần.
     */
    const candidateMap = new Map<string, InternalTransferCandidate>();

    for (const row of rows) {
      /*
       * Kiểm tra phòng thủ.
       *
       * SQL đã lọc các điều kiện này, nhưng vẫn kiểm tra
       * trong TypeScript để logic rõ ràng và dễ unit test.
       */
      if (row.userId !== input.userId) {
        continue;
      }

      if (row.amount !== input.amount) {
        continue;
      }

      if (row.direction !== oppositeDirection) {
        continue;
      }

      if (row.walletId === input.walletId) {
        continue;
      }

      if (row.kind !== 'NORMAL') {
        continue;
      }

      if (row.reviewStatus !== 'CONFIRMED') {
        continue;
      }

      /*
       * Giai đoạn đầu chỉ hỗ trợ:
       * - Bank → MoMo
       * - MoMo → Bank
       * - Bank A → Bank B
       *
       * Do đó nguồn phải khác nhau.
       */
      if (!this.isSupportedSourcePair(input.source, row.source)) {
        continue;
      }

      const timeDeltaMs = Math.abs(
        row.transactionTime.getTime() - input.transactionTime.getTime(),
      );

      if (timeDeltaMs > RECONCILIATION_WINDOW_MS) {
        continue;
      }

      const referenceMatched = this.matchesReference(
        input.referenceCode,
        row.referenceCode,
      );

      const accountMatched = this.matchesAccount(
        input.counterpartyAccount,
        row.counterpartyAccount,
      );

      const confidence = this.calculateConfidence({
        timeDeltaMs,
        referenceMatched,
        accountMatched,
      });

      const candidate: InternalTransferCandidate = {
        transactionId: row.transactionId,
        walletId: row.walletId,

        source: row.source,
        channel: row.channel,

        timeDeltaMs,

        referenceMatched,
        accountMatched,

        confidence,
      };

      const previous = candidateMap.get(row.transactionId);

      /*
       * Nếu một transaction có nhiều observations,
       * giữ observation cho điểm cao nhất.
       */
      if (
        !previous ||
        candidate.confidence > previous.confidence ||
        (candidate.confidence === previous.confidence &&
          candidate.timeDeltaMs < previous.timeDeltaMs)
      ) {
        candidateMap.set(row.transactionId, candidate);
      }
    }

    const candidates = [...candidateMap.values()].sort((left, right) => {
      if (right.confidence !== left.confidence) {
        return right.confidence - left.confidence;
      }

      return left.timeDeltaMs - right.timeDeltaMs;
    });

    if (candidates.length === 0) {
      return {
        kind: 'NO_MATCH',
      };
    }

    /*
     * Nhiều ứng viên luôn cần người dùng lựa chọn.
     */
    if (candidates.length > 1) {
      return {
        kind: 'PENDING_REVIEW',
        reason: 'MULTIPLE_INTERNAL_TRANSFER_CANDIDATES',
        candidates,
      };
    }

    const candidate = candidates[0];

    /*
     * Chỉ một ứng viên và confidence đủ cao
     * mới được tự động xác nhận.
     */
    if (candidate.confidence >= AUTO_CONFIRM_THRESHOLD) {
      return {
        kind: 'AUTO_CONFIRMED',
        reason: 'STRONG_INTERNAL_TRANSFER_MATCH',
        candidate,
      };
    }

    return {
      kind: 'PENDING_REVIEW',
      reason: 'AMOUNT_TIME_OPPOSITE_DIRECTION',
      candidates,
    };
  }

  private isSupportedSourcePair(
    inputSource: ReconciliationInput['source'],
    candidateSource: ReconciliationInput['source'],
  ): boolean {
    /*
     * Các nguồn hiện có:
     * VIETCOMBANK, MBBANK, MOMO.
     *
     * Khác source tương ứng Bank–MoMo hoặc Bank–Bank.
     */
    return inputSource !== candidateSource;
  }

  private normalizeReference(value: string | null): string | null {
    if (!value) {
      return null;
    }

    const normalized = value.normalize('NFKC').trim().toUpperCase();

    /*
     * Reference quá ngắn không đủ an toàn để so sánh.
     */
    if (normalized.length < 6) {
      return null;
    }

    return normalized;
  }

  private normalizeAccount(value: string | null): string | null {
    if (!value) {
      return null;
    }

    const normalized = value
      .normalize('NFKC')
      .toUpperCase()
      .replace(/[^A-Z0-9]/g, '');

    /*
     * Tránh coi một đoạn số quá ngắn là tài khoản.
     */
    if (normalized.length < 6) {
      return null;
    }

    return normalized;
  }

  private matchesReference(left: string | null, right: string | null): boolean {
    const normalizedLeft = this.normalizeReference(left);

    const normalizedRight = this.normalizeReference(right);

    return (
      normalizedLeft !== null &&
      normalizedRight !== null &&
      normalizedLeft === normalizedRight
    );
  }

  private matchesAccount(left: string | null, right: string | null): boolean {
    const normalizedLeft = this.normalizeAccount(left);

    const normalizedRight = this.normalizeAccount(right);

    return (
      normalizedLeft !== null &&
      normalizedRight !== null &&
      normalizedLeft === normalizedRight
    );
  }

  private calculateConfidence(input: {
    timeDeltaMs: number;
    referenceMatched: boolean;
    accountMatched: boolean;
  }): number {
    /*
     * Cùng amount, ngược direction, khác wallet
     * và nằm trong 3 phút: 60 điểm nền.
     */
    let confidence = 60;

    /*
     * Hai giao dịch cách nhau không quá 60 giây.
     */
    if (input.timeDeltaMs <= CLOSE_TIME_WINDOW_MS) {
      confidence += 15;
    }

    /*
     * Khác nguồn hợp lệ đã được kiểm tra phía trên:
     * Bank–MoMo hoặc Bank–Bank.
     */
    confidence += 10;

    /*
     * Reference hoặc tài khoản khớp là bằng chứng mạnh.
     */
    if (input.referenceMatched || input.accountMatched) {
      confidence += 15;
    }

    return Math.min(confidence, 100);
  }
}
