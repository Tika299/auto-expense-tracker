import {
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { and, asc, eq, ne, sql } from 'drizzle-orm';
import { DATABASE, type Database } from '../database/database.module';
import { transactions, wallets } from '../database/schema';
import { CreateWalletDto } from './dto/create-wallet.dto';
import { UpdateWalletDto } from './dto/update-wallet.dto';

@Injectable()
export class WalletsService {
  constructor(
    @Inject(DATABASE)
    private readonly db: Database,
  ) {}

  async create(userId: string, dto: CreateWalletDto) {
    // 1. Kiểm tra user này đã có ví trùng tên chưa
    const [existing] = await this.db
      .select({ id: wallets.id })
      .from(wallets)
      .where(and(eq(wallets.userId, userId), eq(wallets.name, dto.name)))
      .limit(1);

    if (existing) {
      throw new ConflictException(`Ví "${dto.name}" đã tồn tại`);
    }

    // 2. Tạo ví mới
    const [created] = await this.db
      .insert(wallets)
      .values({
        userId,
        name: dto.name,
        type: dto.type,
        currency: dto.currency ?? 'VND',
      })
      .returning();

    return {
      ...created,
      balance: 0,
    };
  }

  async findAll(userId: string, includeArchived = false) {
    const conditions = [eq(wallets.userId, userId)];
    if (!includeArchived) {
      conditions.push(eq(wallets.isArchived, false));
    }

    // Tính số dư = Tổng IN - Tổng OUT ngay trong 1 câu SQL bằng LEFT JOIN + GROUP BY
    const rows = await this.db
      .select({
        id: wallets.id,
        userId: wallets.userId,
        name: wallets.name,
        type: wallets.type,
        currency: wallets.currency,
        isArchived: wallets.isArchived,
        createdAt: wallets.createdAt,
        updatedAt: wallets.updatedAt,
        balance: sql<number>`COALESCE(
          SUM(
            CASE
              WHEN ${transactions.direction} = 'IN' THEN ${transactions.amount}
              WHEN ${transactions.direction} = 'OUT' THEN -${transactions.amount}
              ELSE 0
            END
          ),
          0
        )::bigint`.mapWith(Number),
      })
      .from(wallets)
      .leftJoin(transactions, eq(transactions.walletId, wallets.id))
      .where(and(...conditions))
      .groupBy(wallets.id)
      .orderBy(asc(wallets.createdAt));

    return rows;
  }

  async findOne(userId: string, walletId: string) {
    const [wallet] = await this.db
      .select({
        id: wallets.id,
        userId: wallets.userId,
        name: wallets.name,
        type: wallets.type,
        currency: wallets.currency,
        isArchived: wallets.isArchived,
        createdAt: wallets.createdAt,
        updatedAt: wallets.updatedAt,
        balance: sql<number>`COALESCE(
          SUM(
            CASE
              WHEN ${transactions.direction} = 'IN' THEN ${transactions.amount}
              WHEN ${transactions.direction} = 'OUT' THEN -${transactions.amount}
              ELSE 0
            END
          ),
          0
        )::bigint`.mapWith(Number),
      })
      .from(wallets)
      .leftJoin(transactions, eq(transactions.walletId, wallets.id))
      .where(and(eq(wallets.id, walletId), eq(wallets.userId, userId)))
      .groupBy(wallets.id)
      .limit(1);

    if (!wallet) {
      throw new NotFoundException('Không tìm thấy ví');
    }

    return wallet;
  }

  async update(userId: string, walletId: string, dto: UpdateWalletDto) {
    // Đảm bảo ví tồn tại và thuộc về user đang đăng nhập
    await this.findOne(userId, walletId);

    // Nếu đổi tên ví, kiểm tra không trùng với ví khác của cùng user
    if (dto.name !== undefined) {
      const [duplicate] = await this.db
        .select({ id: wallets.id })
        .from(wallets)
        .where(
          and(
            eq(wallets.userId, userId),
            eq(wallets.name, dto.name),
            ne(wallets.id, walletId),
          ),
        )
        .limit(1);

      if (duplicate) {
        throw new ConflictException(`Ví "${dto.name}" đã tồn tại`);
      }
    }

    await this.db
      .update(wallets)
      .set({
        ...(dto.name !== undefined && { name: dto.name }),
        ...(dto.type !== undefined && { type: dto.type }),
        ...(dto.isArchived !== undefined && { isArchived: dto.isArchived }),
        updatedAt: new Date(),
      })
      .where(and(eq(wallets.id, walletId), eq(wallets.userId, userId)));

    return this.findOne(userId, walletId);
  }

  async archive(userId: string, walletId: string) {
    // Đảm bảo ví tồn tại và thuộc về user
    await this.findOne(userId, walletId);

    const [archived] = await this.db
      .update(wallets)
      .set({
        isArchived: true,
        updatedAt: new Date(),
      })
      .where(and(eq(wallets.id, walletId), eq(wallets.userId, userId)))
      .returning();

    return archived;
  }
}
