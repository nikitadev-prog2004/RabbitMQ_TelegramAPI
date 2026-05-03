import { Controller, Get } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';

@ApiTags('health')
@Controller('health')
export class HealthController {
  @Get()
  @ApiOperation({ summary: 'Проверка живости consumer' })
  @ApiOkResponse({
    schema: {
      example: { status: 'ok', service: 'consumer' },
    },
  })
  check() {
    return { status: 'ok', service: 'consumer' };
  }
}
