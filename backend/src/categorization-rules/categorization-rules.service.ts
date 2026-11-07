import {
    BadRequestException,
    ConflictException,
    Inject,
    Injectable,
    NotFoundException,
} from '@nestjs/common';
import { and, asc, eq } from 'drizzle-orm';
import { DATABASE, type Database } from '../database/database.module';
import { categories, categorizationRules } from '../database/schema';
import { CategorizationService } from '../rule-engine/categorization.service';
import { CreateCategorizationRuleDto } from './dto/create-categorization-rule.dto';
import { UpdateCategorizationRuleDto } from './dto/update-categorization-rule.dto';
import { QueryCategorizationRuleDto } from './dto/query-categorization-rule.dto';

type MatchField = 'MERCHANT_NAME' | 'COUNTERPARTY_ACCOUNT';

@Injectable()
export class CategorizationRulesService {
    constructor(
        @Inject(DATABASE)
        private readonly db: Database,

        private readonly categorizationService: CategorizationService,
    ) { }

    private isUniqueViolation(error: unknown): boolean {
        if (typeof error !== 'object' || error === null) {
            return false;
        }

        const directCode = (error as { code?: string }).code;
        const causeCode = (error as { cause?: { code?: string } }).cause?.code;

        return directCode === '23505' || causeCode === '23505';
    }

    /**
     * Bảo đảm category:
     * - tồn tại;
     * - thuộc user đang đăng nhập;
     * - chưa bị archive.
     */
    private async verifyCategoryOwnership(userId: string, categoryId: string) {
        const [category] = await this.db
            .select({
                id: categories.id,
                name: categories.name,
                scope: categories.scope,
                isArchived: categories.isArchived,
            })
            .from(categories)
            .where(and(eq(categories.id, categoryId), eq(categories.userId, userId)))
            .limit(1);

        if (!category) {
            throw new NotFoundException(
                'Không tìm thấy danh mục thuộc tài khoản của bạn.',
            );
        }

        if (category.isArchived) {
            throw new BadRequestException(
                'Không thể tạo quy tắc cho danh mục đã lưu trữ.',
            );
        }

        return category;
    }

    /**
     * Lưu pattern ở dạng chuẩn hóa để:
     * - không phân biệt chữ hoa/thường;
     * - tránh tạo hai rule tương đương;
     * - khớp với CategorizationService.
     */
    private normalizePattern(matchField: MatchField, pattern: string): string {
        const normalized =
            matchField === 'MERCHANT_NAME'
                ? this.categorizationService.normalizeText(pattern)
                : this.categorizationService.normalizeAccount(pattern);

        if (!normalized) {
            throw new BadRequestException('Pattern không chứa dữ liệu hợp lệ.');
        }

        return normalized;
    }

    async create(userId: string, dto: CreateCategorizationRuleDto) {
        await this.verifyCategoryOwnership(userId, dto.categoryId);

        const normalizedPattern = this.normalizePattern(
            dto.matchField,
            dto.pattern,
        );

        try {
            const [created] = await this.db
                .insert(categorizationRules)
                .values({
                    userId,
                    categoryId: dto.categoryId,
                    matchField: dto.matchField,
                    operator: dto.operator,
                    pattern: normalizedPattern,
                    priority: dto.priority ?? 100,
                    isActive: dto.isActive ?? true,
                })
                .returning();

            return created;
        } catch (error: unknown) {
            if (this.isUniqueViolation(error)) {
                throw new ConflictException('Quy tắc phân loại này đã tồn tại.');
            }

            throw error;
        }
    }

