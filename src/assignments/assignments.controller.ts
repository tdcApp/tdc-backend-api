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
  Req,
  UseGuards,
} from '@nestjs/common';
import type { AuthenticatedRequest } from '../auth/guards/firebase-auth.guard';
import { FirebaseAuthGuard } from '../auth/guards/firebase-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { AssignmentsService } from './assignments.service';
import { CreateAssignmentDto } from './dto/create-assignment.dto';
import { SubmitAssignmentDto } from './dto/submit-assignment.dto';

@Controller('assignments')
@UseGuards(FirebaseAuthGuard)
export class AssignmentsController {
  constructor(private readonly assignmentsService: AssignmentsService) {}

  /** GET /assignments — Returns assignments relevant to the current user */
  @Get()
  findAll(@Req() request: AuthenticatedRequest) {
    return this.assignmentsService.findForUser(request.user.uid);
  }

  /** GET /assignments/:id — Assignment detail */
  @Get(':id')
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.assignmentsService.findOne(id);
  }

  /** POST /assignments — Teacher/Admin: create assignment */
  @Post()
  @UseGuards(RolesGuard)
  @Roles('TEACHER', 'ADMIN')
  create(@Req() request: AuthenticatedRequest, @Body() dto: CreateAssignmentDto) {
    return this.assignmentsService.create(request.user.uid, dto);
  }

  /** POST /assignments/:id/submit — Student: submit assignment URL */
  @Post(':id/submit')
  submit(
    @Param('id', ParseUUIDPipe) id: string,
    @Req() request: AuthenticatedRequest,
    @Body() dto: SubmitAssignmentDto,
  ) {
    return this.assignmentsService.submit(id, request.user.uid, dto);
  }

  /** GET /assignments/:id/submissions — Teacher/Admin: view all submissions */
  @Get(':id/submissions')
  @UseGuards(RolesGuard)
  @Roles('TEACHER', 'ADMIN')
  getSubmissions(@Param('id', ParseUUIDPipe) id: string) {
    return this.assignmentsService.getSubmissions(id);
  }

  /** GET /assignments/:id/my-submission — Student: view own submission */
  @Get(':id/my-submission')
  getMySubmission(@Param('id', ParseUUIDPipe) id: string, @Req() request: AuthenticatedRequest) {
    return this.assignmentsService.getMySubmission(id, request.user.uid);
  }

  /** DELETE /assignments/:id — Teacher/Admin: delete assignment (teacher must own the class) */
  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @UseGuards(RolesGuard)
  @Roles('TEACHER', 'ADMIN')
  deleteAssignment(@Param('id', ParseUUIDPipe) id: string, @Req() request: AuthenticatedRequest) {
    return this.assignmentsService.deleteAssignment(id, request.user.uid);
  }
}
