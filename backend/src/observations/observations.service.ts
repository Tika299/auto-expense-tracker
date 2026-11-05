import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { and, desc, eq } from 'drizzle-orm';
import { DATABASE, type Database } from '../database/database.module';
import {
  transactionLinks,
  transactionObservations,
  transactions,
  wallets,
} from '../database/schema';
import { parseTransaction } from '../parser/parser';
import { ParseError } from '../parser/types';
import { CreateObservationDto } from './dto/create-observation.dto';
import { DeduplicationService } from '../rule-engine/deduplication.service';
import type { TransactionDeduplicationDecision } from '../rule-engine/deduplication.types';

type ObservationRecord = typeof transactionObservations.$inferSelect;

@Injectable()
export class ObservationsService {
  constructor(
    @Inject(DATABASE)
    private readonly db: Database,

    private readonly deduplicationService: DeduplicationService,
  ) {}

  /**
   * Hash này dùng để chống việc client gửi lại cùng một payload.
   *
   * Client phải gửi lại observedAt ban đầu khi retry,
   * không được tạo observedAt mới cho mỗi lần gửi.
   */

  private async verifyWalletOwnership(userId: string, walletId: string) {
    const [wallet] = await this.db
      .select()
      .from(wallets)
      .where(and(eq(wallets.id, walletId), eq(wallets.userId, userId)))
      .limit(1);

    if (!wallet) {
      throw new NotFoundException('Không tìm thấy ví thuộc tài khoản của bạn.');
    }

    if (wallet.isArchived) {
      throw new BadRequestException(
        'Ví đã được lưu trữ, không thể nhận giao dịch mới.',
      );
    }

    return wallet;
  }

  private async attachDuplicateObservation(
    userId: string,
    observation: ObservationRecord,
    parsed: ReturnType<typeof parseTransaction>,
    decision: Extract<
      TransactionDeduplicationDecision,
      { kind: 'EXACT_DUPLICATE' | 'AUTO_MERGE' }
    >,
  ) {
    return this.db.transaction(async (tx) => {
      const [updatedObservation] = await tx
        .update(transactionObservations)
        .set({
          status: 'DUPLICATE',
          transactionId: decision.canonicalTransactionId,
          parserRule: parsed.parser_rule,
          parseErrorCode: null,
        })
        .where(
          and(
            eq(transactionObservations.id, observation.id),
            eq(transactionObservations.userId, userId),
            eq(transactionObservations.status, 'PENDING'),
          ),
        )
        .returning();

      if (!updatedObservation) {
        throw new Error('Observation không còn ở trạng thái PENDING.');
      }

      return {
        duplicate: true as const,
        stage: 'TRANSACTION' as const,
        observation: updatedObservation,
        canonicalTransactionId: decision.canonicalTransactionId,
        deduplication: {
          kind: decision.kind,
          reason: decision.reason,
          confidence: decision.confidence,
        },
      };
    });
  }

