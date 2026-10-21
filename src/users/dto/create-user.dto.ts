import { IsNotEmpty, IsOptional, IsString, IsUUID, Length, Matches } from 'class-validator';

export class CreateUserDto {
  @IsString()
  @IsNotEmpty()
  @Length(2, 255)
  name!: string;

  @IsString()
  @Matches(/^\d{10}$/, {
    message: 'Mobile number must contain exactly 10 digits',
  })
  mobileNumber!: string;

  @IsUUID()
  languageClassId!: string;

  @IsUUID()
  technologyClassId!: string;

  @IsOptional()
  @IsString()
  @Length(1, 20)
  year?: string;

  @IsOptional()
  @IsString()
  @Length(1, 100)
  enrollmentNumber?: string;
}
