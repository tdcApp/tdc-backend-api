import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { eq } from 'drizzle-orm';
import type { AuthenticatedRequest } from '../../auth/guards/firebase-auth.guard';
import { DatabaseService } from '../../database/database.service';
import { users } from '../../database/schema';
import type { UserRoleEnum } from '../../database/schema';
import { ROLES_KEY } from '../decorators/roles.decorator';

/**
 * Must be used AFTER FirebaseAuthGuard so request.user is populated.
 *
 * Usage:
 *   @UseGuards(FirebaseAuthGuard, RolesGuard)
 *   @Roles('TEACHER', 'ADMIN')
 */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly databaseService: DatabaseService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const requiredRoles = this.reflector.getAllAndOverride<UserRoleEnum[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    // No @Roles() decorator → route is accessible to any authenticated user
    if (!requiredRoles || requiredRoles.length === 0) {
      return true;
    }

    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();

    if (!request.user) {
      throw new UnauthorizedException('Not authenticated');
    }

    const [user] = await this.databaseService.db
      .select({ role: users.role })
      .from(users)
      .where(eq(users.firebaseUid, request.user.uid))
      .limit(1);

    if (!user) {
      throw new ForbiddenException('TDC user profile not found');
    }

    if (!requiredRoles.includes(user.role)) {
      throw new ForbiddenException('Insufficient permissions');
    }

    return true;
  }
}
