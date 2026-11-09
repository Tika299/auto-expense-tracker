import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { and, desc, eq, inArray } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import { DATABASE, type Database } from '../database/database.module';
import {
  transactionLinks,
  transactionObservations,
  transactions,
} from '../database/schema';
import { CategorizationService } from '../rule-engine/categorization.service';
import { QueryPendingReviewDto } from './dto/query-pending-review.dto';
import { ResolvePendingReviewDto } from './dto/resolve-pending-review.dto';

const primaryTransaction = alias(transactions, 'review_primary_transaction');

const relatedTransaction = alias(transactions, 'review_related_transaction');

@Injectable()
export class PendingReviewsService {
  constructor(
    @Inject(DATABASE)
    private readonly db: Database,

    private readonly categorizationService: CategorizationService,
  ) {}

  async findAll(userId: string, query: QueryPendingReviewDto) {
    return this.db
      .select({
        id: transactionLinks.id,
        linkType: transactionLinks.linkType,
        status: transactionLinks.status,
        confidence: transactionLinks.confidence,
        metadata: transactionLinks.metadata,
        createdAt: transactionLinks.createdAt,

        primaryTransaction: {
          id: primaryTransaction.id,
          walletId: primaryTransaction.walletId,
          categoryId: primaryTransaction.categoryId,
          amount: primaryTransaction.amount,
          direction: primaryTransaction.direction,
          transactionTime: primaryTransaction.transactionTime,
          referenceCode: primaryTransaction.referenceCode,
          merchantName: primaryTransaction.merchantName,
          reviewStatus: primaryTransaction.reviewStatus,
          kind: primaryTransaction.kind,
        },

        relatedTransaction: {
          id: relatedTransaction.id,
          walletId: relatedTransaction.walletId,
          categoryId: relatedTransaction.categoryId,
          amount: relatedTransaction.amount,
          direction: relatedTransaction.direction,
          transactionTime: relatedTransaction.transactionTime,
          referenceCode: relatedTransaction.referenceCode,
          merchantName: relatedTransaction.merchantName,
          reviewStatus: relatedTransaction.reviewStatus,
          kind: relatedTransaction.kind,
        },
      })
      .from(transactionLinks)
      .innerJoin(
        primaryTransaction,
        eq(primaryTransaction.id, transactionLinks.primaryTransactionId),
      )
      .innerJoin(
        relatedTransaction,
        eq(relatedTransaction.id, transactionLinks.relatedTransactionId),
      )
      .where(
        and(
          eq(transactionLinks.userId, userId),
          eq(transactionLinks.status, 'PENDING_REVIEW'),

          query.linkType
            ? eq(transactionLinks.linkType, query.linkType)
            : undefined,
        ),
      )
      .orderBy(desc(transactionLinks.createdAt))
      .limit(query.limit ?? 20)
      .offset(query.offset ?? 0);
  }

  async findOne(userId: string, reviewId: string) {
    const [review] = await this.db
      .select({
        id: transactionLinks.id,
        linkType: transactionLinks.linkType,
        status: transactionLinks.status,
        confidence: transactionLinks.confidence,
        metadata: transactionLinks.metadata,
        createdAt: transactionLinks.createdAt,
        resolvedAt: transactionLinks.resolvedAt,

        primaryTransaction: {
          id: primaryTransaction.id,
          walletId: primaryTransaction.walletId,
          categoryId: primaryTransaction.categoryId,
          amount: primaryTransaction.amount,
          direction: primaryTransaction.direction,
          transactionTime: primaryTransaction.transactionTime,
          referenceCode: primaryTransaction.referenceCode,
          merchantName: primaryTransaction.merchantName,
          reviewStatus: primaryTransaction.reviewStatus,
        },

        relatedTransaction: {
          id: relatedTransaction.id,
          walletId: relatedTransaction.walletId,
          categoryId: relatedTransaction.categoryId,
          amount: relatedTransaction.amount,
          direction: relatedTransaction.direction,
          transactionTime: relatedTransaction.transactionTime,
          referenceCode: relatedTransaction.referenceCode,
          merchantName: relatedTransaction.merchantName,
          reviewStatus: relatedTransaction.reviewStatus,
        },
      })
      .from(transactionLinks)
      .innerJoin(
        primaryTransaction,
        eq(primaryTransaction.id, transactionLinks.primaryTransactionId),
      )
      .innerJoin(
        relatedTransaction,
        eq(relatedTransaction.id, transactionLinks.relatedTransactionId),
      )
      .where(
        and(
          eq(transactionLinks.id, reviewId),
          eq(transactionLinks.userId, userId),
        ),
      )
      .limit(1);

    if (!review) {
      throw new NotFoundException('Không tìm thấy yêu cầu đối soát.');
    }

    const observations = await this.db
      .select({
        id: transactionObservations.id,
        transactionId: transactionObservations.transactionId,
        source: transactionObservations.source,
        channel: transactionObservations.channel,
        rawText: transactionObservations.rawText,
        observedAt: transactionObservations.observedAt,
        status: transactionObservations.status,
      })
      .from(transactionObservations)
      .where(
        and(
          eq(transactionObservations.userId, userId),
          inArray(transactionObservations.transactionId, [
            review.primaryTransaction.id,
            review.relatedTransaction.id,
          ]),
        ),
      )
      .orderBy(desc(transactionObservations.observedAt));

    return {
      ...review,
      observations,
    };
  }

