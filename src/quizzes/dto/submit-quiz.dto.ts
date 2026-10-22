import {
  IsArray,
  IsBoolean,
  IsDateString,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

export class SubmitQuizAnswerDto {
  @IsUUID()
  questionId!: string;

  @IsString()
  selectedOption!: string;
}

export class SubmitQuizDto {
  /**
   * Client-generated UUID used for idempotency.
   * If the same UUID is submitted again, return the existing result.
   */
  @IsUUID()
  clientSubmissionId!: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SubmitQuizAnswerDto)
  answers!: SubmitQuizAnswerDto[];

  @IsOptional()
  @IsDateString()
  startedAt?: string;

  @IsOptional()
  @IsDateString()
  started_at?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  timeTakenSeconds?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  time_taken_seconds?: number;

  @IsOptional()
  @IsBoolean()
  isDisqualified?: boolean;

  @IsOptional()
  @IsBoolean()
  is_disqualified?: boolean;
}
