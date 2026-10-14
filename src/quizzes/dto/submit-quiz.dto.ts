import { IsArray, ArrayMinSize, IsEnum, IsUUID } from 'class-validator';

export class SubmitQuizAnswerDto {
  @IsUUID()
  questionId!: string;

  @IsEnum(['A', 'B', 'C', 'D'])
  selectedOption!: 'A' | 'B' | 'C' | 'D';
}

import { ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

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
}
