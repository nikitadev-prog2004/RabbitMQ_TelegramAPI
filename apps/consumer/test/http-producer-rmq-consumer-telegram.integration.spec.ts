import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Transport } from '@nestjs/microservices';
import { Test } from '@nestjs/testing';
import * as http from 'node:http';
import request from 'supertest';
import { RabbitMQContainer, StartedRabbitMQContainer } from '@testcontainers/rabbitmq';
import { AppModule as ProducerAppModule } from '../../producer/src/app.module';
import { AppModule as ConsumerAppModule } from '../src/app.module';

const describeIntegration =
  process.env.SKIP_INTEGRATION === '1' ? describe.skip : describe;

async function waitFor(
  fn: () => boolean,
  maxMs = 30_000,
  step = 150,
): Promise<void> {
  const t0 = Date.now();
  while (Date.now() - t0 < maxMs) {
    if (fn()) return;
    await new Promise((r) => setTimeout(r, step));
  }
  throw new Error(`Timeout after ${maxMs}ms`);
}

describeIntegration(
  'HTTP Producer → RabbitMQ → consumer → HTTP «telegram» (integration)',
  () => {
    let rabbit: StartedRabbitMQContainer;
    let consumerApp: INestApplication;
    let producerApp: INestApplication;
    let mockTelegram: http.Server;
    let mockTelegramPort: number;
    let lastTelegramBody: Record<string, unknown> | null = null;

    beforeAll(async () => {
      rabbit = await new RabbitMQContainer('rabbitmq:3.13-alpine').start();
      const url = rabbit.getAmqpUrl();
      const queue = `notif_http_${Date.now().toString(36)}_${process.pid}`;

      delete process.env.REDIS_URL;
      process.env.RABBITMQ_URL = url;
      process.env.RABBITMQ_QUEUE = queue;

      await new Promise<void>((resolve, reject) => {
        mockTelegram = http.createServer((req, res) => {
          if (req.method === 'POST' && req.url === '/notifications') {
            const chunks: Buffer[] = [];
            req.on('data', (c) => chunks.push(c as Buffer));
            req.on('end', () => {
              try {
                const raw = Buffer.concat(chunks).toString('utf8');
                lastTelegramBody = JSON.parse(raw) as Record<string, unknown>;
              } catch {
                lastTelegramBody = null;
              }
              res.writeHead(200, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ ok: true, mocked: true }));
            });
            return;
          }
          res.writeHead(404);
          res.end();
        });
        mockTelegram.listen(0, '127.0.0.1', () => {
          const addr = mockTelegram.address();
          if (typeof addr === 'object' && addr?.port) {
            mockTelegramPort = addr.port;
            process.env.TELEGRAM_SERVICE_URL = `http://127.0.0.1:${mockTelegramPort}`;
            resolve();
          } else {
            reject(new Error('mock telegram: no port'));
          }
        });
        mockTelegram.on('error', reject);
      });

      const consumerModule = await Test.createTestingModule({
        imports: [ConsumerAppModule],
      }).compile();

      consumerApp = consumerModule.createNestApplication();
      consumerApp.useGlobalPipes(
        new ValidationPipe({
          whitelist: true,
          forbidNonWhitelisted: true,
          transform: true,
        }),
      );
      consumerApp.connectMicroservice({
        transport: Transport.RMQ,
        options: {
          urls: [url],
          queue,
          queueOptions: { durable: true },
          noAck: false,
          prefetchCount: 2,
          socketOptions: {
            heartbeatIntervalInSeconds: 60,
            reconnectTimeInSeconds: 3,
          },
        },
      });
      await consumerApp.startAllMicroservices();
      await consumerApp.init();

      const producerModule = await Test.createTestingModule({
        imports: [ProducerAppModule],
      }).compile();

      producerApp = producerModule.createNestApplication();
      producerApp.useGlobalPipes(
        new ValidationPipe({
          whitelist: true,
          forbidNonWhitelisted: true,
          transform: true,
          transformOptions: { enableImplicitConversion: true },
        }),
      );
      await producerApp.init();
    }, 120_000);

    afterAll(async () => {
      try {
        await producerApp?.close();
      } catch {
        /* ignore */
      }
      try {
        await consumerApp?.close();
      } catch {
        /* ignore */
      }
      try {
        await new Promise<void>((resolve, reject) => {
          mockTelegram?.close((err) => (err ? reject(err) : resolve()));
        });
      } catch {
        /* ignore */
      }
      try {
        await rabbit?.stop();
      } catch {
        /* ignore */
      }
    });

    it('POST /events доходит до mock POST /notifications с тем же текстом', async () => {
      lastTelegramBody = null;
      const messageId = 'a92f09cb-4f68-47c0-b0cc-cccacccc0001';
      const text = 'цепочка producer → rmq → consumer → http';

      await request(producerApp.getHttpServer())
        .post('/events')
        .send({
          messageId,
          type: 'telegram.notify',
          payload: { text, parseMode: 'HTML' },
        })
        .expect(200)
        .expect((res) => {
          expect(res.body.acknowledged).toBe(true);
          expect(res.body.messageId).toBe(messageId);
        });

      await waitFor(
        () =>
          lastTelegramBody !== null &&
          lastTelegramBody.text === text &&
          lastTelegramBody.messageId === messageId,
      );

      expect(lastTelegramBody).toMatchObject({
        messageId,
        text,
        parseMode: 'HTML',
      });
    });
  },
);