  private async persistNewTransaction(
    userId: string,
    observation: ObservationRecord,
    parsed: ReturnType<typeof parseTransaction>,
    transactionTime: Date,
    decision: Extract<
      TransactionDeduplicationDecision,
      { kind: 'NO_DUPLICATE' | 'PENDING_REVIEW' }
    >,
  ) {
    if (!observation.walletId) {
      throw new BadRequestException('Observation chưa được gắn với ví.');
    }

    const pendingReview = decision.kind === 'PENDING_REVIEW';

    return this.db.transaction(async (tx) => {
      const [createdTransaction] = await tx
        .insert(transactions)
        .values({
          userId,
          walletId: observation.walletId!,
          categoryId: null,

          amount: parsed.amount,
          direction: parsed.direction,
          transactionTime,

          referenceCode: parsed.reference_code,
          merchantName: parsed.merchant_name,

          // Parser hiện chưa trả trường này.
          counterpartyAccount: null,

          kind: 'NORMAL',
          reviewStatus: pendingReview ? 'PENDING_REVIEW' : 'CONFIRMED',

          categorizationSource: 'NONE',
          matchedRuleId: null,

          note: null,
          origin: 'PARSER',
        })
        .returning();

      if (!createdTransaction) {
        throw new Error('Không thể tạo transaction.');
      }

      let createdLinks: Array<typeof transactionLinks.$inferSelect> = [];

      if (
        decision.kind === 'PENDING_REVIEW' &&
        decision.candidates.length > 0
      ) {
        createdLinks = await tx
          .insert(transactionLinks)
          .values(
            decision.candidates.map((candidate) => ({
              userId,

              // Transaction cũ là primary.
              primaryTransactionId: candidate.transactionId,

              // Transaction vừa tạo là related.
              relatedTransactionId: createdTransaction.id,

              linkType: 'POSSIBLE_DUPLICATE' as const,
              status: 'PENDING_REVIEW' as const,
              confidence: candidate.confidence,

              metadata: {
                reason: decision.reason,
                timeDeltaMs: candidate.timeDeltaMs,
                merchantMatched: candidate.merchantMatched,
                accountMatched: candidate.accountMatched,
              },
            })),
          )
          .onConflictDoNothing()
          .returning();
      }

      const [updatedObservation] = await tx
        .update(transactionObservations)
        .set({
          status: pendingReview ? 'PENDING_REVIEW' : 'PARSED',

          transactionId: createdTransaction.id,
          parserRule: parsed.parser_rule,
          parseErrorCode: null,
        })
        .where(
          and(
            eq(transactionObservations.id, observation.id),
            eq(transactionObservations.userId, userId),
            eq(transactionObservations.status, 'PENDING'),
          ),
        )
        .returning();

      if (!updatedObservation) {
        throw new Error('Observation không còn ở trạng thái PENDING.');
      }

      return {
        duplicate: false as const,
        pendingReview,
        observation: updatedObservation,
        transaction: createdTransaction,
        links: createdLinks,
        deduplication: decision,
      };
    });
  }

  private async parseAndPersist(
    userId: string,
    observation: ObservationRecord,
  ) {
    if (!observation.walletId) {
      throw new BadRequestException(
        'Observation chưa được gắn với ví nên không thể xử lý.',
      );
    }

    let parsed: ReturnType<typeof parseTransaction>;

    try {
      parsed = parseTransaction({
        source: observation.source,
        channel: observation.channel,
        rawText: observation.rawText,
        observedAt: observation.observedAt.toISOString(),
      });
    } catch (error) {
      if (error instanceof ParseError) {
        const [rejected] = await this.db
          .update(transactionObservations)
          .set({
            status: 'REJECTED',
            parseErrorCode: error.code,
          })
          .where(
            and(
              eq(transactionObservations.id, observation.id),
              eq(transactionObservations.userId, userId),
            ),
          )
          .returning();

        throw new UnprocessableEntityException({
          code: error.code,
          message: 'Định dạng thông báo chưa được Parser hỗ trợ.',
          observation: rejected,
        });
      }

      throw new InternalServerErrorException({
        code: 'PARSER_INTERNAL_ERROR',
        observationId: observation.id,
      });
    }

    const transactionTime = new Date(parsed.transaction_time);

    if (Number.isNaN(transactionTime.getTime())) {
      throw new InternalServerErrorException({
        code: 'INVALID_PARSED_TRANSACTION_TIME',
        observationId: observation.id,
      });
    }

    const decision = await this.deduplicationService.evaluateTransaction({
      userId,

      source: observation.source,
      channel: observation.channel,

      amount: parsed.amount,
      direction: parsed.direction,
      transactionTime,

      referenceCode: parsed.reference_code,
      merchantName: parsed.merchant_name,

      // Parser hiện chưa bóc tách STK đối tác.
      counterpartyAccount: null,
    });

    if (decision.kind === 'EXACT_DUPLICATE' || decision.kind === 'AUTO_MERGE') {
      return this.attachDuplicateObservation(
        userId,
        observation,
        parsed,
        decision,
      );
    }

    return this.persistNewTransaction(
      userId,
      observation,
      parsed,
      transactionTime,
      decision,
    );
  }

