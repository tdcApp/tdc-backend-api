import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ClassesService } from './classes.service';
import type { AuthenticatedRequest } from '../auth/guards/firebase-auth.guard';
import { FirebaseAuthGuard } from '../auth/guards/firebase-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { GetClassesQueryDto } from './dto/get-classes-query.dto';
import {
  CreateClassDto,
  CreateClassChangeRequestDto,
  ReviewClassChangeRequestDto,
  UpdateClassDto,
} from './dto/class-management.dto';

@Controller('classes')
export class ClassesController {
  constructor(private readonly classesService: ClassesService) {}

  @Get()
  @UseGuards(FirebaseAuthGuard)
  getClasses(@Query() query: GetClassesQueryDto) {
    return this.classesService.findAll(query);
  }

  @Post()
  @UseGuards(FirebaseAuthGuard, RolesGuard)
  @Roles('ADMIN')
  createClass(@Body() dto: CreateClassDto) {
    return this.classesService.createClass(dto);
  }

  @Get('my')
  @UseGuards(FirebaseAuthGuard)
  getMyClasses(@Req() request: AuthenticatedRequest) {
    return this.classesService.findMyClasses(request.user.uid);
  }

  /** POST /classes/change-request — Student requests track change */
  @Post('change-request')
  @UseGuards(FirebaseAuthGuard)
  createChangeRequest(
    @Req() request: AuthenticatedRequest,
    @Body() dto: CreateClassChangeRequestDto,
  ) {
    return this.classesService.createChangeRequest(request.user.uid, dto);
  }

  /** GET /classes/change-request/my — Student views their current change request */
  @Get('change-request/my')
  @UseGuards(FirebaseAuthGuard)
  getMyChangeRequest(@Req() request: AuthenticatedRequest) {
    return this.classesService.findMyChangeRequest(request.user.uid);
  }

  /** GET /classes/change-requests — Teacher/Admin: view all change requests */
  @Get('change-requests')
  @UseGuards(FirebaseAuthGuard, RolesGuard)
  @Roles('TEACHER', 'ADMIN')
  getAllChangeRequests(@Query('status') status?: string) {
    return this.classesService.findAllChangeRequests(status);
  }

  /** PATCH /classes/change-requests/:id/review — Teacher/Admin: approve or reject change request */
  @Patch('change-requests/:id/review')
  @UseGuards(FirebaseAuthGuard, RolesGuard)
  @Roles('TEACHER', 'ADMIN')
  reviewChangeRequest(
    @Param('id', ParseUUIDPipe) id: string,
    @Req() request: AuthenticatedRequest,
    @Body() dto: ReviewClassChangeRequestDto,
  ) {
    return this.classesService.reviewChangeRequest(id, request.user.uid, dto);
  }

  /** PATCH /classes/:id — Admin: edit class name, type, or assigned mentor */
  @Patch(':id')
  @UseGuards(FirebaseAuthGuard, RolesGuard)
  @Roles('ADMIN')
  updateClass(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateClassDto,
  ) {
    return this.classesService.updateClass(id, dto);
  }

  /** DELETE /classes/:id — Admin: permanently delete batch */
  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @UseGuards(FirebaseAuthGuard, RolesGuard)
  @Roles('ADMIN')
  deleteClass(@Param('id', ParseUUIDPipe) id: string) {
    return this.classesService.deleteClass(id);
  }

  /** GET /classes/:id/students — Teacher/Admin: only authorized faculty can view student rosters */
  @Get(':id/students')
  @UseGuards(FirebaseAuthGuard, RolesGuard)
  @Roles('TEACHER', 'ADMIN')
  getClassStudents(@Param('id', ParseUUIDPipe) id: string) {
    return this.classesService.findStudentsForClass(id);
  }
}
