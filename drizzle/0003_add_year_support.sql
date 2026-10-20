ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "year" varchar(20);
ALTER TABLE "quizzes" ADD COLUMN IF NOT EXISTS "target_years" varchar(100);
