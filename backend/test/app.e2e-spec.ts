import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module';
import { configureApp } from './../src/configure-app';

describe('Backend security boundary (e2e)', () => {
  let app: INestApplication<App>;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    configureApp(app);
    await app.init();
  });

  it('rejects a protected wallet route without JWT', async () => {
    await request(app.getHttpServer()).get('/api/v1/wallets').expect(401);
  });

  it('rejects observation ingestion without JWT before touching the DB', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/observations')
      .send({})
      .expect(401);
  });

  afterAll(async () => {
    await app.close();
  });
});
