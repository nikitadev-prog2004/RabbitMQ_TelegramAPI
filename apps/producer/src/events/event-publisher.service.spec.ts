import { ClientProxy } from '@nestjs/microservices';
import { Test, TestingModule } from '@nestjs/testing';
import { of, throwError } from 'rxjs';
import { NOTIFICATION_EVENT_PATTERN } from '@notification/contracts';
import { EventPublisherService } from './event-publisher.service';

describe('EventPublisherService', () => {
  let service: EventPublisherService;
  let client: { emit: jest.Mock };

  beforeEach(async () => {
    client = {
      emit: jest.fn().mockReturnValue(of(undefined)),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        EventPublisherService,
        { provide: 'EVENTS_RMQ', useValue: client },
      ],
    }).compile();

    service = module.get(EventPublisherService);
    process.env.RABBITMQ_PUBLISH_RETRIES = '2';
    process.env.RABBITMQ_PUBLISH_RETRY_DELAY_MS = '1';
  });

  it('публикует событие с переданным messageId', async () => {
    const result = await service.publish(
      'telegram.notify',
      { text: 'hi' },
      '550e8400-e29b-41d4-a716-446655440000',
    );
    expect(result.messageId).toBe('550e8400-e29b-41d4-a716-446655440000');
    expect(result.acknowledged).toBe(true);
    expect(client.emit).toHaveBeenCalledWith(
      NOTIFICATION_EVENT_PATTERN,
      expect.objectContaining({
        messageId: '550e8400-e29b-41d4-a716-446655440000',
        type: 'telegram.notify',
      }),
    );
  });

  it('повторяет при ошибке и затем бросает', async () => {
    client.emit
      .mockReturnValueOnce(throwError(() => new Error('network')))
      .mockReturnValueOnce(of(undefined));

    await service.publish('x', {});
    expect(client.emit).toHaveBeenCalledTimes(2);
  });
});
