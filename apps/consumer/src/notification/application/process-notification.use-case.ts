import { Inject, Injectable, Logger } from '@nestjs/common';
import {
  EventEnvelope,
  TelegramNotificationPayload,
} from '@notification/contracts';
import type { IdempotencyPort } from './ports/idempotency.port';
import type { TelegramSenderPort } from './ports/telegram-sender.port';
import { IDEMPOTENCY_PORT, TELEGRAM_SENDER_PORT } from './tokens';

@Injectable()
export class ProcessNotificationUseCase {
  private readonly logger = new Logger(ProcessNotificationUseCase.name);

  constructor(
    @Inject(IDEMPOTENCY_PORT) private readonly idempotency: IdempotencyPort,
    @Inject(TELEGRAM_SENDER_PORT) private readonly telegram: TelegramSenderPort,
  ) {}

  async execute(envelope: EventEnvelope): Promise<'handled' | 'duplicate'> {
    if (!envelope?.messageId || !envelope?.type) {
      throw new Error('Некорректное сообщение: нет messageId или type');
    }

    if (await this.idempotency.isDuplicate(envelope.messageId)) {
      return 'duplicate';
    }

    try {
      switch (envelope.type) {
        case 'telegram.notify':
          await this.telegram.sendTelegramNotification(
            envelope as EventEnvelope<TelegramNotificationPayload>,
          );
          await this.idempotency.markProcessed(envelope.messageId);
          this.logger.log(
            `Успешно: messageId=${envelope.messageId} type=${envelope.type}`,
          );
          break;
        default:
          this.logger.warn(
            `Неизвестный тип события: ${envelope.type}, помечаем как обработанное`,
          );
          await this.idempotency.markProcessed(envelope.messageId);
      }
      return 'handled';
    } catch (e) {
      this.logger.error(
        `Ошибка обработки messageId=${envelope.messageId}`,
        e instanceof Error ? e.stack : undefined,
      );
      throw e;
    }
  }
}
