import type { UserResponseDto } from '../dto/user-response.dto';

export class UserResponseMapper {
  static toDto(user: {
    firebaseUid: string;
    email: string;
    name: string;
    mobileNumber: string;
    role: UserResponseDto['role'];
    languageClassId: string | null;
    technologyClassId: string | null;
    year?: string | null;
    enrollmentNumber?: string | null;
    gender?: string | null;
    bio?: string | null;
    createdAt: Date;
    updatedAt: Date;
  }): UserResponseDto {
    return {
      firebaseUid: user.firebaseUid,
      email: user.email,
      name: user.name,
      mobileNumber: user.mobileNumber,
      role: user.role,
      languageClassId: user.languageClassId,
      technologyClassId: user.technologyClassId,
      year: user.year ?? null,
      enrollmentNumber: user.enrollmentNumber ?? null,
      gender: user.gender ?? null,
      bio: user.bio ?? null,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
    };
  }
}
