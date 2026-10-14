import { ApiProperty, ApiPropertyOptional, OmitType } from '@nestjs/swagger';
import {
  IsEmail,
  IsHexadecimal,
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  Length,
  MaxLength,
  Matches,
} from 'class-validator';
import { IsStrongPassword, ToLowerTrim } from '../../../common/validators';
import { CreateUserDto } from '../../users/dto/create-user.dto';
import { User, UserRole } from '../../users/entities/user.entity';

export const SELF_REGISTER_ROLES = [UserRole.USER, UserRole.ORGANIZATION] as const;

export class RegisterDto extends OmitType(CreateUserDto, ['role'] as const) {
  @ApiPropertyOptional({ enum: SELF_REGISTER_ROLES, default: UserRole.USER })
  @IsOptional()
  @IsIn(SELF_REGISTER_ROLES)
  role?: UserRole.USER | UserRole.ORGANIZATION;
}

export class LoginDto {
  @ApiProperty({ example: 'jane@example.com' })
  @IsEmail()
  @ToLowerTrim()
  email: string;

  @ApiProperty({ example: 'Str0ngPass!' })
  @IsString()
  @IsNotEmpty()
  password: string;
}

export class ForgotPasswordDto {
  @ApiProperty({ example: 'jane@example.com' })
  @IsEmail()
  @ToLowerTrim()
  email: string;
}

export class VerifyOtpDto extends ForgotPasswordDto {
  @ApiProperty({ example: '123456', description: '6-digit code from the email' })
  @Matches(/^\d{6}$/, { message: 'otp must be a 6-digit code' })
  otp: string;
}

export class ResetPasswordDto {
  @ApiProperty({ description: 'Token returned by /auth/verify-otp' })
  @IsHexadecimal()
  @Length(64, 64)
  resetToken: string;

  @ApiProperty({ example: 'NewStr0ngPass', minLength: 8 })
  @IsStrongPassword()
  newPassword: string;
}

export class AuthResponseDto {
  @ApiProperty()
  accessToken: string;

  @ApiProperty({ example: 'Bearer' })
  tokenType: 'Bearer';

  @ApiProperty({ example: '15m', description: 'Access token lifetime' })
  expiresIn: string;

  @ApiProperty({
    example: 'kq0W2m...',
    description: 'Send to POST /auth/refresh when the access token expires. Store it securely.',
  })
  refreshToken: string;

  @ApiProperty()
  refreshTokenExpiresAt: Date;

  @ApiProperty({ type: () => User })
  user: User;
}

export class RefreshTokenDto {
  @ApiProperty({ description: 'The refreshToken from login, register or the previous refresh' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  refreshToken: string;
}

export class VerifyOtpResponseDto {
  @ApiProperty({ description: 'Send this to /auth/reset-password' })
  resetToken: string;

  @ApiProperty({ example: 900, description: 'Seconds until the token expires' })
  expiresIn: number;
}
