import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  UploadedFiles,
  UseInterceptors,
} from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import {
  ApiBearerAuth,
  ApiConsumes,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { ResponseTitle } from '../../common/response/api-response';
import { CurrentUser, Roles } from '../auth/decorators';
import { UserRole } from '../users/entities/user.entity';
import {
  ApplyProgramDto,
  CreateOrganizationProgramDto,
  SetProgramCoverDto,
  UpdateOrganizationProgramDto,
} from './dto/organization-program.dto';
import { OrganizationProgram } from './entities/organization-program.entity';
import { OrganizationsService } from './organizations.service';

@ApiTags('Organization programs')
@ApiBearerAuth()
@Controller('organizations')
export class OrganizationsController {
  constructor(private readonly organizations: OrganizationsService) {}

  @Get('programs')
  @Roles(UserRole.ORGANIZATION)
  @ApiOperation({ summary: 'List this organization’s programs' })
  mine(@CurrentUser('id') id: number) {
    return this.organizations.findMine(id);
  }

  @Get('analytics')
  @Roles(UserRole.ORGANIZATION)
  @ApiOperation({ summary: 'Get program and adoption analytics for this organization' })
  analytics(@CurrentUser('id') id: number) {
    return this.organizations.analytics(id);
  }

  @Post('programs')
  @Roles(UserRole.ORGANIZATION)
  @ApiCreatedResponse({ type: OrganizationProgram })
  @ResponseTitle('Program created')
  create(@CurrentUser('id') id: number, @Body() dto: CreateOrganizationProgramDto) {
    return this.organizations.create(id, dto);
  }

  @Post('programs/:id/images')
  @Roles(UserRole.ORGANIZATION)
  @UseInterceptors(FilesInterceptor('images', 10))
  @ApiConsumes('multipart/form-data')
  @ApiOperation({ summary: 'Add images to an organization program' })
  addImages(
    @Param('id', ParseIntPipe) programId: number,
    @CurrentUser('id') organizationId: number,
    @UploadedFiles() images?: Express.Multer.File[],
  ) {
    return this.organizations.addProgramImages(programId, organizationId, images ?? []);
  }

  @Delete('programs/:id/images/:imageId')
  @Roles(UserRole.ORGANIZATION)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Remove one image from an organization program' })
  @ResponseTitle('Image removed')
  removeImage(
    @Param('id', ParseIntPipe) programId: number,
    @Param('imageId', ParseIntPipe) imageId: number,
    @CurrentUser('id') organizationId: number,
  ) {
    return this.organizations.removeProgramImage(programId, organizationId, imageId);
  }

  @Patch('programs/:id/cover')
  @Roles(UserRole.ORGANIZATION)
  @ApiOperation({ summary: 'Choose which program image is shown first' })
  @ResponseTitle('Cover image updated')
  setCover(
    @Param('id', ParseIntPipe) programId: number,
    @CurrentUser('id') organizationId: number,
    @Body() dto: SetProgramCoverDto,
  ) {
    return this.organizations.setProgramCover(programId, organizationId, dto.imageId);
  }

  @Patch('programs/:id')
  @Roles(UserRole.ORGANIZATION)
  @ApiOkResponse({ type: OrganizationProgram })
  @ResponseTitle('Program updated')
  update(
    @Param('id', ParseIntPipe) programId: number,
    @CurrentUser('id') id: number,
    @Body() dto: UpdateOrganizationProgramDto,
  ) {
    return this.organizations.update(programId, id, dto);
  }

  @Delete('programs/:id')
  @Roles(UserRole.ORGANIZATION)
  @HttpCode(HttpStatus.OK)
  @ResponseTitle('Program deleted')
  remove(@Param('id', ParseIntPipe) programId: number, @CurrentUser('id') id: number) {
    return this.organizations.remove(programId, id);
  }
}

@ApiTags('Organizations')
@ApiBearerAuth()
@Controller('organization-profiles')
export class OrganizationProfilesController {
  constructor(private readonly organizations: OrganizationsService) {}
  @Get() browse() {
    return this.organizations.browseOrganizations();
  }
  @Get(':id') profile(@Param('id', ParseIntPipe) id: number) {
    return this.organizations.organizationProfile(id);
  }
}

@ApiTags('Organization programs')
@ApiBearerAuth()
@Controller('programs')
export class PublicProgramsController {
  constructor(private readonly organizations: OrganizationsService) {}
  @Get()
  @ApiOperation({ summary: 'Browse published organization programs' })
  published() {
    return this.organizations.findPublished();
  }
  @Get(':id')
  @ApiOkResponse({ type: OrganizationProgram })
  one(@Param('id', ParseIntPipe) id: number, @CurrentUser('id') userId?: number) {
    return this.organizations.findOne(id, userId);
  }
  @Post(':id/apply')
  @ApiCreatedResponse({ type: [Object] })
  @ResponseTitle('Program added to trip')
  apply(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser('id') userId: number,
    @Body() dto: ApplyProgramDto,
  ) {
    return this.organizations.apply(
      id,
      userId,
      dto.targetTripId,
      dto.startDay,
      dto.startTime,
      dto.endTime,
    );
  }
}
