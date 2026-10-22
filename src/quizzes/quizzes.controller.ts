import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { AuthenticatedRequest } from '../auth/guards/firebase-auth.guard';
import { FirebaseAuthGuard } from '../auth/guards/firebase-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { RateLimit } from '../common/decorators/rate-limit.decorator';
import { RateLimitGuard } from '../common/guards/rate-limit.guard';
import { QuizzesService } from './quizzes.service';
import { CreateQuizDto } from './dto/create-quiz.dto';
import { SubmitQuizDto } from './dto/submit-quiz.dto';

@Controller('quizzes')
@UseGuards(FirebaseAuthGuard)
export class QuizzesController {
  constructor(private readonly quizzesService: QuizzesService) {}

  /** GET /quizzes — Returns quizzes visible to the current user */
  @Get()
  findAll(@Req() request: AuthenticatedRequest) {
    return this.quizzesService.findForUser(request.user.uid);
  }

  /** GET /quizzes/:id — Quiz detail with questions (correct options hidden for students) */
  @Get(':id')
  findOne(@Param('id', ParseUUIDPipe) id: string, @Req() request: AuthenticatedRequest) {
    return this.quizzesService.findOne(id, request.user.uid);
  }

  /** POST /quizzes — Teacher/Admin: create quiz with questions */
  @Post()
  @UseGuards(RolesGuard)
  @Roles('TEACHER', 'ADMIN')
  create(@Req() request: AuthenticatedRequest, @Body() dto: CreateQuizDto) {
    return this.quizzesService.create(request.user.uid, dto);
  }

  /** POST /quizzes/:id/start — Student: start or resume a quiz attempt */
  @Post(':id/start')
  start(@Param('id', ParseUUIDPipe) id: string, @Req() request: AuthenticatedRequest) {
    return this.quizzesService.startQuiz(id, request.user.uid);
  }

  /** POST /quizzes/:id/strike — Student: record integrity strike */
  @Post(':id/strike')
  recordStrike(@Param('id', ParseUUIDPipe) id: string, @Req() request: AuthenticatedRequest) {
    return this.quizzesService.recordStrike(id, request.user.uid);
  }

  /** POST /quizzes/:id/submit — Student: submit quiz answers (Rate limited: 3 / min) */
  @Post(':id/submit')
  @UseGuards(RateLimitGuard)
  @RateLimit({ limit: 3, windowSeconds: 60 })
  submit(
    @Param('id', ParseUUIDPipe) id: string,
    @Req() request: AuthenticatedRequest,
    @Body() dto: SubmitQuizDto,
  ) {
    return this.quizzesService.submit(id, request.user.uid, dto);
  }

  /** GET /quizzes/:id/submissions — Teacher/Admin: view all submissions with optional pagination */
  @Get(':id/submissions')
  @UseGuards(RolesGuard)
  @Roles('TEACHER', 'ADMIN')
  getSubmissions(
    @Param('id', ParseUUIDPipe) id: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.quizzesService.getSubmissions(id, page, limit);
  }

  /** GET /quizzes/:id/my-submission — Student: view own submission */
  @Get(':id/my-submission')
  getMySubmission(@Param('id', ParseUUIDPipe) id: string, @Req() request: AuthenticatedRequest) {
    return this.quizzesService.getMySubmission(id, request.user.uid);
  }

  /** DELETE /quizzes/:id — Teacher/Admin: delete quiz (teacher can only delete own) */
  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @UseGuards(RolesGuard)
  @Roles('TEACHER', 'ADMIN')
  deleteQuiz(@Param('id', ParseUUIDPipe) id: string, @Req() request: AuthenticatedRequest) {
    return this.quizzesService.deleteQuiz(id, request.user.uid);
  }
}
