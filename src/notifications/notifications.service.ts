import { Injectable, Logger } from '@nestjs/common';
import { and, eq, inArray, isNotNull, or } from 'drizzle-orm';
import { DatabaseService } from '../database/database.service';
import { userDevices, users } from '../database/schema';
import { FirebaseAdminService } from '../auth/firebase-admin.service';

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(
    private readonly databaseService: DatabaseService,
    private readonly firebaseAdminService: FirebaseAdminService,
  ) {}

  async registerToken(userId: string, token: string, platform = 'ANDROID'): Promise<void> {
    try {
      await this.databaseService.db
        .insert(userDevices)
        .values({
          userId,
          fcmToken: token,
          platform,
          updatedAt: new Date(),
        })
        .onConflictDoUpdate({
          target: userDevices.fcmToken,
          set: {
            userId,
            platform,
            updatedAt: new Date(),
          },
        });
      this.logger.log(`Registered FCM token for user ${userId}`);
    } catch (e) {
      this.logger.error(`Error registering FCM token for user ${userId}`, e);
    }
  }

  async unregisterToken(userId: string, token: string): Promise<void> {
    try {
      await this.databaseService.db
        .delete(userDevices)
        .where(and(eq(userDevices.userId, userId), eq(userDevices.fcmToken, token)));
      this.logger.log(`Unregistered FCM token for user ${userId}`);
    } catch (e) {
      this.logger.error(`Error unregistering FCM token for user ${userId}`, e);
    }
  }

  async sendToUsers(
    userIds: string[],
    title: string,
    body: string,
    data: Record<string, string> = {},
  ): Promise<void> {
    if (!userIds || userIds.length === 0) return;

    try {
      const devices = await this.databaseService.db
        .select({ token: userDevices.fcmToken })
        .from(userDevices)
        .where(inArray(userDevices.userId, userIds));

      const tokens = Array.from(new Set(devices.map((d) => d.token)));
      if (tokens.length === 0) {
        this.logger.debug(`No device tokens found for target users (${userIds.length} users)`);
        return;
      }

      const messaging = this.firebaseAdminService.getMessaging();
      // Data-only payload with high priority wakes device from Doze mode
      // and guarantees onMessageReceived() is invoked across all app states (foreground, background, killed)
      const stringData: Record<string, string> = {
        title: String(title),
        body: String(body),
      };
      for (const [k, v] of Object.entries(data)) {
        if (v !== undefined && v !== null) {
          stringData[k] = String(v);
        }
      }

      const response = await messaging.sendEachForMulticast({
        tokens,
        data: stringData,
        android: {
          priority: 'high',
        },
      });

      this.logger.log(
        `FCM multicast sent: ${response.successCount} succeeded, ${response.failureCount} failed`,
      );

      // Clean up stale or unregistered tokens
      const staleTokens: string[] = [];
      response.responses.forEach((resp, idx) => {
        if (!resp.success && resp.error) {
          const code = resp.error.code;
          if (
            code === 'messaging/invalid-registration-token' ||
            code === 'messaging/registration-token-not-registered'
          ) {
            staleTokens.push(tokens[idx]);
          }
        }
      });

      if (staleTokens.length > 0) {
        await this.databaseService.db
          .delete(userDevices)
          .where(inArray(userDevices.fcmToken, staleTokens));
        this.logger.log(`Cleaned up ${staleTokens.length} stale FCM tokens`);
      }
    } catch (error) {
      this.logger.error('Failed to send FCM push notification', error);
    }
  }

  async sendToClass(
    classId: string,
    title: string,
    body: string,
    data: Record<string, string> = {},
  ): Promise<void> {
    try {
      const enrolledUsers = await this.databaseService.db
        .select({ uid: users.firebaseUid })
        .from(users)
        .where(
          and(
            eq(users.role, 'STUDENT'),
            or(eq(users.languageClassId, classId), eq(users.technologyClassId, classId)),
          ),
        );

      const uids = enrolledUsers.map((u) => u.uid);
      await this.sendToUsers(uids, title, body, data);
    } catch (error) {
      this.logger.error(`Failed to send class notification for class ${classId}`, error);
    }
  }

  async sendToAudience(
    audience: string,
    classId: string | null | undefined,
    title: string,
    body: string,
    data: Record<string, string> = {},
  ): Promise<void> {
    try {
      const aud = audience.toUpperCase();
      if (aud === 'CLASS' && classId) {
        return this.sendToClass(classId, title, body, data);
      }

      if (aud === 'ALL') {
        const allStudents = await this.databaseService.db
          .select({ uid: users.firebaseUid })
          .from(users)
          .where(eq(users.role, 'STUDENT'));
        return this.sendToUsers(
          allStudents.map((u) => u.uid),
          title,
          body,
          data,
        );
      }

      if (aud === 'LANGUAGE') {
        const students = await this.databaseService.db
          .select({ uid: users.firebaseUid })
          .from(users)
          .where(and(eq(users.role, 'STUDENT'), isNotNull(users.languageClassId)));
        return this.sendToUsers(
          students.map((u) => u.uid),
          title,
          body,
          data,
        );
      }

      if (aud === 'TECHNOLOGY') {
        const students = await this.databaseService.db
          .select({ uid: users.firebaseUid })
          .from(users)
          .where(and(eq(users.role, 'STUDENT'), isNotNull(users.technologyClassId)));
        return this.sendToUsers(
          students.map((u) => u.uid),
          title,
          body,
          data,
        );
      }
    } catch (error) {
      this.logger.error(`Failed to send audience notification (${audience})`, error);
    }
  }

  async sendBroadcastTest(
    title: string,
    body: string,
    target = 'ALL',
    classId?: string,
  ): Promise<{ sent: number; failed: number; totalTokens: number; message?: string }> {
    try {
      let tokens: string[] = [];

      if (classId) {
        const enrolledUsers = await this.databaseService.db
          .select({ uid: users.firebaseUid })
          .from(users)
          .where(
            and(
              eq(users.role, 'STUDENT'),
              or(eq(users.languageClassId, classId), eq(users.technologyClassId, classId)),
            ),
          );
        const uids = enrolledUsers.map((u) => u.uid);
        if (uids.length > 0) {
          const devices = await this.databaseService.db
            .select({ token: userDevices.fcmToken })
            .from(userDevices)
            .where(inArray(userDevices.userId, uids));
          tokens = Array.from(new Set(devices.map((d) => d.token)));
        }
      } else {
        const devices = await this.databaseService.db
          .select({ token: userDevices.fcmToken })
          .from(userDevices);
        tokens = Array.from(new Set(devices.map((d) => d.token)));
      }

      if (tokens.length === 0) {
        return {
          sent: 0,
          failed: 0,
          totalTokens: 0,
          message:
            'No registered device tokens found in database. Make sure the app has been opened with internet so it registers its token.',
        };
      }

      const messaging = this.firebaseAdminService.getMessaging();
      const response = await messaging.sendEachForMulticast({
        tokens,
        data: {
          title: String(title),
          body: String(body),
          type: 'ANNOUNCEMENT',
        },
        android: {
          priority: 'high',
        },
      });

      this.logger.log(`Test multicast sent: ${response.successCount} succeeded, ${response.failureCount} failed`);

      return {
        sent: response.successCount,
        failed: response.failureCount,
        totalTokens: tokens.length,
      };
    } catch (e: any) {
      this.logger.error('Error sending test broadcast notification', e);
      throw e;
    }
  }
}
