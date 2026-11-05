import { createHash } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { and, eq, gte, lte, sql } from 'drizzle-orm';
import { DATABASE, type Database } from '../database/database.module';
import { transactionObservations, transactions } from '../database/schema';
import type {
  DuplicateCandidate,
  ObservationDeduplicationResult,
  ObservationIdentityInput,
  TransactionCandidateInput,
  TransactionDeduplicationDecision,
} from './deduplication.types';

const FUZZY_WINDOW_MS = 3 * 60 * 1000;
const REFERENCE_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

@Injectable()
export class DeduplicationService {
  constructor(
    @Inject(DATABASE)
    private readonly db: Database,
  ) {}

  /**
   * Chuẩn hóa nội dung để hai chuỗi chỉ khác khoảng trắng,
   * xuống dòng hoặc chữ hoa/thường tạo cùng một hash.
   */
  normalizeContent(value: string): string {
    return value
      .normalize('NFKC')
      .replace(/\u00a0/g, ' ')
      .replace(/\s+/gu, ' ')
      .trim()
      .toLowerCase();
  }

  /**
   * Chuẩn hóa merchant để so sánh.
   *
   * Ví dụ:
   * "HỦ TIẾU  Mỹ Hằng" và "hu tieu my hang"
   * sẽ thành cùng một giá trị.
   */
  normalizeMerchant(value: string | null): string | null {
    if (!value) {
      return null;
    }

    const normalized = value
      .normalize('NFD')
      .replace(/[Đđ]/g, 'D')
      .replace(/\p{M}/gu, '')
      .toUpperCase()
      .replace(/[^A-Z0-9]+/g, ' ')
      .trim();

    return normalized || null;
  }

  normalizeAccount(value: string | null): string | null {
    if (!value) {
      return null;
    }

    const normalized = value
      .normalize('NFKC')
      .toUpperCase()
      .replace(/[^A-Z0-9]/g, '');

    return normalized || null;
  }

  normalizeReference(value: string | null): string | null {
    if (!value) {
      return null;
    }

    const normalized = value.normalize('NFKC').trim().toUpperCase();

    return normalized || null;
  }

  /**
   * Hash chống việc client gửi lại cùng request.
   *
   * Giữ cùng thuật toán mà ObservationsService đang sử dụng.
   */
  createPayloadHash(input: ObservationIdentityInput): string {
    const fingerprint = JSON.stringify([
      input.userId,
      input.source,
      input.channel,
      input.rawText,
      input.observedAt,
    ]);

    return createHash('sha256').update(fingerprint, 'utf8').digest('hex');
  }

  /**
   * Hash nội dung đã chuẩn hóa.
   *
   * Không đưa channel vào hash để cùng nội dung từ Email và App
   * vẫn có khả năng khớp nhau.
   */
  createNormalizedContentHash(rawText: string): string {
    const normalized = this.normalizeContent(rawText);

    return createHash('sha256').update(normalized, 'utf8').digest('hex');
  }

  /**
   * Chống trùng observation trước khi parser chạy.
   *
   * Thứ tự ưu tiên:
   * 1. sourceMessageId
   * 2. payloadHash
   * 3. normalizedContentHash trong vòng 3 phút
   */
  async findExistingObservation(
    input: ObservationIdentityInput,
  ): Promise<ObservationDeduplicationResult> {
    const payloadHash = this.createPayloadHash(input);
    const normalizedContentHash = this.createNormalizedContentHash(
      input.rawText,
    );

    const sourceMessageId = input.sourceMessageId?.trim() || null;

    if (sourceMessageId) {
      const [bySourceMessageId] = await this.db
        .select()
        .from(transactionObservations)
        .where(
          and(
            eq(transactionObservations.userId, input.userId),
            eq(transactionObservations.source, input.source),
            eq(transactionObservations.channel, input.channel),
            eq(transactionObservations.sourceMessageId, sourceMessageId),
          ),
        )
        .limit(1);

      if (bySourceMessageId) {
        return {
          duplicate: true,
          matchedBy: 'SOURCE_MESSAGE_ID',
          observation: bySourceMessageId,
          payloadHash,
          normalizedContentHash,
        };
      }
    }

    const [byPayloadHash] = await this.db
      .select()
      .from(transactionObservations)
      .where(
        and(
          eq(transactionObservations.userId, input.userId),
          eq(transactionObservations.payloadHash, payloadHash),
        ),
      )
      .limit(1);

    if (byPayloadHash) {
      return {
        duplicate: true,
        matchedBy: 'PAYLOAD_HASH',
        observation: byPayloadHash,
        payloadHash,
        normalizedContentHash,
      };
    }

    const observedAt = new Date(input.observedAt);
    const windowStart = new Date(observedAt.getTime() - FUZZY_WINDOW_MS);
    const windowEnd = new Date(observedAt.getTime() + FUZZY_WINDOW_MS);

    const [byNormalizedContent] = await this.db
      .select()
      .from(transactionObservations)
      .where(
        and(
          eq(transactionObservations.userId, input.userId),
          eq(
            transactionObservations.normalizedContentHash,
            normalizedContentHash,
          ),
          gte(transactionObservations.observedAt, windowStart),
          lte(transactionObservations.observedAt, windowEnd),
        ),
      )
      .limit(1);

    if (byNormalizedContent) {
      return {
        duplicate: true,
        matchedBy: 'NORMALIZED_CONTENT_HASH',
        observation: byNormalizedContent,
        payloadHash,
        normalizedContentHash,
      };
    }

    return {
      duplicate: false,
      matchedBy: null,
      observation: null,
      payloadHash,
      normalizedContentHash,
    };
  }

