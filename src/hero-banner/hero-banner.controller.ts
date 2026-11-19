import {
  Body,
  Controller,
  Get,
  Put,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { AuthenticatedRequest } from '../auth/guards/firebase-auth.guard';
import { FirebaseAuthGuard } from '../auth/guards/firebase-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { RateLimitGuard } from '../common/guards/rate-limit.guard';
import { RateLimit } from '../common/decorators/rate-limit.decorator';
import { HeroBannerService } from './hero-banner.service';
import { UpdateHeroBannerDto } from './dto/update-hero-banner.dto';

@Controller('hero-banner')
@UseGuards(FirebaseAuthGuard)
export class HeroBannerController {
  constructor(private readonly heroBannerService: HeroBannerService) {}

  /**
   * GET /hero-banner
   * Accessible by all authenticated users (Students, Mentors, Admins).
   * Returns active/customized hero banner configuration.
   */
  @Get()
  getHeroBanner() {
    return this.heroBannerService.getHeroBanner();
  }

  /**
   * PUT /hero-banner
   * Secured endpoint: Strictly restricted to ADMIN and TEACHER roles.
   * Updates hero banner customization or toggles visibility (hide/show).
   */
  @Put()
  @UseGuards(RolesGuard, RateLimitGuard)
  @Roles('ADMIN', 'TEACHER')
  @RateLimit({ limit: 30, windowSeconds: 60 })
  updateHeroBanner(
    @Req() request: AuthenticatedRequest,
    @Body() dto: UpdateHeroBannerDto,
  ) {
    return this.heroBannerService.updateHeroBanner(request.user.uid, dto);
  }
}
