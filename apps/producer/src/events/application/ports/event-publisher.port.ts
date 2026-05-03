import type { PublishResult } from '../publish-result.model';

/** Порт: публикация событий в RabbitMQ. */
export interface EventPublisherPort {
  publish(
    type: string,
    payload: Record<string, unknown>,
    messageId?: string,
  ): Promise<PublishResult>;
}
