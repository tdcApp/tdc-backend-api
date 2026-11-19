import { IsEnum, IsNotEmpty, IsOptional, IsString, IsUUID } from 'class-validator';
import type { ClassTypeEnum } from '../../database/schema';

export class CreateClassDto {
  @IsString()
  @IsNotEmpty()
  name: string;

  @IsEnum(['LANGUAGE', 'TECHNOLOGY'])
  type: ClassTypeEnum;

  @IsString()
  @IsNotEmpty()
  mentorUid: string;
}

export class UpdateClassDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  name?: string;

  @IsOptional()
  @IsEnum(['LANGUAGE', 'TECHNOLOGY'])
  type?: ClassTypeEnum;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  mentorUid?: string;
}

export class CreateClassChangeRequestDto {
  @IsOptional()
  @IsUUID()
  requestedLanguageClassId?: string;

  @IsOptional()
  @IsUUID()
  requestedTechnologyClassId?: string;

  @IsOptional()
  @IsString()
  reason?: string;
}

export class ReviewClassChangeRequestDto {
  @IsEnum(['APPROVED', 'REJECTED'])
  status: 'APPROVED' | 'REJECTED';
}
