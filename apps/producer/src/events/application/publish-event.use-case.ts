import { Inject, Injectable } from '@nestjs/common';
import type { PublishResult } from './publish-result.model';
import type { EventPublisherPort } from './ports/event-publisher.port';
import { EVENT_PUBLISHER_PORT } from './tokens';

@Injectable()
export class PublishEventUseCase {
  constructor(
    @Inject(EVENT_PUBLISHER_PORT)
    private readonly publisher: EventPublisherPort,
  ) {}

  execute(
    type: string,
    payload: Record<string, unknown>,
    messageId?: string,
  ): Promise<PublishResult> {
    return this.publisher.publish(type, payload, messageId);
  }
}
