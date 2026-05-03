import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ProcessNotificationUseCase } from './application/process-notification.use-case';
import { IDEMPOTENCY_PORT, TELEGRAM_SENDER_PORT } from './application/tokens';
import { IdempotencyService } from './idempotency.service';
import { MessageProcessorService } from './message-processor.service';
import { NotificationController } from './notification.controller';
import { RetryTrackerService } from './retry-tracker.service';
import { TelegramApiClient } from './telegram-api.client';

@Module({
  imports: [ConfigModule],
  controllers: [NotificationController],
  providers: [
    ProcessNotificationUseCase,
    MessageProcessorService,
    IdempotencyService,
    RetryTrackerService,
    TelegramApiClient,
    { provide: IDEMPOTENCY_PORT, useExisting: IdempotencyService },
    { provide: TELEGRAM_SENDER_PORT, useExisting: TelegramApiClient },
  ],
})
export class NotificationModule {}
