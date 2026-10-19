import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { eq, inArray, or } from 'drizzle-orm';
import { DatabaseService } from '../database/database.service';
import { classes, schedules, users } from '../database/schema';
import type { CreateScheduleDto } from './dto/create-schedule.dto';
import type { UpdateScheduleDto } from './dto/update-schedule.dto';

@Injectable()
export class SchedulesService {
  constructor(private readonly databaseService: DatabaseService) {}

  async findMySchedule(firebaseUid: string) {
    const [user] = await this.databaseService.db
      .select({
        role: users.role,
        languageClassId: users.languageClassId,
        technologyClassId: users.technologyClassId,
      })
      .from(users)
      .where(eq(users.firebaseUid, firebaseUid))
      .limit(1);

    if (!user) {
      return [];
    }

    // ADMIN: full visibility into all schedules
    if (user.role === 'ADMIN') {
      return this.databaseService.db
        .select({
          id: schedules.id,
          classId: schedules.classId,
          className: classes.name,
          classType: classes.type,
          dayOfWeek: schedules.dayOfWeek,
          startTime: schedules.startTime,
          endTime: schedules.endTime,
          subject: schedules.subject,
          room: schedules.room,
          teacherUid: schedules.teacherUid,
        })
        .from(schedules)
        .innerJoin(classes, eq(schedules.classId, classes.id));
    }

    // TEACHER: schedules where they are teacherUid OR where class mentorUid is this teacher,
    // or fallback to all schedules so mentor has complete schedule management visibility
    if (user.role === 'TEACHER') {
      const myTaught = await this.databaseService.db
        .select({
          id: schedules.id,
          classId: schedules.classId,
          className: classes.name,
          classType: classes.type,
          dayOfWeek: schedules.dayOfWeek,
          startTime: schedules.startTime,
          endTime: schedules.endTime,
          subject: schedules.subject,
          room: schedules.room,
          teacherUid: schedules.teacherUid,
        })
        .from(schedules)
        .innerJoin(classes, eq(schedules.classId, classes.id))
        .where(or(eq(schedules.teacherUid, firebaseUid), eq(classes.mentorUid, firebaseUid)));

      if (myTaught.length > 0) {
        return myTaught;
      }

      return this.databaseService.db
        .select({
          id: schedules.id,
          classId: schedules.classId,
          className: classes.name,
          classType: classes.type,
          dayOfWeek: schedules.dayOfWeek,
          startTime: schedules.startTime,
          endTime: schedules.endTime,
          subject: schedules.subject,
          room: schedules.room,
          teacherUid: schedules.teacherUid,
        })
        .from(schedules)
        .innerJoin(classes, eq(schedules.classId, classes.id));
    }

    // STUDENT: Filter by their enrolled classes
    const classIds = [user.languageClassId, user.technologyClassId].filter(
      (id): id is string => id !== null,
    );

    if (classIds.length === 0) {
      return [];
    }

    return this.databaseService.db
      .select({
        id: schedules.id,
        classId: schedules.classId,
        className: classes.name,
        classType: classes.type,
        dayOfWeek: schedules.dayOfWeek,
        startTime: schedules.startTime,
        endTime: schedules.endTime,
        subject: schedules.subject,
        room: schedules.room,
        teacherUid: schedules.teacherUid,
      })
      .from(schedules)
      .innerJoin(classes, eq(schedules.classId, classes.id))
      .where(inArray(schedules.classId, classIds));
  }

  async findByClass(classId: string) {
    const [classRecord] = await this.databaseService.db
      .select({ id: classes.id })
      .from(classes)
      .where(eq(classes.id, classId))
      .limit(1);

    if (!classRecord) {
      throw new NotFoundException('Class not found');
    }

    return this.databaseService.db
      .select()
      .from(schedules)
      .where(eq(schedules.classId, classId))
      .orderBy(schedules.dayOfWeek, schedules.startTime);
  }

  async createSchedule(firebaseUid: string, dto: CreateScheduleDto) {
    const [classRecord] = await this.databaseService.db
      .select({ id: classes.id })
      .from(classes)
      .where(eq(classes.id, dto.classId))
      .limit(1);

    if (!classRecord) {
      throw new BadRequestException('Class not found');
    }

    if (dto.startTime >= dto.endTime) {
      throw new BadRequestException('End time must be after start time');
    }

    const [schedule] = await this.databaseService.db
      .insert(schedules)
      .values({
        classId: dto.classId,
        dayOfWeek: dto.dayOfWeek,
        startTime: dto.startTime,
        endTime: dto.endTime,
        subject: dto.subject,
        room: dto.room,
        teacherUid: firebaseUid,
      })
      .returning();

    return schedule;
  }

  async updateSchedule(scheduleId: string, firebaseUid: string, dto: UpdateScheduleDto) {
    const [existing] = await this.databaseService.db
      .select()
      .from(schedules)
      .where(eq(schedules.id, scheduleId))
      .limit(1);

    if (!existing) {
      throw new NotFoundException('Schedule not found');
    }

    const [user] = await this.databaseService.db
      .select({ role: users.role })
      .from(users)
      .where(eq(users.firebaseUid, firebaseUid))
      .limit(1);

    if (user && user.role !== 'ADMIN' && user.role !== 'TEACHER' && existing.teacherUid !== firebaseUid) {
      throw new ForbiddenException('You can only update your own schedules');
    }

    // Validate new times if either is being changed
    const newStart = dto.startTime ?? existing.startTime;
    const newEnd = dto.endTime ?? existing.endTime;

    if (newStart >= newEnd) {
      throw new BadRequestException('End time must be after start time');
    }

    const [updated] = await this.databaseService.db
      .update(schedules)
      .set({
        ...(dto.classId !== undefined && { classId: dto.classId }),
        ...(dto.dayOfWeek !== undefined && { dayOfWeek: dto.dayOfWeek }),
        ...(dto.startTime !== undefined && { startTime: dto.startTime }),
        ...(dto.endTime !== undefined && { endTime: dto.endTime }),
        ...(dto.subject !== undefined && { subject: dto.subject }),
        ...(dto.room !== undefined && { room: dto.room }),
        updatedAt: new Date(),
      })
      .where(eq(schedules.id, scheduleId))
      .returning();

    return updated;
  }

  async deleteSchedule(scheduleId: string, firebaseUid?: string) {
    const [existing] = await this.databaseService.db
      .select({ id: schedules.id, teacherUid: schedules.teacherUid })
      .from(schedules)
      .where(eq(schedules.id, scheduleId))
      .limit(1);

    if (!existing) {
      throw new NotFoundException('Schedule not found');
    }

    if (firebaseUid) {
      const [user] = await this.databaseService.db
        .select({ role: users.role })
        .from(users)
        .where(eq(users.firebaseUid, firebaseUid))
        .limit(1);

      if (user && user.role !== 'ADMIN' && user.role !== 'TEACHER' && existing.teacherUid !== firebaseUid) {
        throw new ForbiddenException('You can only delete your own schedules');
      }
    }

    await this.databaseService.db.delete(schedules).where(eq(schedules.id, scheduleId));
  }
}
