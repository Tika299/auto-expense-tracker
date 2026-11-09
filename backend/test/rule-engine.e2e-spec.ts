import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/configure-app';

type Session = {
  token: string;
};

describe('Rule Engine pipeline (e2e)', () => {
  let app: INestApplication<App>;

  beforeAll(async () => {
    if (!process.env.DATABASE_URL?.includes('auto_expense_tracker_test')) {
      throw new Error(
        'Rule Engine E2E chỉ được phép chạy với database auto_expense_tracker_test.',
      );
    }

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    configureApp(app);
    await app.init();
  });

  async function registerUser(label: string): Promise<Session> {
    const response = await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({
        email: `e2e-${label}-${Date.now()}-${Math.random().toString(16).slice(2)}@example.com`,
        password: 'E2e-password-123!',
      })
      .expect(201);

    return {
      token: response.body.accessToken as string,
    };
  }

  async function createWallet(
    token: string,
    name: string,
    type: 'BANK' | 'EWALLET',
  ) {
    const response = await request(app.getHttpServer())
      .post('/api/v1/wallets')
      .set('Authorization', `Bearer ${token}`)
      .send({ name, type, currency: 'VND' })
      .expect(201);

    return response.body as { id: string };
  }

  it('deduplicates an observation by sourceMessageId', async () => {
    const { token } = await registerUser('dedup');
    const wallet = await createWallet(token, 'VCB E2E', 'BANK');

    const observation = {
      walletId: wallet.id,
      source: 'VIETCOMBANK',
      channel: 'ANDROID_NOTIFICATION',
      sourceMessageId: `vcb-e2e-${Date.now()}`,
      rawText:
        'Số dư TK VCB 9000000001 +80,000 VND lúc 14-10-2026 12:47:59. Số dư 1,159,903 VND. Ref 9000TPBVI0000001.NGUYEN VAN A chuyen khoan nhanh qua Zalo.20261014.124758.90000000001.NGUYEN VAN A.970423',
      rawPayload: { test: true },
      observedAt: '2026-10-14T12:48:00+07:00',
    };

    const first = await request(app.getHttpServer())
      .post('/api/v1/observations')
      .set('Authorization', `Bearer ${token}`)
      .send(observation)
      .expect(201);

    expect(first.body.duplicate).toBe(false);

    const duplicate = await request(app.getHttpServer())
      .post('/api/v1/observations')
      .set('Authorization', `Bearer ${token}`)
      .send(observation)
      .expect(201);

    expect(duplicate.body).toEqual(
      expect.objectContaining({
        duplicate: true,
        stage: 'OBSERVATION',
        matchedBy: 'SOURCE_MESSAGE_ID',
      }),
    );

    const transactions = await request(app.getHttpServer())
      .get('/api/v1/transactions')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(transactions.body).toHaveLength(1);
  });

  it('categorizes by parsed counterparty account', async () => {
    const { token } = await registerUser('categorization');
    const wallet = await createWallet(token, 'VCB categorization', 'BANK');

    const categoryResponse = await request(app.getHttpServer())
      .post('/api/v1/categories')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: `Đối tác E2E ${Date.now()}`, scope: 'OUT' })
      .expect(201);

    const categoryId = categoryResponse.body.id as string;

    const ruleResponse = await request(app.getHttpServer())
      .post('/api/v1/categorization-rules')
      .set('Authorization', `Bearer ${token}`)
      .send({
        categoryId,
        matchField: 'COUNTERPARTY_ACCOUNT',
        operator: 'EXACT',
        pattern: '9000000002',
        priority: 1,
      })
      .expect(201);

    const parsed = await request(app.getHttpServer())
      .post('/api/v1/observations')
      .set('Authorization', `Bearer ${token}`)
      .send({
        walletId: wallet.id,
        source: 'VIETCOMBANK',
        channel: 'ANDROID_NOTIFICATION',
        sourceMessageId: `vcb-counterparty-${Date.now()}`,
        rawText:
          'Số dư TK VCB 9000000001 -40,000 VND lúc 14-10-2026 10:51:42. Số dư 1,079,903 VND. Ref MBVCB.90000000001.9000BFTV00000001.NGUYEN VAN A chuyen khoan nhanh qua Z....CT tu 9000000001 NGUYEN VAN A toi 9000000002 NGUYEN VAN B tai TECHCOMBANK',
        rawPayload: { test: true },
        observedAt: '2026-10-14T10:51:47+07:00',
      })
      .expect(201);

    expect(parsed.body.transaction).toEqual(
      expect.objectContaining({
        categoryId,
        counterpartyAccount: '9000000002',
        categorizationSource: 'USER_RULE',
        matchedRuleId: ruleResponse.body.id,
      }),
    );
  });

  it('auto-confirms an internal transfer and excludes it from income and expense', async () => {
    const { token } = await registerUser('reconciliation');
    const bankWallet = await createWallet(token, 'VCB transfer', 'BANK');
    const momoWallet = await createWallet(token, 'MoMo transfer', 'EWALLET');

    const bankOut = await request(app.getHttpServer())
      .post('/api/v1/observations')
      .set('Authorization', `Bearer ${token}`)
      .send({
        walletId: bankWallet.id,
        source: 'VIETCOMBANK',
        channel: 'ANDROID_NOTIFICATION',
        sourceMessageId: `vcb-internal-${Date.now()}`,
        rawText:
          'Số dư TK VCB 9000000001 -40,000 VND lúc 14-10-2026 10:51:42. Số dư 1,079,903 VND. Ref MBVCB.90000000001.9000BFTV00000001.NGUYEN VAN A chuyen khoan nhanh qua Z....CT tu 9000000001 NGUYEN VAN A toi 9000000002 NGUYEN VAN B tai TECHCOMBANK',
        rawPayload: { test: true },
        observedAt: '2026-10-14T10:51:47+07:00',
      })
      .expect(201);

    const momoIn = await request(app.getHttpServer())
      .post('/api/v1/observations')
      .set('Authorization', `Bearer ${token}`)
      .send({
        walletId: momoWallet.id,
        source: 'MOMO',
        channel: 'ANDROID_NOTIFICATION',
        sourceMessageId: `momo-internal-${Date.now()}`,
        rawText:
          'Bạn nhận được 40.000đ từ NGUYEN VAN B. Số tài khoản: 9000000002',
        rawPayload: { test: true },
        observedAt: '2026-10-14T10:52:12+07:00',
      })
      .expect(201);

    expect(momoIn.body).toEqual(
      expect.objectContaining({
        duplicate: false,
        pendingReview: false,
        reconciliation: expect.objectContaining({
          kind: 'AUTO_CONFIRMED',
        }),
      }),
    );
    expect(momoIn.body.transaction.kind).toBe('INTERNAL_TRANSFER');

    const original = await request(app.getHttpServer())
      .get(`/api/v1/transactions/${bankOut.body.transaction.id}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(original.body.kind).toBe('INTERNAL_TRANSFER');

    const report = await request(app.getHttpServer())
      .get('/api/v1/reports/summary')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(report.body).toEqual(
      expect.objectContaining({
        income: 0,
        expense: 0,
        netCashFlow: 0,
        internalTransfer: {
          in: 40000,
          out: 40000,
          net: 0,
          transactionCount: 2,
        },
      }),
    );
  });

  it('sends a weak internal-transfer match to pending review', async () => {
    const { token } = await registerUser('pending-review');
    const vcbWallet = await createWallet(token, 'VCB pending', 'BANK');
    const mbWallet = await createWallet(token, 'MB pending', 'BANK');

    await request(app.getHttpServer())
      .post('/api/v1/observations')
      .set('Authorization', `Bearer ${token}`)
      .send({
        walletId: vcbWallet.id,
        source: 'VIETCOMBANK',
        channel: 'ANDROID_NOTIFICATION',
        sourceMessageId: `vcb-pending-${Date.now()}`,
        rawText:
          'Số dư TK VCB 9000000001 -100,000 VND lúc 20-10-2026 16:55:02. Số dư 2,243,803 VND. Ref ATM_QRCWD.90000002.000002.20261020.165442. rut tien 9000000001 tai 90000000001',
        rawPayload: { test: true },
        observedAt: '2026-10-20T16:55:07+07:00',
      })
      .expect(201);

    const candidate = await request(app.getHttpServer())
      .post('/api/v1/observations')
      .set('Authorization', `Bearer ${token}`)
      .send({
        walletId: mbWallet.id,
        source: 'MBBANK',
        channel: 'ANDROID_NOTIFICATION',
        sourceMessageId: `mb-pending-${Date.now()}`,
        rawText:
          'Thông báo biến động số dư\nTK 90xxx001|GD: +100,000VND 20/10/26 16:55 |SD: 100,000VND|ND: Giaohangtietkiem chuyen tien CoD 20 10 2026 S90000001 BC9000000099 S90000001 201026',
        rawPayload: { test: true },
        observedAt: '2026-10-20T16:55:32+07:00',
      })
      .expect(201);

    expect(candidate.body).toEqual(
      expect.objectContaining({
        duplicate: false,
        pendingReview: true,
        reconciliation: expect.objectContaining({
          kind: 'PENDING_REVIEW',
        }),
      }),
    );
    expect(candidate.body.transaction.reviewStatus).toBe('PENDING_REVIEW');

    const reviews = await request(app.getHttpServer())
      .get('/api/v1/pending-reviews?linkType=INTERNAL_TRANSFER')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(reviews.body).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          linkType: 'INTERNAL_TRANSFER',
          status: 'PENDING_REVIEW',
        }),
      ]),
    );
  });

  afterAll(async () => {
    await app.close();
  });
});
