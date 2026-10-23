import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseIntPipe,
  Patch,
  Post,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../auth/decorators';
import { AuthUser } from '../auth/interfaces/auth-user.interface';
import { RegisterDeviceDto } from './dto/notification.dto';
import { Notification } from './entities/notification.entity';
import { NotificationsService } from './notifications.service';

@ApiTags('Notifications')
@ApiBearerAuth()
@Controller('notifications')
export class NotificationsController {
  constructor(private readonly service: NotificationsService) {}
  @Get()
  @ApiOperation({ summary: 'My in-app notifications' })
  @ApiOkResponse({ type: [Notification] })
  list(@CurrentUser() user: AuthUser) {
    return this.service.list(user.id);
  }
  @Patch('read-all') @HttpCode(HttpStatus.OK) markAllRead(@CurrentUser() user: AuthUser) {
    return this.service.markAllRead(user.id);
  }
  @Patch(':id/read') @HttpCode(HttpStatus.OK) markRead(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.service.markRead(user.id, id);
  }
  @Post('devices') @HttpCode(HttpStatus.OK) register(
    @CurrentUser() user: AuthUser,
    @Body() dto: RegisterDeviceDto,
  ) {
    return this.service.registerToken(user.id, dto.token, dto.platform);
  }
  @Delete('devices/:token') @HttpCode(HttpStatus.OK) remove(
    @CurrentUser() user: AuthUser,
    @Param('token') token: string,
  ) {
    return this.service.removeToken(user.id, token);
  }
}
