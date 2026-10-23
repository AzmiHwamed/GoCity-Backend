import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsInt, IsOptional, IsString, MaxLength, Min, MinLength } from 'class-validator';

export class CreateTripMessageDto {
  @ApiProperty({ maxLength: 2000, example: 'Should we book the 10am museum slot?' })
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(2000)
  content?: string;

  @ApiPropertyOptional({ description: 'A trip card shared into the conversation' })
  @IsOptional() @IsInt() @Min(1)
  sharedTripId?: number;

  @ApiPropertyOptional({ description: 'An existing activity from this trip to suggest to the group' })
  @IsOptional() @IsInt() @Min(1)
  sharedActivityId?: number;

  @ApiPropertyOptional({ description: 'An existing idea from this trip to share in chat' })
  @IsOptional() @IsInt() @Min(1)
  sharedIdeaId?: number;
}
