import { Body, Controller, Delete, Post, Query, Req, UseGuards } from '@nestjs/common';
import { NotificationsService } from './notifications.service';
import { FirebaseAuthGuard, type AuthenticatedRequest } from '../auth/guards/firebase-auth.guard';
import { RegisterFcmTokenDto } from './dto/register-fcm-token.dto';

@Controller('users/fcm-token')
@UseGuards(FirebaseAuthGuard)
export class NotificationsController {
  constructor(private readonly notificationsService: NotificationsService) {}

  @Post()
  async registerToken(
    @Req() req: AuthenticatedRequest,
    @Body() dto: RegisterFcmTokenDto,
  ): Promise<{ success: boolean }> {
    await this.notificationsService.registerToken(req.user.uid, dto.token, dto.platform);
    return { success: true };
  }

  @Delete()
  async unregisterToken(
    @Req() req: AuthenticatedRequest,
    @Query('token') token: string,
  ): Promise<{ success: boolean }> {
    if (token) {
      await this.notificationsService.unregisterToken(req.user.uid, token);
    }
    return { success: true };
  }
}

import { SendTestNotificationDto } from './dto/send-test-notification.dto';

@Controller('notify')
export class NotifyController {
  constructor(private readonly notificationsService: NotificationsService) {}

  @Post('test')
  async sendTestNotification(@Body() dto: SendTestNotificationDto) {
    const title = dto?.title || '🔔 TDC Notification Test';
    const message = dto?.body || 'Hello! Test notification for C++ and Android Developer track.';
    return this.notificationsService.sendBroadcastTest(title, message, dto?.target, dto?.classId);
  }
}
