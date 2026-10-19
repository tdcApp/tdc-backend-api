import { Global, Module } from '@nestjs/common';
import { RolesGuard } from './guards/roles.guard';
import { RateLimitGuard } from './guards/rate-limit.guard';

@Global()
@Module({
  providers: [RolesGuard, RateLimitGuard],
  exports: [RolesGuard, RateLimitGuard],
})
export class CommonModule {}