  async create(userId: string, dto: CreateObservationDto) {
    await this.verifyWalletOwnership(userId, dto.walletId);

    const identityInput = {
      userId,
      source: dto.source,
      channel: dto.channel,
      sourceMessageId: dto.sourceMessageId ?? null,
      rawText: dto.rawText,
      observedAt: dto.observedAt,
    };

    /*
     * Kiểm tra trước khi insert để trả kết quả dễ hiểu
     * và tránh chạy parser không cần thiết.
     */
    const identity =
      await this.deduplicationService.findExistingObservation(identityInput);

    if (identity.duplicate && identity.observation) {
      return {
        duplicate: true as const,
        stage: 'OBSERVATION' as const,
        matchedBy: identity.matchedBy,
        observation: identity.observation,
      };
    }

    /*
     * Không truyền conflict target để PostgreSQL bảo vệ cả:
     * - observations_user_hash_uidx
     * - observations_source_message_uidx
     */
    const [observation] = await this.db
      .insert(transactionObservations)
      .values({
        userId,
        walletId: dto.walletId,

        source: dto.source,
        channel: dto.channel,
        sourceMessageId: dto.sourceMessageId?.trim() || null,

        rawText: dto.rawText,
        rawPayload: dto.rawPayload,

        payloadHash: identity.payloadHash,
        normalizedContentHash: identity.normalizedContentHash,

        observedAt: new Date(dto.observedAt),
        status: 'PENDING',
      })
      .onConflictDoNothing()
      .returning();

    if (!observation) {
      /*
       * Hai request có thể vượt qua bước SELECT cùng lúc.
       * Unique index chỉ cho một request insert thành công.
       *
       * Sau khi conflict, đọc lại observation đã thắng.
       */
      const concurrentDuplicate =
        await this.deduplicationService.findExistingObservation(identityInput);

      if (concurrentDuplicate.duplicate && concurrentDuplicate.observation) {
        return {
          duplicate: true as const,
          stage: 'OBSERVATION' as const,
          matchedBy: concurrentDuplicate.matchedBy,
          observation: concurrentDuplicate.observation,
        };
      }

      throw new InternalServerErrorException({
        code: 'OBSERVATION_CONFLICT_WITHOUT_MATCH',
      });
    }

    return this.parseAndPersist(userId, observation);
  }

  async reprocess(userId: string, observationId: string) {
    const observation = await this.findOne(userId, observationId);

    if (observation.status === 'PARSED' || observation.transactionId) {
      throw new ConflictException('Observation này đã được xử lý thành công.');
    }

    if (!observation.walletId) {
      throw new BadRequestException(
        'Observation chưa được gắn với ví nên không thể xử lý lại.',
      );
    }

    if (observation.status === 'DUPLICATE') {
      throw new ConflictException(
        'Observation trùng lặp không thể được xử lý lại.',
      );
    }

    await this.verifyWalletOwnership(userId, observation.walletId);

    let pendingObservation = observation;

    if (observation.status === 'REJECTED') {
      const [reset] = await this.db
        .update(transactionObservations)
        .set({
          status: 'PENDING',
          parseErrorCode: null,
          parserRule: null,
        })
        .where(
          and(
            eq(transactionObservations.id, observation.id),
            eq(transactionObservations.userId, userId),
            eq(transactionObservations.status, 'REJECTED'),
          ),
        )
        .returning();

      if (!reset) {
        throw new ConflictException(
          'Trạng thái observation vừa thay đổi, vui lòng tải lại.',
        );
      }

      pendingObservation = reset;
    }

    return this.parseAndPersist(userId, pendingObservation);
  }

  async findAll(userId: string) {
    return this.db
      .select()
      .from(transactionObservations)
      .where(eq(transactionObservations.userId, userId))
      .orderBy(
        desc(transactionObservations.observedAt),
        desc(transactionObservations.createdAt),
      )
      .limit(100);
  }

  async findOne(userId: string, observationId: string) {
    const [observation] = await this.db
      .select()
      .from(transactionObservations)
      .where(
        and(
          eq(transactionObservations.id, observationId),
          eq(transactionObservations.userId, userId),
        ),
      )
      .limit(1);

    if (!observation) {
      throw new NotFoundException('Không tìm thấy observation.');
    }

    return observation;
  }
}
