import { Injectable, Logger } from '@nestjs/common';
import { desc, eq } from 'drizzle-orm';
import { DatabaseService } from '../database/database.service';
import { heroBanners } from '../database/schema';
import { RedisService } from '../redis/redis.service';
import { UpdateHeroBannerDto } from './dto/update-hero-banner.dto';

const CACHE_KEY = 'cache:hero_banner';
const CACHE_TTL = 60; // 60 seconds

@Injectable()
export class HeroBannerService {
  private readonly logger = new Logger(HeroBannerService.name);

  constructor(
    private readonly databaseService: DatabaseService,
    private readonly redisService: RedisService,
  ) {}

  async getHeroBanner() {
    const cached = await this.redisService.get(CACHE_KEY);
    if (cached) {
      return cached;
    }

    const [banner] = await this.databaseService.db
      .select()
      .from(heroBanners)
      .orderBy(desc(heroBanners.updatedAt))
      .limit(1);

    if (!banner) {
      const fallback = {
        id: null,
        title: 'TDC Coding Quest Season 3',
        subtitle: 'Innovate • Build • Collaborate',
        tag: 'COMING SOON',
        badgeText: null,
        buttonText: 'Register Now',
        actionUrl: 'https://forms.gle/nkSmmE9EU31os5UU8',
        actionType: 'URL',
        isActive: true,
      };
      return fallback;
    }

    await this.redisService.set(CACHE_KEY, banner, CACHE_TTL);
    return banner;
  }

  async updateHeroBanner(updatedByUid: string, dto: UpdateHeroBannerDto) {
    const [existing] = await this.databaseService.db
      .select({ id: heroBanners.id })
      .from(heroBanners)
      .orderBy(desc(heroBanners.updatedAt))
      .limit(1);

    let result;
    const now = new Date();

    if (existing) {
      const [updated] = await this.databaseService.db
        .update(heroBanners)
        .set({
          title: dto.title.trim(),
          subtitle: dto.subtitle?.trim() ?? null,
          tag: dto.tag?.trim() || 'COMING SOON',
          badgeText: dto.badgeText?.trim() ?? null,
          buttonText: dto.buttonText?.trim() || 'Register Now',
          actionUrl: dto.actionUrl?.trim() ?? null,
          actionType: dto.actionType?.trim() || 'URL',
          isActive: dto.isActive,
          updatedBy: updatedByUid,
          updatedAt: now,
        })
        .where(eq(heroBanners.id, existing.id))
        .returning();
      result = updated;
    } else {
      const [inserted] = await this.databaseService.db
        .insert(heroBanners)
        .values({
          title: dto.title.trim(),
          subtitle: dto.subtitle?.trim() ?? null,
          tag: dto.tag?.trim() || 'COMING SOON',
          badgeText: dto.badgeText?.trim() ?? null,
          buttonText: dto.buttonText?.trim() || 'Register Now',
          actionUrl: dto.actionUrl?.trim() ?? null,
          actionType: dto.actionType?.trim() || 'URL',
          isActive: dto.isActive,
          updatedBy: updatedByUid,
          createdAt: now,
          updatedAt: now,
        })
        .returning();
      result = inserted;
    }

    await this.redisService.del(CACHE_KEY);
    this.logger.log(`Hero banner updated by ${updatedByUid}: isActive=${result.isActive}, title="${result.title}"`);
    return result;
  }
}
