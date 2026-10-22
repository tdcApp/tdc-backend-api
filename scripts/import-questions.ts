import 'dotenv/config';
import * as fs from 'fs';
import * as path from 'path';
import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import { eq, sql } from 'drizzle-orm';
import { quizzes, quizQuestions, users } from '../src/database/schema';
import { Redis } from '@upstash/redis';

interface RawQuestion {
  question?: string;
  prompt?: string;
  q?: string;
  optionA?: string;
  option_a?: string;
  a?: string;
  A?: string;
  optionB?: string;
  option_b?: string;
  b?: string;
  B?: string;
  optionC?: string;
  option_c?: string;
  c?: string;
  C?: string;
  optionD?: string;
  option_d?: string;
  d?: string;
  D?: string;
  correctOption?: string;
  correct_option?: string;
  answer?: string;
  correct?: string;
}

interface ParsedQuestion {
  question: string;
  optionA: string;
  optionB: string;
  optionC: string;
  optionD: string;
  correctOption: 'A' | 'B' | 'C' | 'D';
}

function parseArgs(): Record<string, string | boolean> {
  const args: Record<string, string | boolean> = {};
  for (let i = 2; i < process.argv.length; i++) {
    const arg = process.argv[i];
    if (arg.startsWith('--')) {
      const parts = arg.slice(2).split('=');
      const key = parts[0];
      const val = parts.length > 1 ? parts.slice(1).join('=') : true;
      args[key] = val;
    } else if (arg.startsWith('-')) {
      const key = arg.slice(1);
      const nextArg = process.argv[i + 1];
      if (nextArg && !nextArg.startsWith('-')) {
        args[key] = nextArg;
        i++;
      } else {
        args[key] = true;
      }
    }
  }
  return args;
}

function normalizeQuestion(raw: RawQuestion, index: number): ParsedQuestion {
  const question = (raw.question || raw.prompt || raw.q || '').trim();
  if (!question) {
    throw new Error(`Question #${index + 1}: question/prompt is missing or empty.`);
  }

  const optionA = (raw.optionA || raw.option_a || raw.a || raw.A || '').trim();
  const optionB = (raw.optionB || raw.option_b || raw.b || raw.B || '').trim();
  const optionC = (raw.optionC || raw.option_c || raw.c || raw.C || '').trim();
  const optionD = (raw.optionD || raw.option_d || raw.d || raw.D || '').trim();

  if (!optionA) throw new Error(`Question #${index + 1}: optionA is missing or empty.`);
  if (!optionB) throw new Error(`Question #${index + 1}: optionB is missing or empty.`);
  if (!optionC) throw new Error(`Question #${index + 1}: optionC is missing or empty.`);
  if (!optionD) throw new Error(`Question #${index + 1}: optionD is missing or empty.`);

  const rawCorrect = (raw.correctOption || raw.correct_option || raw.answer || raw.correct || '').trim().toUpperCase();

  let correctOption: 'A' | 'B' | 'C' | 'D';
  if (rawCorrect === 'A' || rawCorrect === '1' || rawCorrect === optionA.toUpperCase()) {
    correctOption = 'A';
  } else if (rawCorrect === 'B' || rawCorrect === '2' || rawCorrect === optionB.toUpperCase()) {
    correctOption = 'B';
  } else if (rawCorrect === 'C' || rawCorrect === '3' || rawCorrect === optionC.toUpperCase()) {
    correctOption = 'C';
  } else if (rawCorrect === 'D' || rawCorrect === '4' || rawCorrect === optionD.toUpperCase()) {
    correctOption = 'D';
  } else {
    throw new Error(`Question #${index + 1}: Invalid correctOption '${rawCorrect}'. Must be A, B, C, or D.`);
  }

  return { question, optionA, optionB, optionC, optionD, correctOption };
}

