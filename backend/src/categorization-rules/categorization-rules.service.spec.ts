import { ConflictException, NotFoundException } from '@nestjs/common';
import { jest } from '@jest/globals';
import { CategorizationRulesService } from './categorization-rules.service';

function queryChain(result: unknown[]) {
    const chain: any = {};

    chain.from = jest.fn(() => chain);
    chain.innerJoin = jest.fn(() => chain);
    chain.where = jest.fn(() => chain);
    chain.orderBy = jest.fn(() => chain);
    chain.limit = jest.fn(async () => result);
    chain.offset = jest.fn(async () => result);

    return chain;
}

function insertChain(result: unknown[]) {
    const chain: any = {};

    chain.values = jest.fn(() => chain);
    chain.returning = jest.fn(async () => result);

    return chain;
}

describe('CategorizationRulesService', () => {
    let service: CategorizationRulesService;
    let db: any;
    let categorizationService: any;

    beforeEach(() => {
        db = {
            select: jest.fn(),
            insert: jest.fn(),
            update: jest.fn(),
            delete: jest.fn(),
        };

        categorizationService = {
            normalizeText: jest.fn((value: string) => value.trim().toUpperCase()),
            normalizeAccount: jest.fn((value: string) =>
                value.replace(/[^A-Z0-9]/gi, ''),
            ),
        };

        service = new CategorizationRulesService(db, categorizationService);
    });

    it('creates a rule for a category owned by user', async () => {
        const categoryId = '11111111-1111-4111-8111-111111111111';

        const category = {
            id: categoryId,
            name: 'Ăn uống',
            scope: 'OUT',
            isArchived: false,
        };

        const createdRule = {
            id: '22222222-2222-4222-8222-222222222222',
            userId: 'user-id',
            categoryId,
            matchField: 'MERCHANT_NAME',
            operator: 'CONTAINS',
            pattern: 'GRABFOOD',
            priority: 10,
            isActive: true,
        };

        db.select.mockReturnValueOnce(queryChain([category]));

        const insert = insertChain([createdRule]);
        db.insert.mockReturnValueOnce(insert);

        const result = await service.create('user-id', {
            categoryId,
            matchField: 'MERCHANT_NAME',
            operator: 'CONTAINS',
            pattern: ' grabfood ',
            priority: 10,
        });

        expect(result).toEqual(createdRule);

        expect(insert.values).toHaveBeenCalledWith({
            userId: 'user-id',
            categoryId,
            matchField: 'MERCHANT_NAME',
            operator: 'CONTAINS',
            pattern: 'GRABFOOD',
            priority: 10,
            isActive: true,
        });
    });

    it('rejects a category not owned by user', async () => {
        db.select.mockReturnValueOnce(queryChain([]));

        await expect(
            service.create('user-id', {
                categoryId: '11111111-1111-4111-8111-111111111111',
                matchField: 'MERCHANT_NAME',
                operator: 'CONTAINS',
                pattern: 'GRABFOOD',
            }),
        ).rejects.toBeInstanceOf(NotFoundException);

        expect(db.insert).not.toHaveBeenCalled();
    });

    it('returns conflict when rule already exists', async () => {
        db.select.mockReturnValueOnce(
            queryChain([
                {
                    id: 'category-id',
                    name: 'Ăn uống',
                    scope: 'OUT',
                    isArchived: false,
                },
            ]),
        );

        const duplicateError = {
            cause: {
                code: '23505',
            },
        };

        db.insert.mockImplementation(() => {
            throw duplicateError;
        });

        await expect(
            service.create('user-id', {
                categoryId: '11111111-1111-4111-8111-111111111111',
                matchField: 'MERCHANT_NAME',
                operator: 'CONTAINS',
                pattern: 'GRABFOOD',
            }),
        ).rejects.toBeInstanceOf(ConflictException);
    });
});