  private validateDecision(
    linkType: 'POSSIBLE_DUPLICATE' | 'INTERNAL_TRANSFER',
    decision: ResolvePendingReviewDto['decision'],
  ) {
    if (linkType === 'POSSIBLE_DUPLICATE') {
      if (decision !== 'CONFIRM_DUPLICATE' && decision !== 'KEEP_BOTH') {
        throw new BadRequestException(
          'POSSIBLE_DUPLICATE chỉ hỗ trợ CONFIRM_DUPLICATE hoặc KEEP_BOTH.',
        );
      }

      return;
    }

    if (
      decision !== 'CONFIRM_INTERNAL_TRANSFER' &&
      decision !== 'KEEP_SEPARATE'
    ) {
      throw new BadRequestException(
        'INTERNAL_TRANSFER chỉ hỗ trợ CONFIRM_INTERNAL_TRANSFER hoặc KEEP_SEPARATE.',
      );
    }
  }

  private async resolveLink(
    tx: Database,
    userId: string,
    link: typeof transactionLinks.$inferSelect,
    dto: ResolvePendingReviewDto,
    status: 'USER_CONFIRMED' | 'USER_REJECTED',
    resolvedAt: Date,
  ) {
    const [updatedLink] = await tx
      .update(transactionLinks)
      .set({
        status,
        resolvedAt,

        metadata: {
          ...link.metadata,
          decision: dto.decision,
          resolutionNote: dto.note ?? null,
        },
      })
      .where(
        and(
          eq(transactionLinks.id, link.id),
          eq(transactionLinks.userId, userId),
          eq(transactionLinks.status, 'PENDING_REVIEW'),
        ),
      )
      .returning();

    if (!updatedLink) {
      throw new ConflictException(
        'Yêu cầu đối soát đã được xử lý bởi request khác.',
      );
    }

    return updatedLink;
  }

  private async rejectOtherPendingLinks(
    tx: Database,
    userId: string,
    relatedTransactionId: string,
    resolvedAt: Date,
  ) {
    await tx
      .update(transactionLinks)
      .set({
        status: 'USER_REJECTED',
        resolvedAt,
      })
      .where(
        and(
          eq(transactionLinks.userId, userId),

          eq(transactionLinks.relatedTransactionId, relatedTransactionId),

          eq(transactionLinks.status, 'PENDING_REVIEW'),
        ),
      );
  }

  private async hasRemainingPendingLinks(
    tx: Database,
    userId: string,
    relatedTransactionId: string,
  ) {
    const [remainingLink] = await tx
      .select({
        id: transactionLinks.id,
      })
      .from(transactionLinks)
      .where(
        and(
          eq(transactionLinks.userId, userId),

          eq(transactionLinks.relatedTransactionId, relatedTransactionId),

          eq(transactionLinks.status, 'PENDING_REVIEW'),
        ),
      )
      .limit(1);

    return Boolean(remainingLink);
  }

