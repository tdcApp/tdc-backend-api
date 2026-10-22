ALTER TABLE "quizzes" ADD COLUMN IF NOT EXISTS "start_time" timestamp with time zone;
ALTER TABLE "quizzes" ADD COLUMN IF NOT EXISTS "entering_window" integer DEFAULT 15;
ALTER TABLE "quizzes" ADD COLUMN IF NOT EXISTS "total_time" integer DEFAULT 30 NOT NULL;
ALTER TABLE "quiz_submissions" ADD COLUMN IF NOT EXISTS "started_at" timestamp with time zone;
ALTER TABLE "quiz_submissions" ADD COLUMN IF NOT EXISTS "time_taken_seconds" integer;
