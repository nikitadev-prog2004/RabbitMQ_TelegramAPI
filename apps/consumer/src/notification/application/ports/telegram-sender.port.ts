import {
  EventEnvelope,
  TelegramNotificationPayload,
} from '@notification/contracts';

/** Порт: доставка уведомления во внешний Telegram HTTP-сервис. */
export interface TelegramSenderPort {
  sendTelegramNotification(
    envelope: EventEnvelope<TelegramNotificationPayload>,
  ): Promise<void>;
}
