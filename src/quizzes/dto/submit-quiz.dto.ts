import {
  ArrayMinSize,
  IsArray,
  IsDateString,
  IsEnum,
  IsInt,
  IsOptional,
  IsUUID,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

export class SubmitQuizAnswerDto {
  @IsUUID()
  questionId!: string;

  @IsEnum(['A', 'B', 'C', 'D'])
  selectedOption!: 'A' | 'B' | 'C' | 'D';
}

export class SubmitQuizDto {
  /**
   * Client-generated UUID used for idempotency.
   * If the same UUID is submitted again, return the existing result.
   */
  @IsUUID()
  clientSubmissionId!: string;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => SubmitQuizAnswerDto)
  answers!: SubmitQuizAnswerDto[];

  @IsOptional()
  @IsDateString()
  startedAt?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  timeTakenSeconds?: number;

  @IsOptional()
  isDisqualified?: boolean;
}
