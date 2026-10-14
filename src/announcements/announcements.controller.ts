import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { AuthenticatedRequest } from '../auth/guards/firebase-auth.guard';
import { FirebaseAuthGuard } from '../auth/guards/firebase-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { AnnouncementsService } from './announcements.service';
import { CreateAnnouncementDto } from './dto/create-announcement.dto';

@Controller('announcements')
@UseGuards(FirebaseAuthGuard)
export class AnnouncementsController {
  constructor(private readonly announcementsService: AnnouncementsService) {}

  /** GET /announcements — Returns announcements visible to the current user */
  @Get()
  findAll(@Req() request: AuthenticatedRequest) {
    return this.announcementsService.findForUser(request.user.uid);
  }

  /** GET /announcements/:id — Single announcement detail */
  @Get(':id')
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.announcementsService.findOne(id);
  }

  /** POST /announcements — Teacher/Admin: create announcement */
  @Post()
  @UseGuards(RolesGuard)
  @Roles('TEACHER', 'ADMIN')
  create(@Req() request: AuthenticatedRequest, @Body() dto: CreateAnnouncementDto) {
    return this.announcementsService.create(request.user.uid, dto);
  }

  /** DELETE /announcements/:id — Teacher/Admin: delete announcement (teacher can only delete own) */
  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @UseGuards(RolesGuard)
  @Roles('TEACHER', 'ADMIN')
  deleteAnnouncement(@Param('id', ParseUUIDPipe) id: string, @Req() request: AuthenticatedRequest) {
    return this.announcementsService.deleteAnnouncement(id, request.user.uid);
  }
}
