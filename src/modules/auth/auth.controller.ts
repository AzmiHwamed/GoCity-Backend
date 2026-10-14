import { Body, Controller, Get, HttpCode, HttpStatus, Patch, Post } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { MessageResponseDto } from '../../common/dto/message-response.dto';
import { ChangePasswordDto } from '../users/dto/change-password.dto';
import { User } from '../users/entities/user.entity';
import { UsersService } from '../users/users.service';
import { AuthService } from './auth.service';
import { CurrentUser, Public } from './decorators';
import { Client } from './decorators/client-info.decorator';
import { ClientInfo } from './tokens.service';
import {
  AuthResponseDto,
  ForgotPasswordDto,
  LoginDto,
  RefreshTokenDto,
  RegisterDto,
  ResetPasswordDto,
  VerifyOtpDto,
  VerifyOtpResponseDto,
} from './dto';
import { ResponseTitle } from '../../common/response/api-response';

@ApiTags('Auth')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly usersService: UsersService,
  ) {}

  @Public()
  @Post('register')
  @ApiOperation({ summary: 'Sign up as a user' })
  @ApiCreatedResponse({ type: MessageResponseDto })
  @ApiConflictResponse({ description: 'Email already registered' })
  @ResponseTitle('Verification code sent')
  register(@Body() dto: RegisterDto): Promise<MessageResponseDto> {
    return this.authService.register(dto);
  }

  @Public()
  @Post('verify-registration')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Verify an email address and activate the new account' })
  @ApiOkResponse({ type: AuthResponseDto })
  @ApiBadRequestResponse({ description: 'Invalid, expired or locked verification code' })
  @ResponseTitle('Email verified')
  verifyRegistration(
    @Body() dto: VerifyOtpDto,
    @Client() client: ClientInfo,
  ): Promise<AuthResponseDto> {
    return this.authService.verifyRegistration(dto, client);
  }

  @Public()
  @Post('login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Log in with email and password' })
  @ApiOkResponse({ type: AuthResponseDto })
  @ApiUnauthorizedResponse({ description: 'Invalid email or password' })
  @ResponseTitle('Login successful')
  login(@Body() dto: LoginDto, @Client() client: ClientInfo): Promise<AuthResponseDto> {
    return this.authService.login(dto, client);
  }

  @Public()
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Get a new access token with your refresh token',
    description:
      'Call this when a request returns 401 because the access token expired. Returns a new ' +
      'access token AND a new refresh token; the old refresh token stops working, so save the ' +
      'new one. Using an old refresh token again logs that login out everywhere.',
  })
  @ApiOkResponse({ type: AuthResponseDto })
  @ApiUnauthorizedResponse({ description: 'Invalid, expired, reused or revoked refresh token' })
  @ResponseTitle('Token refreshed')
  refresh(@Body() dto: RefreshTokenDto, @Client() client: ClientInfo): Promise<AuthResponseDto> {
    return this.authService.refresh(dto.refreshToken, client);
  }

  @Public()
  @Post('logout')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Log out this device',
    description: 'Revokes the given refresh token. Works even if the access token has expired.',
  })
  @ApiOkResponse({ description: 'response_body is null' })
  @ResponseTitle('Logged out')
  logout(@Body() dto: RefreshTokenDto): Promise<void> {
    return this.authService.logout(dto.refreshToken);
  }

  @Post('logout-all')
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Log out all my devices (revokes every refresh token)' })
  @ApiOkResponse({ description: 'response_body is null' })
  @ResponseTitle('Logged out everywhere')
  logoutAll(@CurrentUser('id') userId: number): Promise<void> {
    return this.authService.logoutAll(userId);
  }

  @Get('me')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get the logged-in user' })
  @ApiOkResponse({ type: User })
  @ResponseTitle('Current user fetched')
  me(@CurrentUser('id') userId: number): Promise<User> {
    return this.usersService.findOne(userId);
  }

  @Patch('change-password')
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Change my password',
    description:
      'Returns a new token pair. All other sessions end: older access tokens stop working and ' +
      'every refresh token is revoked.',
  })
  @ApiOkResponse({ type: AuthResponseDto })
  @ApiBadRequestResponse({ description: 'Current password is incorrect' })
  @ResponseTitle('Password changed')
  changePassword(
    @CurrentUser('id') userId: number,
    @Body() dto: ChangePasswordDto,
    @Client() client: ClientInfo,
  ): Promise<AuthResponseDto> {
    return this.authService.changePassword(userId, dto, client);
  }

  @Public()
  @Post('forgot-password')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Reset step 1: email a 6-digit code' })
  @ApiOkResponse({ type: MessageResponseDto })
  @ResponseTitle('Verification code sent')
  forgotPassword(@Body() dto: ForgotPasswordDto): Promise<MessageResponseDto> {
    return this.authService.forgotPassword(dto.email);
  }

  @Public()
  @Post('verify-otp')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Reset step 2: verify the code and get a reset token' })
  @ApiOkResponse({ type: VerifyOtpResponseDto })
  @ApiBadRequestResponse({ description: 'Invalid or expired code, or too many attempts' })
  @ResponseTitle('Code verified')
  verifyOtp(@Body() dto: VerifyOtpDto): Promise<VerifyOtpResponseDto> {
    return this.authService.verifyOtp(dto);
  }

  @Public()
  @Post('reset-password')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Reset step 3: set a new password with the reset token' })
  @ApiOkResponse({ type: MessageResponseDto })
  @ApiBadRequestResponse({ description: 'Invalid or expired reset token' })
  @ResponseTitle('Password reset')
  resetPassword(@Body() dto: ResetPasswordDto): Promise<MessageResponseDto> {
    return this.authService.resetPassword(dto);
  }
}
