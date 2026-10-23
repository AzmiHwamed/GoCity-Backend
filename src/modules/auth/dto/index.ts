import { ApiProperty, ApiPropertyOptional, OmitType } from '@nestjs/swagger';
import {
  IsBoolean,
  IsEmail,
  IsHexadecimal,
  IsNotEmpty,
  IsOptional,
  IsString,
  Length,
  MaxLength,
  Matches,
} from 'class-validator';
import { IsStrongPassword, ToLowerTrim } from '../../../common/validators';
import { CreateUserDto } from '../../users/dto/create-user.dto';
import { User } from '../../users/entities/user.entity';

/** Public registration creates standard user accounts only. Admins create organizations. */
export class RegisterDto extends OmitType(CreateUserDto, ['role', 'organizationName'] as const) {
  @ApiPropertyOptional({
    example: true,
    description:
      'The user ticked "I agree to the Terms of Use and Privacy Policy". Records the current ' +
      'versions. Optional so older clients keep working; they are asked to accept after login.',
  })
  @IsOptional()
  @IsBoolean()
  acceptTerms?: boolean;
}

/** Public registration payload for a business that publishes reusable programs. */
export class OrganizationRegisterDto extends OmitType(CreateUserDto, ['role'] as const) {
  @ApiPropertyOptional({ example: true })
  @IsOptional()
  @IsBoolean()
  acceptTerms?: boolean;
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

export class SocialLoginDto {
  @ApiProperty({ enum: ['google', 'facebook'] })
  @IsString()
  @Matches(/^(google|facebook)$/)
  provider: 'google' | 'facebook';

  @ApiPropertyOptional({ description: 'Firebase ID token returned after provider sign-in' })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  firebaseIdToken?: string;

  @ApiPropertyOptional({ description: 'Google ID token from Google Identity Services' })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  googleIdToken?: string;

  @ApiPropertyOptional({ description: 'Facebook access token from Facebook Login' })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  facebookAccessToken?: string;

  @ApiPropertyOptional({
    example: true,
    description: 'Required only when this social identity creates a new GoCity account',
  })
  @IsOptional()
  @IsBoolean()
  acceptTerms?: boolean;
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
