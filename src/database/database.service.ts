import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import postgres from 'postgres';
import { drizzle, PostgresJsDatabase } from 'drizzle-orm/postgres-js';

@Injectable()
export class DatabaseService implements OnModuleInit, OnModuleDestroy {
  readonly client: postgres.Sql;
  readonly db: PostgresJsDatabase;

  constructor(private readonly configService: ConfigService) {
    const databaseUrl = this.configService.getOrThrow<string>('DATABASE_URL');

    this.client = postgres(databaseUrl, {
      max: 10,
      prepare: false,
    });

    this.db = drizzle(this.client);
  }

  async onModuleInit(): Promise<void> {
    try {
      await this.client.unsafe(`
        CREATE TABLE IF NOT EXISTS user_devices (
          id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
          user_id varchar(128) NOT NULL REFERENCES users(firebase_uid) ON DELETE CASCADE,
          fcm_token text NOT NULL UNIQUE,
          platform varchar(20) DEFAULT 'ANDROID' NOT NULL,
          updated_at timestamptz DEFAULT NOW() NOT NULL
        );
        CREATE INDEX IF NOT EXISTS user_devices_user_id_idx ON user_devices(user_id);
        ALTER TABLE users ADD COLUMN IF NOT EXISTS year varchar(20);
        ALTER TABLE quizzes ADD COLUMN IF NOT EXISTS target_years varchar(100);
      `);
      console.log('Successfully ensured user_devices, users.year, and quizzes.target_years exist');
    } catch (e) {
      console.error('Failed to ensure schema updates:', e);
    }
  }

  async onModuleDestroy(): Promise<void> {
    await this.client.end();
  }
}
