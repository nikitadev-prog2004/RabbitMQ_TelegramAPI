import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
} from 'class-validator';

/** Числовой id чата / супергруппы или @username канала (как в Bot API). */
const TELEGRAM_CHAT_ID_RE = /^(-?\d+|@[a-zA-Z][a-zA-Z0-9_]{4,31})$/;

export class SendNotificationDto {
  @ApiPropertyOptional({
    description: 'Идентификатор из шины (для трассировки)',
    format: 'uuid',
  })
  @IsOptional()
  @IsUUID()
  messageId?: string;

  @ApiProperty({ example: 'Событие из очереди', maxLength: 4096 })
  @IsString()
  @MaxLength(4096)
  text!: string;

  @ApiPropertyOptional({ enum: ['HTML', 'Markdown', 'MarkdownV2'] })
  @IsOptional()
  @IsIn(['HTML', 'Markdown', 'MarkdownV2'])
  parseMode?: 'HTML' | 'Markdown' | 'MarkdownV2';

  @ApiPropertyOptional({
    description:
      'Только ваш реальный числовой id или @channelusername. Если поле не передавать — берётся TELEGRAM_CHAT_ID из .env (обычно так и нужно). Любой «пример» id из документации не ваш чат — Telegram вернёт chat not found.',
  })
  @IsOptional()
  @IsString()
  @Matches(TELEGRAM_CHAT_ID_RE, {
    message:
      'chatId: укажите числовой Telegram id (например 123456789) или @channelusername; иначе удалите поле и настройте TELEGRAM_CHAT_ID в .env',
  })
  chatId?: string;
}
