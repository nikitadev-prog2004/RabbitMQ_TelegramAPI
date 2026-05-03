import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { PublishEventUseCase } from './application/publish-event.use-case';
import { PublishEventDto } from './dto/publish-event.dto';
import { PublishResponseDto } from './dto/publish-response.dto';

@ApiTags('events')
@Controller('events')
export class EventsController {
  constructor(private readonly publishEvent: PublishEventUseCase) {}

  @Post()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Отправить событие в очередь RabbitMQ' })
  @ApiOkResponse({ type: PublishResponseDto })
  async publish(@Body() dto: PublishEventDto) {
    return this.publishEvent.execute(dto.type, dto.payload, dto.messageId);
  }
}
