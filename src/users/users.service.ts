import {
  ConflictException,
  Injectable,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { and, eq, or } from 'drizzle-orm';
import { PostgresError } from 'postgres';
import { DatabaseService } from '../database/database.service';
import { RedisService } from '../redis/redis.service';
import { classes, users } from '../database/schema';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';

@Injectable()
export class UsersService {
  constructor(
    private readonly databaseService: DatabaseService,
    private readonly redisService: RedisService,
  ) {}

  async findByFirebaseUid(firebaseUid: string) {
    const cacheKey = `user:profile:${firebaseUid}`;
    const cached = await this.redisService.get<any>(cacheKey);
    if (cached) {
      return cached;
    }

    const [user] = await this.databaseService.db
      .select()
      .from(users)
      .where(eq(users.firebaseUid, firebaseUid))
      .limit(1);

    if (user) {
      await this.redisService.set(cacheKey, user, 300);
    }

    return user ?? null;
  }

  async createProfile(firebaseUid: string, email: string, dto: CreateUserDto) {
    const existingUser = await this.findByFirebaseUid(firebaseUid);

    if (existingUser) {
      throw new ConflictException('User profile already exists');
    }

    const languageClassId = dto.languageClassId ?? dto.language_class_id;
    const technologyClassId = dto.technologyClassId ?? dto.technology_class_id;
    const mobileNumber = dto.mobileNumber ?? dto.mobile_number;
    const enrollmentNumber = dto.enrollmentNumber ?? dto.enrollment_number ?? null;

    if (!mobileNumber) {
      throw new BadRequestException('Mobile number is required and must contain exactly 10 digits');
    }

    if (!languageClassId) {
      throw new BadRequestException('Please select a language class');
    }

    if (!technologyClassId) {
      throw new BadRequestException('Please select a technology class');
    }

    const [languageClass] = await this.databaseService.db
      .select({ id: classes.id })
      .from(classes)
      .where(and(eq(classes.id, languageClassId), eq(classes.type, 'LANGUAGE')))
      .limit(1);

    if (!languageClass) {
      throw new BadRequestException('Invalid language class');
    }

    const [technologyClass] = await this.databaseService.db
      .select({ id: classes.id })
      .from(classes)
      .where(and(eq(classes.id, technologyClassId), eq(classes.type, 'TECHNOLOGY')))
      .limit(1);

    if (!technologyClass) {
      throw new BadRequestException('Invalid technology class');
    }

    try {
      const [user] = await this.databaseService.db
        .insert(users)
        .values({
          firebaseUid,
          email,
          name: dto.name,
          mobileNumber,
          role: 'STUDENT',
          languageClassId: languageClass.id,
          technologyClassId: technologyClass.id,
          year: dto.year ?? null,
          enrollmentNumber,
        })
        .returning();

      await this.redisService.del(`user:profile:${firebaseUid}`);
      return user;
    } catch (error) {
      if (error instanceof PostgresError && error.code === '23505') {
        throw new ConflictException('TDC user profile already exists');
      }

      throw error;
    }
  }

  async updateProfile(firebaseUid: string, dto: UpdateUserDto) {
    const existing = await this.findByFirebaseUid(firebaseUid);

    if (!existing) {
      throw new NotFoundException('TDC user profile not found');
    }

    if (existing.year && dto.year && dto.year !== existing.year) {
      throw new BadRequestException('Academic year cannot be changed once set');
    }

    const mobile = dto.mobileNumber ?? (dto.phone ? dto.phone : undefined);
    const enrollment = dto.enrollmentNumber ?? dto.enrollment_number;

    const [updated] = await this.databaseService.db
      .update(users)
      .set({
        ...(dto.name !== undefined && { name: dto.name }),
        ...(mobile !== undefined && { mobileNumber: mobile }),
        ...(dto.year !== undefined && !existing.year && { year: dto.year }),
        ...(enrollment !== undefined && { enrollmentNumber: enrollment }),
        updatedAt: new Date(),
      })
      .where(eq(users.firebaseUid, firebaseUid))
      .returning();

    await this.redisService.del(`user:profile:${firebaseUid}`);
    return updated;
  }

  async findAllStudents(classId?: string) {
    const query = this.databaseService.db
      .select()
      .from(users)
      .where(
        classId
          ? and(
              eq(users.role, 'STUDENT'),
              or(eq(users.languageClassId, classId), eq(users.technologyClassId, classId)),
            )
          : eq(users.role, 'STUDENT'),
      );

    return query;
  }
}
