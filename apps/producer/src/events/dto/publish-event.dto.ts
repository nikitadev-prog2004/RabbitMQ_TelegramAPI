import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsObject, IsOptional, IsString, IsUUID } from 'class-validator';

export class PublishEventDto {
  @ApiPropertyOptional({
    description:
      'Уникальный ID сообщения (UUID). Если не передан — генерируется на producer.',
    format: 'uuid',
  })
  @IsOptional()
  @IsUUID()
  messageId?: string;

  @ApiProperty({ example: 'telegram.notify' })
  @IsString()
  type!: string;

  @ApiProperty({ example: { text: 'Hello' }, type: Object })
  @IsObject()
  payload!: Record<string, unknown>;
}
