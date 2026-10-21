import { IsNotEmpty, IsOptional, IsString, IsUUID, Length, Matches } from 'class-validator';

export class CreateUserDto {
  @IsString()
  @IsNotEmpty()
  @Length(2, 255)
  name!: string;

  @IsOptional()
  @IsString()
  @Matches(/^\d{10}$/, {
    message: 'Mobile number must contain exactly 10 digits',
  })
  mobileNumber?: string;

  @IsOptional()
  @IsString()
  @Matches(/^\d{10}$/, {
    message: 'Mobile number must contain exactly 10 digits',
  })
  mobile_number?: string;

  @IsOptional()
  @IsUUID()
  languageClassId?: string;

  @IsOptional()
  @IsUUID()
  language_class_id?: string;

  @IsOptional()
  @IsUUID()
  technologyClassId?: string;

  @IsOptional()
  @IsUUID()
  technology_class_id?: string;

  @IsOptional()
  @IsString()
  @Length(1, 20)
  year?: string;

  @IsOptional()
  @IsString()
  @Length(1, 100)
  enrollmentNumber?: string;

  @IsOptional()
  @IsString()
  @Length(1, 100)
  enrollment_number?: string;
}
