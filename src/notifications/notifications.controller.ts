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

@Controller('notify')
export class NotifyController {
  constructor(private readonly notificationsService: NotificationsService) {}

  @Post('test')
  async sendTestNotification(
    @Body() body: { title?: string; body?: string; target?: string; classId?: string },
  ) {
    const title = body?.title || '🔔 TDC Notification Test';
    const message = body?.body || 'Hello! Test notification for C++ and Android Developer track.';
    return this.notificationsService.sendBroadcastTest(title, message, body?.target, body?.classId);
  }
}
