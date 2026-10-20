import { IsNotEmpty, IsOptional, IsString, Length, Matches } from 'class-validator';

export class UpdateUserDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @Length(2, 255)
  name?: string;

  @IsOptional()
  @IsString()
  @Matches(/^\d{10}$/, {
    message: 'Mobile number must contain exactly 10 digits',
  })
  mobileNumber?: string;

  @IsOptional()
  @IsString()
  @Length(1, 20)
  year?: string;
}
