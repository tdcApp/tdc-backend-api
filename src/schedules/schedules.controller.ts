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
  Req,
  UseGuards,
} from '@nestjs/common';
import type { AuthenticatedRequest } from '../auth/guards/firebase-auth.guard';
import { FirebaseAuthGuard } from '../auth/guards/firebase-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { SchedulesService } from './schedules.service';
import { CreateScheduleDto } from './dto/create-schedule.dto';
import { UpdateScheduleDto } from './dto/update-schedule.dto';

@Controller('schedules')
@UseGuards(FirebaseAuthGuard)
export class SchedulesController {
  constructor(private readonly schedulesService: SchedulesService) {}

  /** GET /schedules/me — Current user's schedule based on enrolled classes */
  @Get('me')
  getMySchedule(@Req() request: AuthenticatedRequest) {
    return this.schedulesService.findMySchedule(request.user.uid);
  }

  /** GET /schedules/class/:classId — Teacher/Admin: all schedules for a class */
  @Get('class/:classId')
  @UseGuards(RolesGuard)
  @Roles('TEACHER', 'ADMIN')
  getClassSchedule(@Param('classId', ParseUUIDPipe) classId: string) {
    return this.schedulesService.findByClass(classId);
  }

  /** POST /schedules — Teacher/Admin: create a schedule entry */
  @Post()
  @UseGuards(RolesGuard)
  @Roles('TEACHER', 'ADMIN')
  createSchedule(@Req() request: AuthenticatedRequest, @Body() dto: CreateScheduleDto) {
    return this.schedulesService.createSchedule(request.user.uid, dto);
  }

  /** PATCH /schedules/:id — Teacher/Admin: update a schedule entry */
  @Patch(':id')
  @UseGuards(RolesGuard)
  @Roles('TEACHER', 'ADMIN')
  updateSchedule(
    @Param('id', ParseUUIDPipe) id: string,
    @Req() request: AuthenticatedRequest,
    @Body() dto: UpdateScheduleDto,
  ) {
    return this.schedulesService.updateSchedule(id, request.user.uid, dto);
  }

  /** DELETE /schedules/:id — Teacher/Admin: delete a schedule entry */
  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @UseGuards(RolesGuard)
  @Roles('TEACHER', 'ADMIN')
  deleteSchedule(@Param('id', ParseUUIDPipe) id: string, @Req() request: AuthenticatedRequest) {
    return this.schedulesService.deleteSchedule(id, request.user.uid);
  }
}
