ALTER TABLE "quiz_submissions" ADD COLUMN IF NOT EXISTS "status" varchar(20) DEFAULT 'COMPLETED' NOT NULL;
ALTER TABLE "quiz_submissions" ADD COLUMN IF NOT EXISTS "warning_count" integer DEFAULT 0 NOT NULL;
