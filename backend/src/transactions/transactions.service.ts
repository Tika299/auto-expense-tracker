import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { and, desc, eq, gte, lte } from 'drizzle-orm';
import { DATABASE, type Database } from '../database/database.module';
import { categories, transactions, wallets } from '../database/schema';
import { CreateTransactionDto } from './dto/create-transaction.dto';
import { UpdateTransactionDto } from './dto/update-transaction.dto';
import { QueryTransactionDto } from './dto/query-transaction.dto';

@Injectable()
export class TransactionsService {
  constructor(
    @Inject(DATABASE)
    private readonly db: Database,
  ) {}

  /**
   * Kiểm tra ví thuộc về user và chưa bị archive
   */
  private async verifyWalletOwnership(userId: string, walletId: string) {
    const [wallet] = await this.db
      .select()
      .from(wallets)
      .where(and(eq(wallets.id, walletId), eq(wallets.userId, userId)));

    if (!wallet) {
      throw new NotFoundException('Không tìm thấy ví thuộc tài khoản của bạn.');
    }

    if (wallet.isArchived) {
      throw new BadRequestException(
        'Ví này đã được lưu trữ, không thể thêm hoặc chuyển giao dịch vào ví.',
      );
    }

    return wallet;
  }

  /**
   * Kiểm tra category thuộc về user, chưa bị archive và khớp với direction (IN/OUT)
   */
  private async verifyCategoryAndDirection(
    userId: string,
    categoryId: string,
    direction: 'IN' | 'OUT',
  ) {
    const [category] = await this.db
      .select()
      .from(categories)
      .where(and(eq(categories.id, categoryId), eq(categories.userId, userId)));

    if (!category) {
      throw new NotFoundException(
        'Không tìm thấy danh mục thuộc tài khoản của bạn.',
      );
    }

    if (category.isArchived) {
      throw new BadRequestException(
        'Danh mục này đã được lưu trữ, không thể gắn cho giao dịch.',
      );
    }

    if (category.scope !== 'BOTH' && category.scope !== direction) {
      throw new BadRequestException(
        `Danh mục "${category.name}" chỉ dành cho giao dịch ${category.scope}, không hợp lệ với giao dịch ${direction}.`,
      );
    }

    return category;
  }

  async create(userId: string, dto: CreateTransactionDto) {
    await this.verifyWalletOwnership(userId, dto.walletId);

    if (dto.categoryId) {
      await this.verifyCategoryAndDirection(
        userId,
        dto.categoryId,
        dto.direction,
      );
    }

    const [created] = await this.db
      .insert(transactions)
      .values({
        userId,
        walletId: dto.walletId,
        categoryId: dto.categoryId ?? null,
        amount: dto.amount,
        direction: dto.direction,
        transactionTime: new Date(dto.transactionTime),
        merchantName: dto.merchantName ?? null,
        referenceCode: dto.referenceCode ?? null,
        categorizationSource: dto.categoryId ? 'MANUAL' : 'NONE',
        matchedRuleId: null,
        note: dto.note ?? null,
        origin: 'MANUAL',
      })
      .returning();

    return created;
  }

  async findAll(userId: string, query: QueryTransactionDto) {
    const conditions = [eq(transactions.userId, userId)];

    if (query.walletId) {
      conditions.push(eq(transactions.walletId, query.walletId));
    }

    if (query.categoryId) {
      conditions.push(eq(transactions.categoryId, query.categoryId));
    }

    if (query.direction) {
      conditions.push(eq(transactions.direction, query.direction));
    }

    if (query.from) {
      conditions.push(gte(transactions.transactionTime, new Date(query.from)));
    }

    if (query.to) {
      conditions.push(lte(transactions.transactionTime, new Date(query.to)));
    }

    return this.db
      .select()
      .from(transactions)
      .where(and(...conditions))
      .orderBy(desc(transactions.transactionTime), desc(transactions.createdAt))
      .limit(query.limit ?? 20)
      .offset(query.offset ?? 0);
  }

  async findOne(userId: string, transactionId: string) {
    const [transaction] = await this.db
      .select()
      .from(transactions)
      .where(
        and(
          eq(transactions.id, transactionId),
          eq(transactions.userId, userId),
        ),
      );

    if (!transaction) {
      throw new NotFoundException('Không tìm thấy giao dịch.');
    }

    return transaction;
  }

  async update(
    userId: string,
    transactionId: string,
    dto: UpdateTransactionDto,
  ) {
    const existing = await this.findOne(userId, transactionId);

    // 1. Nếu đổi sang ví khác, kiểm tra quyền sở hữu ví mới
    if (dto.walletId && dto.walletId !== existing.walletId) {
      await this.verifyWalletOwnership(userId, dto.walletId);
    }

    // 2. Xác định direction và categoryId sau khi cập nhật để kiểm tra chéo
    const targetDirection = dto.direction ?? existing.direction;
    const targetCategoryId =
      dto.categoryId !== undefined ? dto.categoryId : existing.categoryId;

    // Nếu người dùng truyền categoryId mới hoặc đổi direction khi giao dịch đang có sẵn categoryId
    if (
      targetCategoryId &&
      (dto.categoryId !== undefined || dto.direction !== undefined)
    ) {
      await this.verifyCategoryAndDirection(
        userId,
        targetCategoryId,
        targetDirection,
      );
    }

    const [updated] = await this.db
      .update(transactions)
      .set({
        ...(dto.walletId !== undefined && { walletId: dto.walletId }),
        ...(dto.categoryId !== undefined && { categoryId: dto.categoryId }),
        ...(dto.amount !== undefined && { amount: dto.amount }),
        ...(dto.direction !== undefined && { direction: dto.direction }),
        ...(dto.transactionTime !== undefined && {
          transactionTime: new Date(dto.transactionTime),
        }),
        ...(dto.merchantName !== undefined && {
          merchantName: dto.merchantName,
        }),
        ...(dto.referenceCode !== undefined && {
          referenceCode: dto.referenceCode,
        }),
        ...(dto.note !== undefined && { note: dto.note }),
        ...(dto.categoryId !== undefined && {
          categorizationSource: dto.categoryId
            ? ('MANUAL' as const)
            : ('NONE' as const),
          matchedRuleId: null,
        }),
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(transactions.id, transactionId),
          eq(transactions.userId, userId),
        ),
      )
      .returning();

    return updated;
  }

  async remove(userId: string, transactionId: string) {
    await this.findOne(userId, transactionId);

    // Nhờ thiết kế schema: transactionObservations.transactionId có onDelete: 'set null'
    // nên khi xóa transaction, bản ghi observation gốc (nếu có) vẫn được giữ nguyên.
    const [deleted] = await this.db
      .delete(transactions)
      .where(
        and(
          eq(transactions.id, transactionId),
          eq(transactions.userId, userId),
        ),
      )
      .returning();

    return deleted;
  }
}
