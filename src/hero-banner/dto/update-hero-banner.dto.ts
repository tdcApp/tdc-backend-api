import { IsBoolean, IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

export class UpdateHeroBannerDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  title: string;

  @IsString()
  @IsOptional()
  subtitle?: string;

  @IsString()
  @IsOptional()
  @MaxLength(50)
  tag?: string;

  @IsString()
  @IsOptional()
  @MaxLength(50)
  badgeText?: string;

  @IsString()
  @IsOptional()
  @MaxLength(100)
  buttonText?: string;

  @IsString()
  @IsOptional()
  actionUrl?: string;

  @IsString()
  @IsOptional()
  @MaxLength(50)
  actionType?: string;

  @IsBoolean()
  @IsNotEmpty()
  isActive: boolean;
}
