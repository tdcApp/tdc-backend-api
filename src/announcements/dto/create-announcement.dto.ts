import { IsEnum, IsNotEmpty, IsString, IsUUID, Length, ValidateIf } from 'class-validator';

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
}
