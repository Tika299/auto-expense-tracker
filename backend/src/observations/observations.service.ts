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
import { CategorizationService } from '../rule-engine/categorization.service';
import { ReconciliationService } from '../rule-engine/reconciliation.service';
import type { ReconciliationDecision } from '../rule-engine/reconciliation.types';

type ObservationRecord = typeof transactionObservations.$inferSelect;

@Injectable()
export class ObservationsService {
  constructor(
    @Inject(DATABASE)
    private readonly db: Database,

    private readonly deduplicationService: DeduplicationService,

    private readonly reconciliationService: ReconciliationService,

    private readonly categorizationService: CategorizationService,
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

    return this.db.transaction(async (tx) => {
      /*
       * Chỉ chạy Reconciliation khi Deduplication đã chắc chắn
       * đây không phải giao dịch trùng.
       *
       * Nếu Deduplication đang PENDING_REVIEW thì ưu tiên
       * xử lý nghi vấn trùng trước.
       */
      let reconciliation: ReconciliationDecision = {
        kind: 'NO_MATCH',
      };

      if (decision.kind === 'NO_DUPLICATE') {
        reconciliation = await this.reconciliationService.evaluate(
          {
            userId,
            walletId: observation.walletId!,

            source: observation.source,
            channel: observation.channel,

            amount: parsed.amount,
            direction: parsed.direction,
            transactionTime,

            referenceCode: parsed.reference_code,

            counterpartyAccount: parsed.counterparty_account,
          },
          tx,
        );
      }

      const duplicatePendingReview = decision.kind === 'PENDING_REVIEW';

      const internalTransferPendingReview =
        reconciliation.kind === 'PENDING_REVIEW';

      const autoConfirmedInternalTransfer =
        reconciliation.kind === 'AUTO_CONFIRMED';

      const pendingReview =
        duplicatePendingReview || internalTransferPendingReview;

      /*
       * Chỉ gán INTERNAL_TRANSFER khi đã đủ bằng chứng
       * để tự động xác nhận.
       *
       * Giao dịch đang PENDING_REVIEW vẫn giữ kind NORMAL
       * cho đến khi người dùng xác nhận.
       */
      const newTransactionKind = autoConfirmedInternalTransfer
        ? ('INTERNAL_TRANSFER' as const)
        : ('NORMAL' as const);

      const newTransactionReviewStatus = pendingReview
        ? ('PENDING_REVIEW' as const)
        : ('CONFIRMED' as const);

      /*
       * CategorizationService tự trả NONE nếu:
       * - kind là INTERNAL_TRANSFER; hoặc
       * - reviewStatus là PENDING_REVIEW.
       */
      const categorization = await this.categorizationService.categorize(
        {
          userId,
          direction: parsed.direction,
          kind: newTransactionKind,
          reviewStatus: newTransactionReviewStatus,
          merchantName: parsed.merchant_name,
          counterpartyAccount: parsed.counterparty_account,
          rawText: observation.rawText,
        },
        tx,
      );

      const [createdTransaction] = await tx
        .insert(transactions)
        .values({
          userId,
          walletId: observation.walletId!,

          categoryId: categorization.categoryId,

          amount: parsed.amount,
          direction: parsed.direction,
          transactionTime,

          referenceCode: parsed.reference_code,
          merchantName: parsed.merchant_name,
          counterpartyAccount: parsed.counterparty_account,

          kind: newTransactionKind,
          reviewStatus: newTransactionReviewStatus,

          categorizationSource: categorization.source,
          matchedRuleId: categorization.matchedRuleId,

          note: null,
          origin: 'PARSER',
        })
        .returning();

      if (!createdTransaction) {
        throw new Error('Không thể tạo transaction.');
      }

      let createdLinks: Array<typeof transactionLinks.$inferSelect> = [];

      /*
       * Trường hợp Deduplication nghi ngờ đây là giao dịch trùng.
       */
      if (
        decision.kind === 'PENDING_REVIEW' &&
        decision.candidates.length > 0
      ) {
        createdLinks = await tx
          .insert(transactionLinks)
          .values(
            decision.candidates.map((candidate) => ({
              userId,

              primaryTransactionId: candidate.transactionId,
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

        if (createdLinks.length !== decision.candidates.length) {
          throw new Error(
            'Không thể tạo đầy đủ liên kết giao dịch nghi trùng.',
          );
        }
      } else if (reconciliation.kind === 'AUTO_CONFIRMED') {
        /*
         * Giao dịch cũ và giao dịch mới là hai chiều
         * của một lần chuyển tiền nội bộ.
         */
        const candidate = reconciliation.candidate;
        const resolvedAt = new Date();

        const [updatedCandidate] = await tx
          .update(transactions)
          .set({
            kind: 'INTERNAL_TRANSFER',

            /*
             * INTERNAL_TRANSFER không thuộc danh mục thu hoặc chi.
             */
            categoryId: null,
            categorizationSource: 'NONE',
            matchedRuleId: null,

            updatedAt: resolvedAt,
          })
          .where(
            and(
              eq(transactions.id, candidate.transactionId),
              eq(transactions.userId, userId),
              eq(transactions.kind, 'NORMAL'),
              eq(transactions.reviewStatus, 'CONFIRMED'),
            ),
          )
          .returning();

        /*
         * Nếu không update được, candidate có thể vừa bị
         * request khác xử lý. Throw sẽ rollback transaction mới.
         */
        if (!updatedCandidate) {
          throw new Error(
            'Giao dịch đối ứng vừa thay đổi, không thể tự động đối soát.',
          );
        }

        createdLinks = await tx
          .insert(transactionLinks)
          .values({
            userId,

            primaryTransactionId: candidate.transactionId,
            relatedTransactionId: createdTransaction.id,

            linkType: 'INTERNAL_TRANSFER',
            status: 'AUTO_CONFIRMED',
            confidence: candidate.confidence,

            metadata: {
              reason: reconciliation.reason,
              timeDeltaMs: candidate.timeDeltaMs,

              referenceMatched: candidate.referenceMatched,
              accountMatched: candidate.accountMatched,

              candidateSource: candidate.source,
              candidateChannel: candidate.channel,

              incomingSource: observation.source,
              incomingChannel: observation.channel,
            },

            resolvedAt,
          })
          .onConflictDoNothing()
          .returning();

        if (createdLinks.length !== 1) {
          throw new Error('Không thể tạo liên kết chuyển tiền nội bộ.');
        }
      } else if (
        reconciliation.kind === 'PENDING_REVIEW' &&
        reconciliation.candidates.length > 0
      ) {
        /*
         * Chưa đủ bằng chứng tự động xác nhận.
         *
         * Transaction mới được đặt PENDING_REVIEW.
         * Các candidate cũ tạm thời chưa bị thay đổi.
         */
        createdLinks = await tx
          .insert(transactionLinks)
          .values(
            reconciliation.candidates.map((candidate) => ({
              userId,

              primaryTransactionId: candidate.transactionId,
              relatedTransactionId: createdTransaction.id,

              linkType: 'INTERNAL_TRANSFER' as const,
              status: 'PENDING_REVIEW' as const,
              confidence: candidate.confidence,

              metadata: {
                reason: reconciliation.reason,
                timeDeltaMs: candidate.timeDeltaMs,

                referenceMatched: candidate.referenceMatched,
                accountMatched: candidate.accountMatched,

                candidateSource: candidate.source,
                candidateChannel: candidate.channel,

                incomingSource: observation.source,
                incomingChannel: observation.channel,
              },
            })),
          )
          .onConflictDoNothing()
          .returning();

        if (createdLinks.length !== reconciliation.candidates.length) {
          throw new Error('Không thể tạo đầy đủ liên kết đối soát nội bộ.');
        }
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
        reconciliation,
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

      counterpartyAccount: parsed.counterparty_account,
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
