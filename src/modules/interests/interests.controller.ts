import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, ParseIntPipe, Patch, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiCreatedResponse, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ResponseTitle } from '../../common/response/api-response';
import { Roles } from '../auth/decorators';
import { UserRole } from '../users/entities/user.entity';
import { CreateInterestDto, UpdateInterestDto } from './dto/interest.dto';
import { Interest } from './entities/interest.entity';
import { InterestsService } from './interests.service';

@ApiTags('Interests')
@ApiBearerAuth()
@Controller('interests')
export class InterestsController {
  constructor(private readonly interests: InterestsService) {}

  @Get()
  @ApiOperation({ summary: 'List global interests' })
  @ApiOkResponse({ type: [Interest] })
  @ResponseTitle('Interests fetched')
  findAll(): Promise<Interest[]> { return this.interests.findAll(); }

  @Post()
  @Roles(UserRole.ADMIN)
  @ApiCreatedResponse({ type: Interest })
  @ResponseTitle('Interest created')
  create(@Body() dto: CreateInterestDto): Promise<Interest> { return this.interests.create(dto); }

  @Patch(':id')
  @Roles(UserRole.ADMIN)
  @ApiOkResponse({ type: Interest })
  @ResponseTitle('Interest updated')
  update(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateInterestDto): Promise<Interest> { return this.interests.update(id, dto); }

  @Delete(':id')
  @Roles(UserRole.ADMIN)
  @HttpCode(HttpStatus.OK)
  @ResponseTitle('Interest deleted')
  remove(@Param('id', ParseIntPipe) id: number): Promise<void> { return this.interests.remove(id); }
}
