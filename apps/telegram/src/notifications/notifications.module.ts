import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { SendNotificationUseCase } from './application/send-notification.use-case';
import { TELEGRAM_DELIVERY_PORT } from './application/tokens';
import { NotificationsController } from './notifications.controller';
import { TelegramBotService } from './telegram-bot.service';

@Module({
  imports: [ConfigModule],
  controllers: [NotificationsController],
  providers: [
    TelegramBotService,
    SendNotificationUseCase,
    { provide: TELEGRAM_DELIVERY_PORT, useExisting: TelegramBotService },
  ],
  exports: [TelegramBotService, SendNotificationUseCase, TELEGRAM_DELIVERY_PORT],
})
export class NotificationsModule {}