    async findAll(userId: string, query: QueryCategorizationRuleDto) {
        const conditions = [eq(categorizationRules.userId, userId)];

        if (query.categoryId) {
            conditions.push(eq(categorizationRules.categoryId, query.categoryId));
        }

        if (query.matchField) {
            conditions.push(eq(categorizationRules.matchField, query.matchField));
        }

        if (query.isActive !== undefined) {
            conditions.push(eq(categorizationRules.isActive, query.isActive));
        }

        return this.db
            .select({
                id: categorizationRules.id,
                userId: categorizationRules.userId,
                categoryId: categorizationRules.categoryId,
                matchField: categorizationRules.matchField,
                operator: categorizationRules.operator,
                pattern: categorizationRules.pattern,
                priority: categorizationRules.priority,
                isActive: categorizationRules.isActive,
                createdAt: categorizationRules.createdAt,
                updatedAt: categorizationRules.updatedAt,

                category: {
                    id: categories.id,
                    name: categories.name,
                    scope: categories.scope,
                    icon: categories.icon,
                    color: categories.color,
                    isArchived: categories.isArchived,
                },
            })
            .from(categorizationRules)
            .innerJoin(categories, eq(categories.id, categorizationRules.categoryId))
            .where(and(...conditions))
            .orderBy(
                asc(categorizationRules.priority),
                asc(categorizationRules.createdAt),
            )
            .limit(query.limit ?? 20)
            .offset(query.offset ?? 0);
    }

    async findOne(userId: string, ruleId: string) {
        const [rule] = await this.db
            .select({
                id: categorizationRules.id,
                userId: categorizationRules.userId,
                categoryId: categorizationRules.categoryId,
                matchField: categorizationRules.matchField,
                operator: categorizationRules.operator,
                pattern: categorizationRules.pattern,
                priority: categorizationRules.priority,
                isActive: categorizationRules.isActive,
                createdAt: categorizationRules.createdAt,
                updatedAt: categorizationRules.updatedAt,

                category: {
                    id: categories.id,
                    name: categories.name,
                    scope: categories.scope,
                    icon: categories.icon,
                    color: categories.color,
                    isArchived: categories.isArchived,
                },
            })
            .from(categorizationRules)
            .innerJoin(categories, eq(categories.id, categorizationRules.categoryId))
            .where(
                and(
                    eq(categorizationRules.id, ruleId),
                    eq(categorizationRules.userId, userId),
                ),
            )
            .limit(1);

        if (!rule) {
            throw new NotFoundException('Không tìm thấy quy tắc phân loại.');
        }

        return rule;
    }

    async update(
        userId: string,
        ruleId: string,
        dto: UpdateCategorizationRuleDto,
    ) {
        const existing = await this.findOne(userId, ruleId);

        if (dto.categoryId !== undefined) {
            await this.verifyCategoryOwnership(userId, dto.categoryId);
        }

        const targetMatchField = dto.matchField ?? existing.matchField;

        /**
         * Nếu đổi matchField, pattern cũ cũng phải được
         * chuẩn hóa lại theo loại field mới.
         */
        const normalizedPattern =
            dto.pattern !== undefined || dto.matchField !== undefined
                ? this.normalizePattern(
                    targetMatchField,
                    dto.pattern ?? existing.pattern,
                )
                : undefined;

        try {
            const [updated] = await this.db
                .update(categorizationRules)
                .set({
                    ...(dto.categoryId !== undefined && {
                        categoryId: dto.categoryId,
                    }),

                    ...(dto.matchField !== undefined && {
                        matchField: dto.matchField,
                    }),

                    ...(dto.operator !== undefined && {
                        operator: dto.operator,
                    }),

                    ...(normalizedPattern !== undefined && {
                        pattern: normalizedPattern,
                    }),

                    ...(dto.priority !== undefined && {
                        priority: dto.priority,
                    }),

                    ...(dto.isActive !== undefined && {
                        isActive: dto.isActive,
                    }),

                    updatedAt: new Date(),
                })
                .where(
                    and(
                        eq(categorizationRules.id, ruleId),
                        eq(categorizationRules.userId, userId),
                    ),
                )
                .returning();

            if (!updated) {
                throw new NotFoundException('Không tìm thấy quy tắc phân loại.');
            }

            return updated;
        } catch (error: unknown) {
            if (this.isUniqueViolation(error)) {
                throw new ConflictException('Quy tắc phân loại này đã tồn tại.');
            }

            throw error;
        }
    }

    async remove(userId: string, ruleId: string) {
        await this.findOne(userId, ruleId);

        const [deleted] = await this.db
            .delete(categorizationRules)
            .where(
                and(
                    eq(categorizationRules.id, ruleId),
                    eq(categorizationRules.userId, userId),
                ),
            )
            .returning();

        if (!deleted) {
            throw new NotFoundException('Không tìm thấy quy tắc phân loại.');
        }

        return deleted;
    }
}
