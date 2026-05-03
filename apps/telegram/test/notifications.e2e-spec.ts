import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';

describe('Notifications (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    process.env.TELEGRAM_MOCK_SEND = 'true';
    process.env.TELEGRAM_BOT_TOKEN =
      process.env.TELEGRAM_BOT_TOKEN ?? '000000000:AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA';
    process.env.TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID ?? '1';

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
        transformOptions: { enableImplicitConversion: true },
      }),
    );
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('POST /notifications с моком возвращает ok', () => {
    return request(app.getHttpServer())
      .post('/notifications')
      .send({ text: 'e2e' })
      .expect(200)
      .expect((res: { body: { ok?: boolean; mocked?: boolean } }) => {
        expect(res.body.ok).toBe(true);
        expect(res.body.mocked).toBe(true);
      });
  });

  it('POST /notifications валидирует тело', () => {
    return request(app.getHttpServer())
      .post('/notifications')
      .send({})
      .expect(400);
  });

  it('POST /notifications отклоняет плейсхолдер chatId из Swagger', () => {
    return request(app.getHttpServer())
      .post('/notifications')
      .send({ text: 'x', chatId: 'string' })
      .expect(400);
  });
});
