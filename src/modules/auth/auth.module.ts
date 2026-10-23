import { CacheModule } from '@nestjs/cache-manager';
import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthConfig } from '../../config/auth.config';
import { MailModule } from '../mail/mail.module';
import { UsersModule } from '../users/users.module';
import { LegalModule } from '../legal/legal.module';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { RefreshToken } from './entities/refresh-token.entity';
import { JwtStrategy } from './strategies/jwt.strategy';
import { TokensService } from './tokens.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([RefreshToken]),
    UsersModule,
    LegalModule,
    MailModule,
    PassportModule,
    // In-memory store: OTPs and reset tokens are lost on restart and not shared between
    // instances. Swap in a Redis store for production deployments with more than one instance.
    CacheModule.register(),
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const auth = config.getOrThrow<AuthConfig>('auth');
        return { secret: auth.jwtSecret, signOptions: { expiresIn: auth.jwtExpiresIn } };
      },
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService, TokensService, JwtStrategy],
})
export class AuthModule {}