  private async confirmInternalTransfer(
    tx: Database,
    userId: string,
    primary: typeof transactions.$inferSelect,
    related: typeof transactions.$inferSelect,
  ) {
    /*
     * Kiểm tra lại tính hợp lệ tại thời điểm xử lý.
     */
    if (primary.amount !== related.amount) {
      throw new BadRequestException('Hai giao dịch không cùng số tiền.');
    }

    if (primary.direction === related.direction) {
      throw new BadRequestException(
        'Chuyển tiền nội bộ phải gồm một chiều IN và một chiều OUT.',
      );
    }

    if (primary.walletId === related.walletId) {
      throw new BadRequestException(
        'Chuyển tiền nội bộ phải xảy ra giữa hai ví khác nhau.',
      );
    }

    const updatedAt = new Date();

    /*
     * Cả hai chiều đều là INTERNAL_TRANSFER.
     * Xóa category vì không phải thu nhập hoặc chi tiêu.
     */
    await tx
      .update(transactions)
      .set({
        kind: 'INTERNAL_TRANSFER',
        reviewStatus: 'CONFIRMED',

        categoryId: null,
        categorizationSource: 'NONE',
        matchedRuleId: null,

        updatedAt,
      })
      .where(
        and(
          eq(transactions.userId, userId),
          inArray(transactions.id, [primary.id, related.id]),
        ),
      );

    /*
     * Observation của giao dịch mới không còn chờ review.
     */
    await tx
      .update(transactionObservations)
      .set({
        status: 'PARSED',
      })
      .where(
        and(
          eq(transactionObservations.userId, userId),

          inArray(transactionObservations.transactionId, [
            primary.id,
            related.id,
          ]),

          eq(transactionObservations.status, 'PENDING_REVIEW'),
        ),
      );
  }

  async resolve(
    userId: string,
    reviewId: string,
    dto: ResolvePendingReviewDto,
  ) {
    return this.db.transaction(async (tx) => {
      /*
       * Khóa review để ngăn cùng một review
       * bị xử lý hai lần đồng thời.
       */
      const [link] = await tx
        .select()
        .from(transactionLinks)
        .where(
          and(
            eq(transactionLinks.id, reviewId),
            eq(transactionLinks.userId, userId),
          ),
        )
        .limit(1)
        .for('update');

      if (!link) {
        throw new NotFoundException('Không tìm thấy yêu cầu đối soát.');
      }

      if (link.status !== 'PENDING_REVIEW') {
        throw new ConflictException('Yêu cầu đối soát này đã được xử lý.');
      }

      this.validateDecision(link.linkType, dto.decision);

      const transactionRows = await tx
        .select()
        .from(transactions)
        .where(
          and(
            eq(transactions.userId, userId),

            inArray(transactions.id, [
              link.primaryTransactionId,
              link.relatedTransactionId,
            ]),
          ),
        );

      const primary = transactionRows.find(
        (item) => item.id === link.primaryTransactionId,
      );

      const related = transactionRows.find(
        (item) => item.id === link.relatedTransactionId,
      );

      if (!primary || !related) {
        throw new NotFoundException(
          'Không tìm thấy đầy đủ giao dịch cần đối soát.',
        );
      }

      const resolvedAt = new Date();

      let updatedLink: typeof transactionLinks.$inferSelect;

      let relatedStillPending = false;

      if (link.linkType === 'POSSIBLE_DUPLICATE') {
        if (dto.decision === 'CONFIRM_DUPLICATE') {
          await this.confirmDuplicate(
            tx as unknown as Database,
            userId,
            primary.id,
            related.id,
          );

          updatedLink = await this.resolveLink(
            tx as unknown as Database,
            userId,
            link,
            dto,
            'USER_CONFIRMED',
            resolvedAt,
          );

          /*
           * Transaction related đã được xác định là trùng.
           * Những ứng viên khác không còn giá trị.
           */
          await this.rejectOtherPendingLinks(
            tx as unknown as Database,
            userId,
            related.id,
            resolvedAt,
          );
        } else {
          /*
           * Chỉ từ chối link đang chọn trước.
           */
          updatedLink = await this.resolveLink(
            tx as unknown as Database,
            userId,
            link,
            dto,
            'USER_REJECTED',
            resolvedAt,
          );

          relatedStillPending = await this.hasRemainingPendingLinks(
            tx as unknown as Database,
            userId,
            related.id,
          );

          /*
           * Chỉ xác nhận transaction bình thường nếu
           * không còn ứng viên nào khác.
           */
          if (!relatedStillPending) {
            await this.confirmAsSeparateTransaction(
              tx as unknown as Database,
              userId,
              related,
            );
          }
        }
      } else {
        if (dto.decision === 'CONFIRM_INTERNAL_TRANSFER') {
          await this.confirmInternalTransfer(
            tx as unknown as Database,
            userId,
            primary,
            related,
          );

          updatedLink = await this.resolveLink(
            tx as unknown as Database,
            userId,
            link,
            dto,
            'USER_CONFIRMED',
            resolvedAt,
          );

          /*
           * Người dùng đã chọn đúng transaction đối ứng.
           * Các ứng viên khác được tự động từ chối.
           */
          await this.rejectOtherPendingLinks(
            tx as unknown as Database,
            userId,
            related.id,
            resolvedAt,
          );
        } else {
          updatedLink = await this.resolveLink(
            tx as unknown as Database,
            userId,
            link,
            dto,
            'USER_REJECTED',
            resolvedAt,
          );

          relatedStillPending = await this.hasRemainingPendingLinks(
            tx as unknown as Database,
            userId,
            related.id,
          );

          if (!relatedStillPending) {
            await this.confirmAsSeparateTransaction(
              tx as unknown as Database,
              userId,
              related,
            );
          }
        }
      }

      return {
        review: updatedLink,

        linkType: link.linkType,
        decision: dto.decision,

        primaryTransactionId: primary.id,
        relatedTransactionId: related.id,

        relatedStillPending,
      };
    });
  }

