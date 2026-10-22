import { IsEnum, IsNotEmpty, IsOptional, IsString, IsUUID, Length, ValidateIf } from 'class-validator';

export class CreateAnnouncementDto {
  @IsString()
  @IsNotEmpty()
  @Length(2, 255)
  title!: string;

  @IsString()
  @IsNotEmpty()
  content!: string;

  @IsEnum(['ALL', 'LANGUAGE', 'TECHNOLOGY', 'CLASS'])
  audience!: 'ALL' | 'LANGUAGE' | 'TECHNOLOGY' | 'CLASS';

  @ValidateIf((o: CreateAnnouncementDto) => o.audience === 'CLASS')
  @IsUUID()
  classId?: string;

  @IsOptional()
  @IsString()
  @Length(1, 50)
  tag?: string;

  @IsOptional()
  @IsString()
  @Length(1, 50)
  targetScreen?: string;

  @IsOptional()
  @IsString()
  @Length(1, 128)
  targetId?: string;
}

