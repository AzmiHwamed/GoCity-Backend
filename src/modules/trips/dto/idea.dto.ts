import { ApiProperty } from '@nestjs/swagger';
import { IsEnum } from 'class-validator';
import { VoteValue } from '../trip.enums';
import { ActivityDetailsDto } from './activity.dto';

export class CreateIdeaDto extends ActivityDetailsDto {}

export class VoteDto {
  @ApiProperty({ enum: VoteValue, example: VoteValue.YES })
  @IsEnum(VoteValue)
  value: VoteValue;
}
