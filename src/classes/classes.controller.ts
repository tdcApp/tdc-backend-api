import { Controller, Get, Param, ParseUUIDPipe, Query, Req, UseGuards } from '@nestjs/common';
import { ClassesService } from './classes.service';
import type { AuthenticatedRequest } from '../auth/guards/firebase-auth.guard';
import { FirebaseAuthGuard } from '../auth/guards/firebase-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { GetClassesQueryDto } from './dto/get-classes-query.dto';

@Controller('classes')
export class ClassesController {
  constructor(private readonly classesService: ClassesService) {}

  @Get()
  @UseGuards(FirebaseAuthGuard)
  getClasses(@Query() query: GetClassesQueryDto) {
    return this.classesService.findAll(query);
  }

  @Get('my')
  @UseGuards(FirebaseAuthGuard)
  getMyClasses(@Req() request: AuthenticatedRequest) {
    return this.classesService.findMyClasses(request.user.uid);
  }

  /** GET /classes/:id/students — Teacher/Admin: only authorized faculty can view student rosters */
  @Get(':id/students')
  @UseGuards(FirebaseAuthGuard, RolesGuard)
  @Roles('TEACHER', 'ADMIN')
  getClassStudents(@Param('id', ParseUUIDPipe) id: string) {
    return this.classesService.findStudentsForClass(id);
  }
}