async function main() {
  const args = parseArgs();

  // If no args provided, show help
  if (!args.file && !args.f && !args.list && !args.l) {
    console.log(`
╔═══════════════════════════════════════════════════════════════════╗
║                 TDC QUIZ QUESTION IMPORT SCRIPT                   ║
╚═══════════════════════════════════════════════════════════════════╝

Usage:
  npx ts-node scripts/import-questions.ts --file=<path-to-json> [options]

Commands & Options:
  --file, -f       Path to the JSON questions file (Required for import)
  --quizId, -q     Target quiz UUID to push questions into
  --replace        Replace existing questions instead of appending
  --create         Create a new quiz header before importing questions
  --title          Quiz title (required when using --create)
  --audience       ALL | LANGUAGE | TECHNOLOGY | CLASS (default: ALL)
  --years          Academic years (e.g. "1st, 2nd" or "ALL")
  --totalTime      Total quiz duration in minutes (default: 30)
  --list, -l       List all existing quizzes with their IDs
  --dry-run        Validate questions without inserting into database

Examples:
  1. Validate questions in JSON file (Dry Run):
     npx ts-node scripts/import-questions.ts --dry-run --file=scripts/questions.example.json

  2. List all quizzes in DB:
     npx ts-node scripts/import-questions.ts --list

  3. Push questions to an existing quiz:
     npx ts-node scripts/import-questions.ts --quizId=123e4567-e89b-12d3-a456-426614174000 --file=scripts/questions.example.json

  4. Create a new quiz and import questions:
     npx ts-node scripts/import-questions.ts --create --title="Python 101" --file=scripts/questions.example.json
`);
    return;
  }

  // Parse input JSON file if provided
  const filePath = (args.file || args.f) as string;
  let validatedQuestions: ParsedQuestion[] = [];
  let fileTitle: string | undefined;

  if (filePath) {
    const resolvedPath = path.resolve(process.cwd(), filePath);
    if (!fs.existsSync(resolvedPath)) {
      console.error(`❌ Error: File not found at path: ${resolvedPath}`);
      process.exit(1);
    }

    const fileContent = fs.readFileSync(resolvedPath, 'utf8');
    let parsedJson: any;
    try {
      parsedJson = JSON.parse(fileContent);
    } catch (e: any) {
      console.error(`❌ Error: Failed to parse JSON file: ${e.message}`);
      process.exit(1);
    }

    let rawQuestions: RawQuestion[] = [];

    if (Array.isArray(parsedJson)) {
      rawQuestions = parsedJson;
    } else if (typeof parsedJson === 'object' && parsedJson !== null) {
      if (Array.isArray(parsedJson.questions)) {
        rawQuestions = parsedJson.questions;
        fileTitle = parsedJson.title;
      } else {
        console.error('❌ Error: JSON object must either be an array of questions or contain a "questions" array property.');
        process.exit(1);
      }
    }

    if (rawQuestions.length === 0) {
      console.error('❌ Error: No questions found in the file.');
      process.exit(1);
    }

    console.log(`\n🔍 Parsing and validating ${rawQuestions.length} questions...`);
    validatedQuestions = rawQuestions.map((q, idx) => normalizeQuestion(q, idx));
    console.log(`✅ All ${validatedQuestions.length} questions validated successfully!`);

    if (args['dry-run']) {
      console.log('\n[Dry Run Mode] Preview of parsed questions:');
      console.table(
        validatedQuestions.map((q, i) => ({
          '#': i + 1,
          Question: q.question.length > 40 ? q.question.slice(0, 37) + '...' : q.question,
          'Opt A': q.optionA,
          'Opt B': q.optionB,
          'Opt C': q.optionC,
          'Opt D': q.optionD,
          Ans: q.correctOption,
        }))
      );
      console.log('\n🎉 Dry run passed! Your JSON questions format is 100% valid.');
      return;
    }
  }

  // Database Connection for DB operations
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.error('❌ Error: DATABASE_URL is not set in environment or .env file');
    process.exit(1);
  }

  const client = postgres(databaseUrl, { max: 1 });
  const db = drizzle(client);

  try {
    // 1. List quizzes mode
    if (args.list || args.l) {
      console.log('\n📋 Fetching available quizzes from database...\n');
      const quizList = await db
        .select({
          id: quizzes.id,
          title: quizzes.title,
          audience: quizzes.audience,
          targetYears: quizzes.targetYears,
          totalTime: quizzes.totalTime,
          createdAt: quizzes.createdAt,
          questionCount: sql<number>`(SELECT COUNT(*)::int FROM ${quizQuestions} WHERE ${quizQuestions.quizId} = ${quizzes.id})`,
        })
        .from(quizzes)
        .orderBy(quizzes.createdAt);

      if (quizList.length === 0) {
        console.log('No quizzes found in the database.');
      } else {
        console.table(
          quizList.map((q) => ({
            'Quiz ID': q.id,
            Title: q.title,
            Audience: q.audience,
            'Target Years': q.targetYears || 'ALL',
            'Duration (m)': q.totalTime,
            Questions: q.questionCount,
          }))
        );
      }
      return;
    }

    if (validatedQuestions.length === 0) {
      console.error('❌ Error: No questions provided to import.');
      process.exit(1);
    }

    // Determine target quiz ID
    let targetQuizId = (args.quizId || args.q) as string;

    if (args.create) {
      const quizTitle = (args.title as string) || fileTitle || 'New Imported Quiz';
      const audience = ((args.audience as string) || 'ALL').toUpperCase() as any;
      const targetYears = (args.years as string) || null;
      const totalTime = parseInt((args.totalTime as string) || '30', 10) || 30;

      // Find an admin or teacher to assign as createdBy
      const [creator] = await db
        .select({ firebaseUid: users.firebaseUid })
        .from(users)
        .where(sql`${users.role} IN ('ADMIN', 'TEACHER')`)
        .limit(1);

      if (!creator) {
        console.error('❌ Error: No teacher or admin user found in database to assign as quiz creator.');
        process.exit(1);
      }

      console.log(`\nCreating new quiz: "${quizTitle}" (Audience: ${audience}, Time: ${totalTime}m)...`);
      const [newQuiz] = await db
        .insert(quizzes)
        .values({
          title: quizTitle,
          audience,
          targetYears,
          totalTime,
          createdBy: creator.firebaseUid,
        })
        .returning();

      targetQuizId = newQuiz.id;
      console.log(`✨ Created Quiz successfully with ID: ${targetQuizId}`);
    }

    if (!targetQuizId) {
      console.error('\n❌ Error: Please specify a target quiz using --quizId=<UUID> or use --create to make a new one.');
      console.log('Run with --list to view existing quizzes.');
      process.exit(1);
    }

    // Verify target quiz exists
    const [existingQuiz] = await db
      .select({ id: quizzes.id, title: quizzes.title })
      .from(quizzes)
      .where(eq(quizzes.id, targetQuizId))
      .limit(1);

    if (!existingQuiz) {
      console.error(`❌ Error: Quiz with ID "${targetQuizId}" does not exist in database.`);
      process.exit(1);
    }

    console.log(`\n🎯 Target Quiz: "${existingQuiz.title}" (${targetQuizId})`);

    // Handle replace or append
    let startingOrder = 1;

    if (args.replace) {
      console.log('🗑️  --replace specified: Removing existing questions for this quiz...');
      await db.delete(quizQuestions).where(eq(quizQuestions.quizId, targetQuizId));
    } else {
      const [maxOrder] = await db
        .select({ max: sql<number>`COALESCE(MAX(${quizQuestions.questionOrder}), 0)` })
        .from(quizQuestions)
        .where(eq(quizQuestions.quizId, targetQuizId));

      startingOrder = Number(maxOrder?.max || 0) + 1;
      if (startingOrder > 1) {
        console.log(`📌 Quiz already has questions. Appending starting from question order ${startingOrder}...`);
      }
    }

    // Insert questions
    const questionRows = validatedQuestions.map((q, idx) => ({
      quizId: targetQuizId,
      question: q.question,
      optionA: q.optionA,
      optionB: q.optionB,
      optionC: q.optionC,
      optionD: q.optionD,
      correctOption: q.correctOption,
      questionOrder: startingOrder + idx,
    }));

    console.log(`📥 Inserting ${questionRows.length} questions into database...`);
    await db.insert(quizQuestions).values(questionRows);
    console.log(`🎉 Successfully imported ${questionRows.length} questions into "${existingQuiz.title}"!`);

    // Invalidate Redis cache if configured
    if (process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN) {
      try {
        const redis = new Redis({
          url: process.env.UPSTASH_REDIS_REST_URL,
          token: process.env.UPSTASH_REDIS_REST_TOKEN,
        });
        await redis.del(`quiz:questions:${targetQuizId}`);
        console.log(`🔄 Cleared Redis cache key: quiz:questions:${targetQuizId}`);
      } catch (redisError) {
        console.warn('⚠️  Could not clear Redis cache (ignored):', redisError);
      }
    }
  } catch (err: any) {
    console.error('\n❌ Import failed:', err.message || err);
    process.exit(1);
  } finally {
    await client.end();
  }
}

main();
