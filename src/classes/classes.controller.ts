import { Controller, Get, Param, ParseUUIDPipe, Query, UseGuards } from '@nestjs/common';
import { ClassesService } from './classes.service';
import { FirebaseAuthGuard } from '../auth/guards/firebase-auth.guard';
import { GetClassesQueryDto } from './dto/get-classes-query.dto';

@Controller('classes')
export class ClassesController {
  constructor(private readonly classesService: ClassesService) {}

  @Get()
  @UseGuards(FirebaseAuthGuard)
  getClasses(@Query() query: GetClassesQueryDto) {
    return this.classesService.findAll(query);
  }

  @Get(':id/students')
  @UseGuards(FirebaseAuthGuard)
  getClassStudents(@Param('id', ParseUUIDPipe) id: string) {
    return this.classesService.findStudentsForClass(id);
  }
}
