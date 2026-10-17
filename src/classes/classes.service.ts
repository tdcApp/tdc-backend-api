import { Injectable } from '@nestjs/common';
import { eq, or } from 'drizzle-orm';
import { DatabaseService } from '../database/database.service';
import { classes, users } from '../database/schema';
import type { GetClassesQueryDto } from './dto/get-classes-query.dto';

@Injectable()
export class ClassesService {
  constructor(private readonly databaseService: DatabaseService) {}

  findAll(query: GetClassesQueryDto) {
    const conditions = query.type ? eq(classes.type, query.type) : undefined;

    return this.databaseService.db.select().from(classes).where(conditions);
  }

  findStudentsForClass(classId: string) {
    return this.databaseService.db
      .select()
      .from(users)
      .where(
        or(
          eq(users.languageClassId, classId),
          eq(users.technologyClassId, classId),
        ),
      );
  }
}
