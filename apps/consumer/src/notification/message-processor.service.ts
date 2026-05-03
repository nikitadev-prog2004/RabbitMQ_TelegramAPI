import { Injectable } from '@nestjs/common';
import { EventEnvelope } from '@notification/contracts';
import { ProcessNotificationUseCase } from './application/process-notification.use-case';

@Injectable()
export class MessageProcessorService {
  constructor(private readonly useCase: ProcessNotificationUseCase) {}

  process(envelope: EventEnvelope): Promise<'handled' | 'duplicate'> {
    return this.useCase.execute(envelope);
  }
}
