import { IsDateString, IsOptional, IsString, IsUUID, Length } from 'class-validator';

export class UpdateAssignmentDto {
  @IsOptional()
  @IsString()
  @Length(2, 255)
  title?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsUUID()
  classId?: string;

  @IsOptional()
  @IsDateString()
  dueAt?: string;
}
