import { Controller, Get } from '@nestjs/common';

@Controller('health')
export class HealthController {
  @Get()
  getHealth(): { readonly status: 'ok' } {
    return { status: 'ok' };
  }
}
