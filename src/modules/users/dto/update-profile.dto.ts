import { ApiPropertyOptional, PartialType, PickType } from '@nestjs/swagger';
import { IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';
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
}
