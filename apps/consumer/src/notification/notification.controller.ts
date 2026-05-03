import { Controller, Logger } from '@nestjs/common';
import { Ctx, EventPattern, Payload, RmqContext } from '@nestjs/microservices';
import * as amqp from 'amqplib';
import {
  EventEnvelope,
  NOTIFICATION_EVENT_PATTERN,
} from '@notification/contracts';
import { MessageProcessorService } from './message-processor.service';
import { RetryTrackerService } from './retry-tracker.service';

@Controller()
export class NotificationController {
  private readonly logger = new Logger(NotificationController.name);
  /** При true брокер подтверждает сообщение само; не вызывать channel.ack/nack. */
  private readonly rmqAutoAck =
    process.env.CONSUMER_RMQ_AUTO_ACK === 'true';

  constructor(
    private readonly processor: MessageProcessorService,
    private readonly retries: RetryTrackerService,
  ) {}

  @EventPattern(NOTIFICATION_EVENT_PATTERN)
  async handle(
    @Payload() data: EventEnvelope,
    @Ctx() context: RmqContext,
  ): Promise<void> {
    const channel = context.getChannelRef() as amqp.Channel;
    const msg = context.getMessage() as amqp.ConsumeMessage;
    const maxRetries = Number(process.env.CONSUMER_MAX_RETRIES ?? 5);

    try {
      const result = await this.processor.process(data);
      if (!this.rmqAutoAck) {
        channel.ack(msg, false);
      }
      this.retries.reset(data.messageId);
      this.logger.debug(
        `ACK messageId=${data.messageId} result=${result} autoAck=${this.rmqAutoAck}`,
      );
    } catch (e) {
      const attempt = this.retries.nextAttempt(data.messageId);
      const requeue = this.retries.shouldRequeue(data.messageId, maxRetries);
      this.logger.error(
        `NACK messageId=${data.messageId} attempt=${attempt} requeue=${requeue} autoAck=${this.rmqAutoAck}`,
        e instanceof Error ? e.message : undefined,
      );
      if (!this.rmqAutoAck) {
        channel.nack(msg, false, requeue);
      } else {
        this.logger.warn(
          'CONSUMER_RMQ_AUTO_ACK=true: nack не вызывается; при ошибке возможна потеря повторной доставки',
        );
      }
      if (!requeue) {
        this.retries.reset(data.messageId);
      }
    }
  }
}
