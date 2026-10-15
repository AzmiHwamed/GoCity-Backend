import { ApiPropertyOptional, PartialType, PickType } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { ArrayMaxSize, IsArray, IsInt, IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';
import { CreateUserDto } from './create-user.dto';

/** Fields a user may change on their own account (email, role and password are not here). */
export class UpdateProfileDto extends PartialType(
  PickType(CreateUserDto, ['firstName', 'lastName', 'phone'] as const),
) {
  @ApiPropertyOptional({ example: 'Acme Tours', description: 'Only applied for organizations' })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(150)
  organizationName?: string;

  @ApiPropertyOptional({ example: 'I enjoy finding local food and quiet walks.' })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  aboutMe?: string;

  @ApiPropertyOptional({ type: [Number], example: [1, 4, 7] })
  @IsOptional()
  @Transform(({ value }) => {
    if (Array.isArray(value)) return value;
    if (typeof value !== 'string') return value;
    try { return JSON.parse(value); } catch { return value.split(',').map(Number).filter(Number.isInteger); }
  })
  @IsArray()
  @ArrayMaxSize(12)
  @IsInt({ each: true })
  interests?: number[];
}
