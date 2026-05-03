import { ApiProperty } from '@nestjs/swagger';

export class PublishResponseDto {
  @ApiProperty({ format: 'uuid' })
  messageId!: string;

  @ApiProperty()
  publishedAt!: string;

  @ApiProperty({ description: 'Подтверждение успешной постановки в очередь' })
  acknowledged!: boolean;
}
