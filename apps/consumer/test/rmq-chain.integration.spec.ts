import { INestApplication, ValidationPipe } from '@nestjs/common';
import { ClientProxy, ClientsModule, Transport } from '@nestjs/microservices';
import { Test } from '@nestjs/testing';
import { NOTIFICATION_EVENT_PATTERN } from '@notification/contracts';
import {
  RabbitMQContainer,
  StartedRabbitMQContainer,
} from '@testcontainers/rabbitmq';
import { firstValueFrom, timeout } from 'rxjs';
import { AppModule } from '../src/app.module';
import { TelegramApiClient } from '../src/notification/telegram-api.client';

const describeIntegration =
  process.env.SKIP_INTEGRATION === '1' ? describe.skip : describe;

async function waitFor(
  fn: () => boolean,
  maxMs = 25_000,
  step = 150,
): Promise<void> {
  const t0 = Date.now();
  while (Date.now() - t0 < maxMs) {
    if (fn()) return;
    await new Promise((r) => setTimeout(r, step));
  }
  throw new Error(`Timeout after ${maxMs}ms`);
}

describeIntegration('RabbitMQ → consumer → Telegram client (integration)', () => {
  let rabbit: StartedRabbitMQContainer;
  let app: INestApplication;
  let senderApp: INestApplication;
  let sender: ClientProxy;
  const mockTelegramSend = jest.fn().mockResolvedValue(undefined);

  beforeAll(async () => {
    rabbit = await new RabbitMQContainer('rabbitmq:3.13-alpine').start();
    const url = rabbit.getAmqpUrl();
    const queue = `notif_it_${Date.now().toString(36)}_${process.pid}`;

    delete process.env.REDIS_URL;
    process.env.RABBITMQ_URL = url;
    process.env.RABBITMQ_QUEUE = queue;
    process.env.TELEGRAM_SERVICE_URL = 'http://127.0.0.1:1';

    const moduleFixture = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(TelegramApiClient)
      .useValue({
        sendTelegramNotification: mockTelegramSend,
      })
      .compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    app.connectMicroservice({
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
    await app.startAllMicroservices();
    await app.init();

    const senderModule = await Test.createTestingModule({
      imports: [
        ClientsModule.register([
          {
            name: 'IT_SENDER',
            transport: Transport.RMQ,
            options: {
              urls: [url],
              queue,
              queueOptions: { durable: true },
              persistent: true,
              socketOptions: {
                heartbeatIntervalInSeconds: 60,
                reconnectTimeInSeconds: 3,
              },
            },
          },
        ]),
      ],
    }).compile();

    senderApp = senderModule.createNestApplication();
    await senderApp.init();
    sender = senderApp.get<ClientProxy>('IT_SENDER');
    await sender.connect();
  }, 120_000);

  afterAll(async () => {
    try {
      await sender?.close();
    } catch {
      /* ignore */
    }
    try {
      await senderApp?.close();
    } catch {
      /* ignore */
    }
    try {
      await app?.close();
    } catch {
      /* ignore */
    }
    try {
      await rabbit?.stop();
    } catch {
      /* ignore */
    }
  });

  it('emit в очередь приводит к вызову TelegramApiClient с тем же envelope', async () => {
    mockTelegramSend.mockClear();
    const envelope = {
      messageId: 'aaaaaaaa-bbbb-4ccc-dddd-eeeeeeeeeeee',
      type: 'telegram.notify',
      payload: { text: 'integration', parseMode: 'HTML' as const },
      occurredAt: new Date().toISOString(),
    };

    await firstValueFrom(
      sender.emit(NOTIFICATION_EVENT_PATTERN, envelope).pipe(timeout(20_000)),
    );

    await waitFor(() => mockTelegramSend.mock.calls.length > 0);
    expect(mockTelegramSend).toHaveBeenCalledWith(
      expect.objectContaining({
        messageId: envelope.messageId,
        type: 'telegram.notify',
        payload: envelope.payload,
      }),
    );
  });

  it('повтор с тем же messageId не вызывает Telegram повторно', async () => {
    mockTelegramSend.mockClear();
    const envelope = {
      messageId: 'bbbbbbbb-bbbb-4ccc-dddd-eeeeeeeeeeee',
      type: 'telegram.notify',
      payload: { text: 'dup-test' },
      occurredAt: new Date().toISOString(),
    };

    await firstValueFrom(
      sender.emit(NOTIFICATION_EVENT_PATTERN, envelope).pipe(timeout(20_000)),
    );
    await waitFor(() => mockTelegramSend.mock.calls.length === 1);

    await firstValueFrom(
      sender.emit(NOTIFICATION_EVENT_PATTERN, envelope).pipe(timeout(20_000)),
    );
    await new Promise((r) => setTimeout(r, 800));
    expect(mockTelegramSend).toHaveBeenCalledTimes(1);
  });
});
