import {
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { and, asc, eq, inArray } from 'drizzle-orm';
import { DATABASE, type Database } from '../database/database.module';
import { categories } from '../database/schema';
import { CreateCategoryDto } from './dto/create-category.dto';
import { UpdateCategoryDto } from './dto/update-category.dto';
import { QueryCategoryDto } from './dto/query-category.dto';

export const DEFAULT_CATEGORIES: Array<{
  name: string;
  scope: 'IN' | 'OUT' | 'BOTH';
  icon: string;
  color: string;
}> = [
  { name: 'Ăn uống', scope: 'OUT', icon: 'utensils', color: '#EF4444' },
  { name: 'Di chuyển', scope: 'OUT', icon: 'car', color: '#F59E0B' },
  { name: 'Mua sắm', scope: 'OUT', icon: 'shopping-bag', color: '#8B5CF6' },
  { name: 'Hóa đơn', scope: 'OUT', icon: 'file-invoice', color: '#3B82F6' },
  { name: 'Lương', scope: 'IN', icon: 'wallet', color: '#10B981' },
  { name: 'Hoàn tiền', scope: 'IN', icon: 'rotate-left', color: '#06B6D4' },
  { name: 'Thu nhập khác', scope: 'IN', icon: 'coins', color: '#84CC16' },
];

@Injectable()
export class CategoriesService {
  constructor(
    @Inject(DATABASE)
    private readonly db: Database,
  ) {}

  async create(userId: string, dto: CreateCategoryDto) {
    try {
      const [category] = await this.db
        .insert(categories)
        .values({
          userId,
          name: dto.name,
          scope: dto.scope ?? 'BOTH',
          icon: dto.icon ?? null,
          color: dto.color ?? null,
        })
        .returning();

      return category;
    } catch (error: any) {
      if (error?.code === '23505') {
        throw new ConflictException(
          `Danh mục "${dto.name}" đã tồn tại trong tài khoản của bạn.`,
        );
      }
      throw error;
    }
  }

  async findAll(userId: string, query: QueryCategoryDto) {
    const conditions = [eq(categories.userId, userId)];

    if (!query.includeArchived) {
      conditions.push(eq(categories.isArchived, false));
    }

    if (query.scope === 'IN') {
      conditions.push(inArray(categories.scope, ['IN', 'BOTH']));
    } else if (query.scope === 'OUT') {
      conditions.push(inArray(categories.scope, ['OUT', 'BOTH']));
    }

    return this.db
      .select()
      .from(categories)
      .where(and(...conditions))
      .orderBy(asc(categories.name));
  }

  async findOne(userId: string, categoryId: string) {
    const [category] = await this.db
      .select()
      .from(categories)
      .where(and(eq(categories.id, categoryId), eq(categories.userId, userId)));

    if (!category) {
      throw new NotFoundException('Không tìm thấy danh mục.');
    }

    return category;
  }

  async update(userId: string, categoryId: string, dto: UpdateCategoryDto) {
    await this.findOne(userId, categoryId);

    try {
      const [updated] = await this.db
        .update(categories)
        .set({
          ...(dto.name !== undefined && { name: dto.name }),
          ...(dto.scope !== undefined && { scope: dto.scope }),
          ...(dto.icon !== undefined && { icon: dto.icon }),
          ...(dto.color !== undefined && { color: dto.color }),
          ...(dto.isArchived !== undefined && { isArchived: dto.isArchived }),
          updatedAt: new Date(),
        })
        .where(
          and(eq(categories.id, categoryId), eq(categories.userId, userId)),
        )
        .returning();

      return updated;
    } catch (error: any) {
      if (error?.code === '23505') {
        throw new ConflictException(
          `Danh mục "${dto.name}" đã tồn tại trong tài khoản của bạn.`,
        );
      }
      throw error;
    }
  }

  async archive(userId: string, categoryId: string) {
    await this.findOne(userId, categoryId);

    const [archived] = await this.db
      .update(categories)
      .set({
        isArchived: true,
        updatedAt: new Date(),
      })
      .where(and(eq(categories.id, categoryId), eq(categories.userId, userId)))
      .returning();

    return archived;
  }

  /**
   * Khởi tạo danh mục mặc định khi đăng ký user mới.
   * Hỗ trợ truyền transaction client (tx) từ AuthService.
   */
  async seedDefaultsForUser(userId: string, tx: Database = this.db) {
    const values = DEFAULT_CATEGORIES.map((item) => ({
      userId,
      name: item.name,
      scope: item.scope,
      icon: item.icon,
      color: item.color,
    }));

    return tx.insert(categories).values(values).returning();
  }
}
