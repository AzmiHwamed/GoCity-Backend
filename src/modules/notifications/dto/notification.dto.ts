import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

export class RegisterDeviceDto {
  @ApiProperty() @IsString() @IsNotEmpty() token: string;
  @ApiPropertyOptional({ enum: ['web'] }) @IsOptional() @IsIn(['web']) platform?: 'web';
}

export class CreateNotificationDto {
  @IsString() @MaxLength(150) title: string;
  @IsString() body: string;
  @IsString() @MaxLength(50) type: string;
  @IsOptional() data?: Record<string, string>;
}