  private async confirmDuplicate(
    tx: Database,
    userId: string,
    primaryTransactionId: string,
    relatedTransactionId: string,
  ) {
    /*
     * Transaction chính được giữ lại và tính vào báo cáo.
     */
    await tx
      .update(transactions)
      .set({
        reviewStatus: 'CONFIRMED',
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(transactions.id, primaryTransactionId),
          eq(transactions.userId, userId),
        ),
      );

    /*
     * Transaction liên quan được giữ làm lịch sử,
     * nhưng không còn được tính vào báo cáo.
     */
    await tx
      .update(transactions)
      .set({
        reviewStatus: 'EXCLUDED',
        categoryId: null,
        categorizationSource: 'NONE',
        matchedRuleId: null,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(transactions.id, relatedTransactionId),
          eq(transactions.userId, userId),
        ),
      );

    /*
     * Observation của transaction trùng được gắn về
     * transaction chính.
     */
    await tx
      .update(transactionObservations)
      .set({
        transactionId: primaryTransactionId,
        status: 'DUPLICATE',
      })
      .where(
        and(
          eq(transactionObservations.userId, userId),
          eq(transactionObservations.transactionId, relatedTransactionId),
        ),
      );
  }

  private async confirmAsSeparateTransaction(
    tx: Database,
    userId: string,
    related: typeof transactions.$inferSelect,
  ) {
    const [observation] = await tx
      .select({
        rawText: transactionObservations.rawText,
      })
      .from(transactionObservations)
      .where(
        and(
          eq(transactionObservations.userId, userId),
          eq(transactionObservations.transactionId, related.id),
        ),
      )
      .orderBy(desc(transactionObservations.observedAt))
      .limit(1);

    /*
     * Khi người dùng xác nhận đây là giao dịch thật,
     * chạy CategorizationService vì trước đó transaction
     * PENDING_REVIEW chưa được phân loại.
     */
    const categorization = await this.categorizationService.categorize(
      {
        userId,
        direction: related.direction,
        kind: 'NORMAL',
        reviewStatus: 'CONFIRMED',
        merchantName: related.merchantName,
        counterpartyAccount: related.counterpartyAccount,
        rawText: observation?.rawText ?? null,
      },
      tx,
    );

    await tx
      .update(transactions)
      .set({
        kind: 'NORMAL',
        reviewStatus: 'CONFIRMED',
        categoryId: categorization.categoryId,
        categorizationSource: categorization.source,
        matchedRuleId: categorization.matchedRuleId,
        updatedAt: new Date(),
      })
      .where(
        and(eq(transactions.id, related.id), eq(transactions.userId, userId)),
      );

    await tx
      .update(transactionObservations)
      .set({
        status: 'PARSED',
      })
      .where(
        and(
          eq(transactionObservations.userId, userId),
          eq(transactionObservations.transactionId, related.id),
          eq(transactionObservations.status, 'PENDING_REVIEW'),
        ),
      );
  }
}
