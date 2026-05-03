import { ConfigModule } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import { EventEnvelope } from '@notification/contracts';
import { ProcessNotificationUseCase } from './application/process-notification.use-case';
import { IDEMPOTENCY_PORT, TELEGRAM_SENDER_PORT } from './application/tokens';
import { IdempotencyService } from './idempotency.service';
import { MessageProcessorService } from './message-processor.service';
import { TelegramApiClient } from './telegram-api.client';

describe('MessageProcessorService', () => {
  let service: MessageProcessorService;
  let telegram: { sendTelegramNotification: jest.Mock };

  beforeEach(async () => {
    telegram = { sendTelegramNotification: jest.fn().mockResolvedValue(undefined) };

    const module: TestingModule = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({
          isGlobal: true,
          ignoreEnvFile: true,
        }),
      ],
      providers: [
        ProcessNotificationUseCase,
        MessageProcessorService,
        IdempotencyService,
        { provide: TelegramApiClient, useValue: telegram },
        { provide: IDEMPOTENCY_PORT, useExisting: IdempotencyService },
        { provide: TELEGRAM_SENDER_PORT, useExisting: TelegramApiClient },
      ],
    }).compile();

    service = module.get(MessageProcessorService);
  });

  it('отправляет telegram.notify и помечает обработанным', async () => {
    const env: EventEnvelope = {
      messageId: '550e8400-e29b-41d4-a716-446655440000',
      type: 'telegram.notify',
      payload: { text: 'x' },
      occurredAt: new Date().toISOString(),
    };
    await expect(service.process(env)).resolves.toBe('handled');
    expect(telegram.sendTelegramNotification).toHaveBeenCalled();
  });

  it('дубликат не вызывает Telegram', async () => {
    const env: EventEnvelope = {
      messageId: '550e8400-e29b-41d4-a716-446655440001',
      type: 'telegram.notify',
      payload: { text: 'x' },
      occurredAt: new Date().toISOString(),
    };
    await service.process(env);
    await expect(service.process(env)).resolves.toBe('duplicate');
    expect(telegram.sendTelegramNotification).toHaveBeenCalledTimes(1);
  });
});
