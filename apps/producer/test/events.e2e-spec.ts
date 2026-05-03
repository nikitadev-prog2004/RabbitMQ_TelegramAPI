import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { EventPublisherService } from '../src/events/event-publisher.service';

describe('Events (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    process.env.RABBITMQ_URL = process.env.RABBITMQ_URL ?? 'amqp://localhost:5672';

    const mockPublisher = {
      publish: jest.fn().mockResolvedValue({
        messageId: 'test-uuid',
        publishedAt: new Date().toISOString(),
        acknowledged: true,
      }),
    };

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(EventPublisherService)
      .useValue(mockPublisher)
      .compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('POST /events возвращает результат публикации', () => {
    return request(app.getHttpServer())
      .post('/events')
      .send({
        type: 'telegram.notify',
        payload: { text: 'test' },
      })
      .expect(200)
      .expect((res: { body: { messageId?: string; acknowledged?: boolean } }) => {
        expect(res.body.messageId).toBeDefined();
        expect(res.body.acknowledged).toBe(true);
      });
  });

  it('POST /events валидирует тело', () => {
    return request(app.getHttpServer())
      .post('/events')
      .send({ type: 123 })
      .expect(400);
  });
});
