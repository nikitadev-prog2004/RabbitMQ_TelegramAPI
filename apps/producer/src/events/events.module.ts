import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ClientsModule, Transport } from '@nestjs/microservices';
import { PublishEventUseCase } from './application/publish-event.use-case';
import { EVENT_PUBLISHER_PORT } from './application/tokens';
import { EventPublisherService } from './event-publisher.service';
import { EventsController } from './events.controller';

@Module({
  imports: [
    ConfigModule,
    ClientsModule.registerAsync([
      {
        name: 'EVENTS_RMQ',
        imports: [ConfigModule],
        useFactory: (config: ConfigService) => ({
          transport: Transport.RMQ,
          options: {
            urls: [
              config.get<string>(
                'RABBITMQ_URL',
                'amqp://guest:guest@127.0.0.1:5672',
              ),
            ],
            queue: config.get<string>('RABBITMQ_QUEUE', 'notification_events'),
            queueOptions: {
              durable: true,
            },
            persistent: true,
            socketOptions: {
              heartbeatIntervalInSeconds: 60,
              reconnectTimeInSeconds: 5,
            },
          },
        }),
        inject: [ConfigService],
      },
    ]),
  ],
  controllers: [EventsController],
  providers: [
    EventPublisherService,
    PublishEventUseCase,
    { provide: EVENT_PUBLISHER_PORT, useExisting: EventPublisherService },
  ],
  exports: [EventPublisherService, PublishEventUseCase, EVENT_PUBLISHER_PORT],
})
export class EventsModule {}
