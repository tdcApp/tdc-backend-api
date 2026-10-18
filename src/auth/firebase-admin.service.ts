import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { App, cert, getApps, initializeApp } from 'firebase-admin/app';
import { Auth, getAuth } from 'firebase-admin/auth';
import { Messaging, getMessaging } from 'firebase-admin/messaging';

@Injectable()
export class FirebaseAdminService {
  private readonly auth: Auth;
  private readonly messaging: Messaging;

  constructor(private readonly configService: ConfigService) {
    const existingApps = getApps();

    const app: App =
      existingApps.length > 0
        ? existingApps[0]
        : initializeApp({
            credential: cert({
              projectId: this.configService.getOrThrow<string>('FIREBASE_PROJECT_ID'),

              clientEmail: this.configService.getOrThrow<string>('FIREBASE_CLIENT_EMAIL'),

              privateKey: this.configService
                .getOrThrow<string>('FIREBASE_PRIVATE_KEY')
                .replace(/\\n/g, '\n'),
            }),
          });

    this.auth = getAuth(app);
    this.messaging = getMessaging(app);
  }

  getAuth(): Auth {
    return this.auth;
  }

  getMessaging(): Messaging {
    return this.messaging;
  }
}
