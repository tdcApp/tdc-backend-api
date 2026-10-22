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
      max: 20,
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
        ALTER TABLE users ADD COLUMN IF NOT EXISTS enrollment_number varchar(100);
        ALTER TABLE quizzes ADD COLUMN IF NOT EXISTS target_years varchar(100);
        ALTER TABLE quizzes ADD COLUMN IF NOT EXISTS start_time timestamptz;
        ALTER TABLE quizzes ADD COLUMN IF NOT EXISTS entering_window integer DEFAULT 15;
        ALTER TABLE quizzes ADD COLUMN IF NOT EXISTS total_time integer DEFAULT 30;
        ALTER TABLE quiz_submissions ADD COLUMN IF NOT EXISTS started_at timestamptz;
        ALTER TABLE quiz_submissions ADD COLUMN IF NOT EXISTS time_taken_seconds integer;
        ALTER TABLE quiz_submissions ADD COLUMN IF NOT EXISTS status varchar(20) DEFAULT 'COMPLETED';
        ALTER TABLE quiz_submissions ADD COLUMN IF NOT EXISTS warning_count integer DEFAULT 0;
        ALTER TABLE assignments ADD COLUMN IF NOT EXISTS created_by varchar(128);
        ALTER TABLE announcements ADD COLUMN IF NOT EXISTS tag varchar(50) DEFAULT 'GENERAL';
        ALTER TABLE announcements ADD COLUMN IF NOT EXISTS target_screen varchar(50) DEFAULT 'ANNOUNCEMENT';
        ALTER TABLE announcements ADD COLUMN IF NOT EXISTS target_id varchar(128);
      `);
      console.log('Successfully ensured user_devices, users columns, quizzes timing, quiz attempt status, assignments.created_by, and announcements tags exist');
    } catch (e) {
      console.error('Failed to ensure schema updates:', e);
    }
  }

  async onModuleDestroy(): Promise<void> {
    await this.client.end();
  }
}
