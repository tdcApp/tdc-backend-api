import {
  ArrayMinSize,
  IsArray,
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

export class CreateQuizQuestionDto {
  @IsString()
  @IsNotEmpty()
  question!: string;

  @IsString()
  @IsNotEmpty()
  optionA!: string;

  @IsString()
  @IsNotEmpty()
  optionB!: string;

  @IsString()
  @IsNotEmpty()
  optionC!: string;

  @IsString()
  @IsNotEmpty()
  optionD!: string;

  @IsEnum(['A', 'B', 'C', 'D'])
  correctOption!: 'A' | 'B' | 'C' | 'D';
}

export class CreateQuizDto {
  @IsString()
  @IsNotEmpty()
  @Length(2, 255)
  title!: string;

  @IsEnum(['ALL', 'LANGUAGE', 'TECHNOLOGY', 'CLASS'])
  audience!: 'ALL' | 'LANGUAGE' | 'TECHNOLOGY' | 'CLASS';

  @IsOptional()
  @IsString()
  @Length(1, 100)
  targetYears?: string;

  @ValidateIf((o: CreateQuizDto) => o.audience === 'CLASS')
  @IsUUID()
  classId?: string;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => CreateQuizQuestionDto)
  questions!: CreateQuizQuestionDto[];
}
