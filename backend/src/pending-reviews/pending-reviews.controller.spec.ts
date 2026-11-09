import { jest } from '@jest/globals';
import { PendingReviewsController } from './pending-reviews.controller';

const userId = '11111111-1111-4111-8111-111111111111';
const reviewId = '44444444-4444-4444-8444-444444444444';

describe('PendingReviewsController', () => {
  let controller: PendingReviewsController;
  let service: any;

  beforeEach(() => {
    service = {
      findAll: jest.fn(),
      findOne: jest.fn(),
      resolve: jest.fn(),
    };

    controller = new PendingReviewsController(service);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('passes authenticated user to findAll', async () => {
    const query = {
      limit: 20,
      offset: 0,
    };

    const expected = [
      {
        id: reviewId,
        status: 'PENDING_REVIEW',
      },
    ];

    service.findAll.mockResolvedValue(expected);

    const result = await controller.findAll(
      {
        user: {
          id: userId,
        },
      },
      query,
    );

    expect(result).toEqual(expected);

    expect(service.findAll).toHaveBeenCalledWith(userId, query);
  });

  it('passes authenticated user and review ID to findOne', async () => {
    const expected = {
      id: reviewId,
      status: 'PENDING_REVIEW',
    };

    service.findOne.mockResolvedValue(expected);

    const result = await controller.findOne(
      {
        user: {
          id: userId,
        },
      },
      reviewId,
    );

    expect(result).toEqual(expected);

    expect(service.findOne).toHaveBeenCalledWith(userId, reviewId);
  });

  it('passes resolve decision to service', async () => {
    const dto = {
      decision: 'CONFIRM_DUPLICATE' as const,
      note: 'Cùng một giao dịch',
    };

    const expected = {
      decision: 'CONFIRM_DUPLICATE',
      primaryTransactionId: '55555555-5555-4555-8555-555555555555',
      relatedTransactionId: '66666666-6666-4666-8666-666666666666',
    };

    service.resolve.mockResolvedValue(expected);

    const result = await controller.resolve(
      {
        user: {
          id: userId,
        },
      },
      reviewId,
      dto,
    );

    expect(result).toEqual(expected);

    expect(service.resolve).toHaveBeenCalledWith(userId, reviewId, dto);
  });

  it('passes internal-transfer decision to service', async () => {
    const dto = {
      decision: 'CONFIRM_INTERNAL_TRANSFER' as const,
      note: 'Chuyển tiền giữa hai ví',
    };

    const expected = {
      decision: 'CONFIRM_INTERNAL_TRANSFER',
      linkType: 'INTERNAL_TRANSFER',
    };

    service.resolve.mockResolvedValue(expected);

    const result = await controller.resolve(
      {
        user: {
          id: userId,
        },
      },
      reviewId,
      dto,
    );

    expect(result).toEqual(expected);

    expect(service.resolve).toHaveBeenCalledWith(userId, reviewId, dto);
  });
});
