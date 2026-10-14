import {
  BadRequestException,
  Body,
  Controller,
  Get,
  NotFoundException,
  Patch,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { AuthenticatedRequest } from '../auth/guards/firebase-auth.guard';
import { FirebaseAuthGuard } from '../auth/guards/firebase-auth.guard';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { UserResponseDto } from './dto/user-response.dto';
import { UsersService } from './users.service';
import { UserResponseMapper } from './mappers/user-response.mapper';

@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get('me')
  @UseGuards(FirebaseAuthGuard)
  async getCurrentUser(@Req() request: AuthenticatedRequest): Promise<UserResponseDto> {
    const user = await this.usersService.findByFirebaseUid(request.user.uid);

    if (!user) {
      throw new NotFoundException('TDC user profile not found');
    }

    return UserResponseMapper.toDto(user);
  }

  @Post('profile')
  @UseGuards(FirebaseAuthGuard)
  async createProfile(
    @Req() request: AuthenticatedRequest,
    @Body() dto: CreateUserDto,
  ): Promise<UserResponseDto> {
    const email = request.user.email;

    if (!email) {
      throw new BadRequestException('Firebase account does not have an email address');
    }

    const user = await this.usersService.createProfile(request.user.uid, email, dto);

    return UserResponseMapper.toDto(user);
  }

  @Patch('me')
  @UseGuards(FirebaseAuthGuard)
  async updateProfile(
    @Req() request: AuthenticatedRequest,
    @Body() dto: UpdateUserDto,
  ): Promise<UserResponseDto> {
    const user = await this.usersService.updateProfile(request.user.uid, dto);
    return UserResponseMapper.toDto(user);
  }
}
