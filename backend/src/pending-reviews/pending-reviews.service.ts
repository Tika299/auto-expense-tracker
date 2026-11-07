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
          eq(transactionLinks.userId, userId),
          eq(transactionLinks.status, 'PENDING_REVIEW'),
          eq(transactionLinks.linkType, 'POSSIBLE_DUPLICATE'),
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

  async resolve(
    userId: string,
    reviewId: string,
    dto: ResolvePendingReviewDto,
  ) {
    return this.db.transaction(async (tx) => {
      /*
       * FOR UPDATE ngăn hai request cùng lúc xử lý
       * một review hai lần.
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

      if (link.linkType !== 'POSSIBLE_DUPLICATE') {
        throw new BadRequestException(
          'Loại đối soát này chưa được API hỗ trợ.',
        );
      }

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

      if (dto.decision === 'CONFIRM_DUPLICATE') {
        await this.confirmDuplicate(
          tx as unknown as Database,
          userId,
          primary.id,
          related.id,
        );
      } else {
        await this.keepBoth(tx as unknown as Database, userId, related);
      }

      const resolvedStatus =
        dto.decision === 'CONFIRM_DUPLICATE'
          ? ('USER_CONFIRMED' as const)
          : ('USER_REJECTED' as const);

      const [updatedLink] = await tx
        .update(transactionLinks)
        .set({
          status: resolvedStatus,
          resolvedAt,
          metadata: {
            ...link.metadata,
            decision: dto.decision,
            resolutionNote: dto.note ?? null,
          },
        })
        .where(
          and(
            eq(transactionLinks.id, reviewId),
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

      return {
        review: updatedLink,
        decision: dto.decision,
        primaryTransactionId: primary.id,
        relatedTransactionId: related.id,
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

  private async keepBoth(
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
