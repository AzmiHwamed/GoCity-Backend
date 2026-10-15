import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class CreateInterestDto {
  @ApiProperty({ example: 'Local food' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(40)
  name: string;
}

export class UpdateInterestDto extends CreateInterestDto {}
