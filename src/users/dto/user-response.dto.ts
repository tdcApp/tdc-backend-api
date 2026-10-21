import { UserRoleEnum } from '../../database/schema';

export class UserResponseDto {
  firebaseUid!: string;
  email!: string;
  name!: string;
  mobileNumber!: string;
  role!: UserRoleEnum;
  languageClassId!: string | null;
  technologyClassId!: string | null;
  year!: string | null;
  enrollmentNumber!: string | null;
  createdAt!: Date;
  updatedAt!: Date;
}
