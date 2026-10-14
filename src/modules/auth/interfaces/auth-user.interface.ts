import { UserRole } from '../../users/entities/user.entity';

/** Claims stored in the access token. */
export interface JwtPayload {
  sub: number;
  email: string;
  role: UserRole;
  iat?: number;
  exp?: number;
}

/** What `request.user` holds after JwtAuthGuard. */
export interface AuthUser {
  id: number;
  email: string;
  role: UserRole;
}
