import {
  BadRequestException,
  CanActivate,
  ExecutionContext,
  Injectable,
  SetMetadata,
  createParamDecorator,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthUser } from '../../auth/interfaces/auth-user.interface';
import { TripMemberRole } from '../trip.enums';
import { TripAccessService } from './trip-access.service';

export const TRIP_ROLE_KEY = 'tripRole';

/**
 * Minimum role in the trip named by the `:tripId` route param.
 * Use with `@UseGuards(TripRoleGuard)` on the controller.
 */
export const TripRole = (min: TripMemberRole) => SetMetadata(TRIP_ROLE_KEY, min);

interface TripRequest {
  user: AuthUser;
  params: Record<string, string>;
  tripRole?: TripMemberRole;
}

/** The caller's role in the current trip (set by TripRoleGuard). */
export const CurrentTripRole = createParamDecorator(
  (_: unknown, ctx: ExecutionContext) => ctx.switchToHttp().getRequest<TripRequest>().tripRole,
);

@Injectable()
export class TripRoleGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly access: TripAccessService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const min = this.reflector.getAllAndOverride<TripMemberRole | undefined>(TRIP_ROLE_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!min) return true;

    const req = context.switchToHttp().getRequest<TripRequest>();
    const tripId = Number(req.params.tripId);
    if (!Number.isInteger(tripId) || tripId < 1) {
      throw new BadRequestException('tripId must be a positive integer');
    }
    req.tripRole = await this.access.assertRole(tripId, req.user, min);
    return true;
  }
}
