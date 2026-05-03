import { Inject, Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import {
  EventEnvelope,
  NOTIFICATION_EVENT_PATTERN,
} from '@notification/contracts';
import { firstValueFrom, timeout } from 'rxjs';
import { v4 as uuidv4 } from 'uuid';
import type { EventPublisherPort } from './application/ports/event-publisher.port';
import type { PublishResult } from './application/publish-result.model';

export type { PublishResult } from './application/publish-result.model';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

@Injectable()
export class EventPublisherService implements OnModuleDestroy, EventPublisherPort {
  private readonly logger = new Logger(EventPublisherService.name);

  constructor(
    @Inject('EVENTS_RMQ') private readonly client: ClientProxy,
  ) {}

  async onModuleDestroy(): Promise<void> {
    await this.client.close();
  }

  /**
   * Публикует JSON-событие в RabbitMQ с ретраями при временных сбоях соединения.
   */
  async publish(
    type: string,
    payload: Record<string, unknown>,
    messageId?: string,
  ): Promise<PublishResult> {
    const id = messageId ?? uuidv4();
    const envelope: EventEnvelope = {
      messageId: id,
      type,
      payload,
      occurredAt: new Date().toISOString(),
    };

    const maxAttempts = Number(process.env.RABBITMQ_PUBLISH_RETRIES ?? 5);
    const baseDelayMs = Number(process.env.RABBITMQ_PUBLISH_RETRY_DELAY_MS ?? 200);

    let lastError: unknown;
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        await firstValueFrom(
          this.client
            .emit(NOTIFICATION_EVENT_PATTERN, envelope)
            .pipe(timeout({ first: 15_000 })),
        );
        const publishedAt = new Date().toISOString();
        this.logger.log(
          `Событие опубликовано: ${id} type=${type} attempt=${attempt}`,
        );
        return {
          messageId: id,
          publishedAt,
          acknowledged: true,
        };
      } catch (e) {
        lastError = e;
        this.logger.warn(
          `Публикация не удалась (попытка ${attempt}/${maxAttempts}): ${String(e)}`,
        );
        if (attempt < maxAttempts) {
          const delay = baseDelayMs * Math.pow(2, attempt - 1);
          await sleep(Math.min(delay, 10_000));
        }
      }
    }

    this.logger.error(
      `Не удалось опубликовать событие ${id} после ${maxAttempts} попыток`,
      lastError instanceof Error ? lastError.stack : undefined,
    );
    throw lastError;
  }
}
