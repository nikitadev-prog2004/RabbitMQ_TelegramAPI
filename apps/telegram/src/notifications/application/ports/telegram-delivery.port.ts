import type { SendNotificationDto } from '../../dto/send-notification.dto';
import type { TelegramSendResult } from '../telegram-send-result.model';

/** Порт: отправка сообщения через Telegram Bot API. */
export interface TelegramDeliveryPort {
  sendMessage(dto: SendNotificationDto): Promise<TelegramSendResult>;
}
