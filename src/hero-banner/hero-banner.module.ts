import { Module } from '@nestjs/common';
import { HeroBannerController } from './hero-banner.controller';
import { HeroBannerService } from './hero-banner.service';
import { FirebaseModule } from '../auth/firebase.module';
import { RedisModule } from '../redis/redis.module';

@Module({
  imports: [FirebaseModule, RedisModule],
  controllers: [HeroBannerController],
  providers: [HeroBannerService],
  exports: [HeroBannerService],
})
export class HeroBannerModule {}
