import { Body, Controller, Delete, Get, Post, Query, Req, UseGuards } from '@nestjs/common';
import { NotificationsService } from './notifications.service';
import { DatabaseService } from '../database/database.service';
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
  constructor(
    private readonly notificationsService: NotificationsService,
    private readonly databaseService: DatabaseService,
  ) {}

  @Get('debug')
  async debug() {
    try {
      const tableCheck = await this.databaseService.client`
        SELECT column_name, data_type 
        FROM information_schema.columns 
        WHERE table_name = 'user_devices'
      `;
      if (tableCheck.length === 0) {
        await this.databaseService.client`
          CREATE TABLE IF NOT EXISTS user_devices (
            id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
            user_id varchar(128) NOT NULL,
            fcm_token text NOT NULL UNIQUE,
            platform varchar(20) DEFAULT 'ANDROID' NOT NULL,
            updated_at timestamptz DEFAULT NOW() NOT NULL
          )
        `;
        return { status: 'created_table' };
      }
      return { status: 'table_exists', columns: tableCheck };
    } catch (e: any) {
      return { status: 'error', error: e.message, stack: e.stack };
    }
  }

  @Post('test')
  async sendTestNotification(@Body() dto: SendTestNotificationDto) {
    const title = dto?.title || '🔔 TDC Notification Test';
    const message = dto?.body || 'Hello! Test notification for TDC App.';
    return this.notificationsService.sendBroadcastTest(
      title,
      message,
      dto?.target,
      dto?.classId,
      dto?.type,
      dto?.tag,
      dto?.id,
    );
  }
}
