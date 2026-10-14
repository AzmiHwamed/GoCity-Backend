import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEmail,
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsPhoneNumber,
  IsString,
  MaxLength,
  ValidateIf,
} from 'class-validator';
import { IsStrongPassword, ToLowerTrim } from '../../../common/validators';
import { UserRole } from '../entities/user.entity';

export class CreateUserDto {
  @ApiProperty({ example: 'Jane' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  firstName: string;

  @ApiProperty({ example: 'Doe' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  lastName: string;

  @ApiProperty({ example: 'jane@example.com' })
  @IsEmail()
  @ToLowerTrim()
  email: string;

  @ApiProperty({ example: 'Str0ngPass!', minLength: 8 })
  @IsStrongPassword()
  password: string;

  @ApiPropertyOptional({ enum: UserRole, default: UserRole.USER })
  @IsOptional()
  @IsEnum(UserRole)
  role?: UserRole;

  @ApiPropertyOptional({
    example: 'Acme Tours',
    description: 'Required when role is "organization"',
  })
  @ValidateIf((o: CreateUserDto) => o.role === UserRole.ORGANIZATION)
  @IsString()
  @IsNotEmpty()
  @MaxLength(150)
  organizationName?: string;

  @ApiPropertyOptional({ example: '+447911123456' })
  @IsOptional()
  @IsPhoneNumber()
  phone?: string;
}