  /**
   * Chống trùng transaction sau khi parser đã bóc tách dữ liệu.
   *
   * Service chỉ trả quyết định, chưa ghi database.
   */
  async evaluateTransaction(
    input: TransactionCandidateInput,
  ): Promise<TransactionDeduplicationDecision> {
    const referenceDecision = await this.findByReferenceCode(input);

    if (referenceDecision) {
      return referenceDecision;
    }

    return this.findFuzzyCandidates(input);
  }

  private async findByReferenceCode(
    input: TransactionCandidateInput,
  ): Promise<TransactionDeduplicationDecision | null> {
    const referenceCode = this.normalizeReference(input.referenceCode);

    // Mã quá ngắn có nguy cơ là dữ liệu chung, không dùng để tự động gộp.
    if (!referenceCode || referenceCode.length < 6) {
      return null;
    }

    const windowStart = new Date(
      input.transactionTime.getTime() - REFERENCE_WINDOW_MS,
    );

    const windowEnd = new Date(
      input.transactionTime.getTime() + REFERENCE_WINDOW_MS,
    );

    const matches = await this.db
      .select({
        transactionId: transactions.id,
        transactionTime: transactions.transactionTime,
      })
      .from(transactions)
      .where(
        and(
          eq(transactions.userId, input.userId),
          eq(transactions.amount, input.amount),
          eq(transactions.direction, input.direction),
          eq(transactions.kind, 'NORMAL'),
          eq(transactions.reviewStatus, 'CONFIRMED'),
          gte(transactions.transactionTime, windowStart),
          lte(transactions.transactionTime, windowEnd),

          sql`upper(trim(${transactions.referenceCode})) = ${referenceCode}`,
        ),
      )
      .limit(2);

    if (matches.length === 0) {
      return null;
    }

    if (matches.length === 1) {
      return {
        kind: 'EXACT_DUPLICATE',
        canonicalTransactionId: matches[0].transactionId,
        reason: 'REFERENCE_CODE',
        confidence: 100,
      };
    }

    return {
      kind: 'PENDING_REVIEW',
      reason: 'MULTIPLE_REFERENCE_MATCHES',
      candidates: matches.map((match) => ({
        transactionId: match.transactionId,
        timeDeltaMs: Math.abs(
          match.transactionTime.getTime() - input.transactionTime.getTime(),
        ),
        merchantMatched: false,
        accountMatched: false,
        confidence: 100,
      })),
    };
  }

  private async findFuzzyCandidates(
    input: TransactionCandidateInput,
  ): Promise<TransactionDeduplicationDecision> {
    const windowStart = new Date(
      input.transactionTime.getTime() - FUZZY_WINDOW_MS,
    );

    const windowEnd = new Date(
      input.transactionTime.getTime() + FUZZY_WINDOW_MS,
    );

    const rows = await this.db
      .select({
        transactionId: transactions.id,
        transactionTime: transactions.transactionTime,
        merchantName: transactions.merchantName,
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
          eq(transactions.direction, input.direction),
          eq(transactions.kind, 'NORMAL'),
          eq(transactions.reviewStatus, 'CONFIRMED'),
          gte(transactions.transactionTime, windowStart),
          lte(transactions.transactionTime, windowEnd),
        ),
      )
      .limit(20);

    const inputMerchant = this.normalizeMerchant(input.merchantName);

    const inputAccount = this.normalizeAccount(input.counterpartyAccount);

    /*
     * Một transaction có thể có nhiều observations.
     * Dùng Map để chỉ trả một candidate cho mỗi transaction.
     */
    const candidateMap = new Map<string, DuplicateCandidate>();

    for (const row of rows) {
      // Fuzzy matching chỉ áp dụng khi khác nguồn hoặc khác kênh.
      if (row.source === input.source && row.channel === input.channel) {
        continue;
      }

      const existingMerchant = this.normalizeMerchant(row.merchantName);

      const existingAccount = this.normalizeAccount(row.counterpartyAccount);

      const merchantMatched =
        inputMerchant !== null &&
        existingMerchant !== null &&
        inputMerchant === existingMerchant;

      const accountMatched =
        inputAccount !== null &&
        existingAccount !== null &&
        inputAccount === existingAccount;

      const timeDeltaMs = Math.abs(
        row.transactionTime.getTime() - input.transactionTime.getTime(),
      );

      const confidence = accountMatched ? 95 : merchantMatched ? 90 : 60;

      const previous = candidateMap.get(row.transactionId);

      if (!previous || confidence > previous.confidence) {
        candidateMap.set(row.transactionId, {
          transactionId: row.transactionId,
          timeDeltaMs,
          merchantMatched,
          accountMatched,
          confidence,
        });
      }
    }

    const candidates = [...candidateMap.values()].sort(
      (left, right) => left.timeDeltaMs - right.timeDeltaMs,
    );

    if (candidates.length === 0) {
      return {
        kind: 'NO_DUPLICATE',
      };
    }

    // Nhiều ứng viên luôn cần người dùng xác nhận.
    if (candidates.length > 1) {
      return {
        kind: 'PENDING_REVIEW',
        reason: 'MULTIPLE_FUZZY_MATCHES',
        candidates,
      };
    }

    const candidate = candidates[0];

    if (candidate.accountMatched) {
      return {
        kind: 'AUTO_MERGE',
        canonicalTransactionId: candidate.transactionId,
        reason: 'COUNTERPARTY_ACCOUNT',
        confidence: candidate.confidence,
      };
    }

    if (candidate.merchantMatched) {
      return {
        kind: 'AUTO_MERGE',
        canonicalTransactionId: candidate.transactionId,
        reason: 'MERCHANT_NAME',
        confidence: candidate.confidence,
      };
    }

    return {
      kind: 'PENDING_REVIEW',
      reason: 'AMOUNT_TIME_ONLY',
      candidates,
    };
  }
}
