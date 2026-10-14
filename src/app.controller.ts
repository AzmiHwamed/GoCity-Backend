import { Controller, Get, VERSION_NEUTRAL } from '@nestjs/common';
import { ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { AppService, HealthStatus } from './app.service';
import { Public } from './modules/auth/decorators';
import { ResponseTitle } from './common/response/api-response';

@ApiTags('Health')
@Public()
@Controller({ version: VERSION_NEUTRAL })
export class AppController {
  constructor(private readonly appService: AppService) {}

  @Get('health')
  @ApiOkResponse({ description: 'Service and database health' })
  @ResponseTitle('Service health')
  getHealth(): Promise<HealthStatus> {
    return this.appService.getHealth();
  }
}
