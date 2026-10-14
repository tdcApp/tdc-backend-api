import { IsNotEmpty, IsString, IsUrl } from 'class-validator';

export class SubmitAssignmentDto {
  @IsString()
  @IsNotEmpty()
  @IsUrl({
    require_protocol: true,
  })
  submissionUrl!: string;
}
