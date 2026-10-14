import { IsDateString, IsNotEmpty, IsOptional, IsString, IsUUID, Length } from 'class-validator';

export class CreateAssignmentDto {
  @IsString()
  @IsNotEmpty()
  @Length(2, 255)
  title!: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  description?: string;

  @IsUUID()
  classId!: string;

  @IsDateString()
  dueAt!: string;
}
