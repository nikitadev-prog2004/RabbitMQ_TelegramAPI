import { Inject, Injectable } from '@nestjs/common';
import type { SendNotificationDto } from '../dto/send-notification.dto';
import type { TelegramSendResult } from './telegram-send-result.model';
import type { TelegramDeliveryPort } from './ports/telegram-delivery.port';
import { TELEGRAM_DELIVERY_PORT } from './tokens';

@Injectable()
export class SendNotificationUseCase {
  constructor(
    @Inject(TELEGRAM_DELIVERY_PORT)
    private readonly delivery: TelegramDeliveryPort,
  ) {}

  execute(dto: SendNotificationDto): Promise<TelegramSendResult> {
    return this.delivery.sendMessage(dto);
  }
}
