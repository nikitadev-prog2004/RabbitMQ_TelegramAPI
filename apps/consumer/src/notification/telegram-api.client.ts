import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  EventEnvelope,
  TelegramNotificationPayload,
} from '@notification/contracts';
import type { TelegramSenderPort } from './application/ports/telegram-sender.port';

@Injectable()
export class TelegramApiClient implements TelegramSenderPort {
  constructor(private readonly config: ConfigService) {}

  async sendTelegramNotification(
    envelope: EventEnvelope<TelegramNotificationPayload>,
  ): Promise<void> {
    const baseUrl = this.config.getOrThrow<string>('TELEGRAM_SERVICE_URL');
    const url = `${baseUrl.replace(/\/$/, '')}/notifications`;

    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messageId: envelope.messageId,
        text: envelope.payload.text,
        parseMode: envelope.payload.parseMode,
      }),
    });

    if (!res.ok) {
      const body = await res.text();
      throw new Error(`Telegram service ${res.status}: ${body}`);
    }
  }
}
