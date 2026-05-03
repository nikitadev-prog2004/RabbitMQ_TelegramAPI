import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { ApiBody, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { SendNotificationUseCase } from './application/send-notification.use-case';
import { SendNotificationDto } from './dto/send-notification.dto';

@ApiTags('notifications')
@Controller('notifications')
export class NotificationsController {
  constructor(private readonly sendNotification: SendNotificationUseCase) {}

  @Post()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Отправить уведомление в Telegram',
    description:
      'По умолчанию получатель задаётся **TELEGRAM_CHAT_ID** в .env — поле **chatId** в теле не обязательно. Указывайте **chatId** только если нужен другой чат и это ваш настоящий id.',
  })
  @ApiBody({
    type: SendNotificationDto,
    examples: {
      default: {
        summary: 'Без chatId (чат из .env)',
        value: {
          text: 'Событие из очереди',
          parseMode: 'HTML',
        },
      },
      withTrace: {
        summary: 'С messageId для трассировки',
        value: {
          messageId: '3fa85f64-5717-4562-b3fc-2c963f66afa6',
          text: 'Событие из очереди',
          parseMode: 'HTML',
        },
      },
    },
  })
  @ApiOkResponse({
    schema: {
      example: {
        ok: true,
        telegramMessageId: 123,
        mocked: false,
      },
    },
  })
  async notify(@Body() dto: SendNotificationDto) {
    return this.sendNotification.execute(dto);
  }
}
