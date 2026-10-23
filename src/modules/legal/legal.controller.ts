import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  PipeTransform,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
} from '@nestjs/swagger';
import { ResponseTitle } from '../../common/response/api-response';
import { CurrentUser, Public, Roles } from '../auth/decorators';
import { UserRole } from '../users/entities/user.entity';
import {
  AcceptLegalDto,
  LegalStatusDto,
  LegalVersionDto,
  PublishLegalDto,
  UpdateLegalDto,
} from './dto';
import { LEGAL_SLUGS, LegalDocument, LegalType } from './entities/legal-document.entity';
import { LegalService } from './legal.service';

/** Accepts the URL slugs (privacy-policy, terms) and the enum values. */
class LegalTypePipe implements PipeTransform<string, LegalType> {
  transform(value: string): LegalType {
    const type = LEGAL_SLUGS[value] ?? Object.values(LegalType).find((t) => t === value);
    if (!type) throw new BadRequestException('type must be privacy-policy or terms');
    return type;
  }
}
const TYPE_PARAM = { name: 'type', enum: ['privacy-policy', 'terms'] };

@ApiTags('Legal')
@Controller('legal')
export class LegalController {
  constructor(private readonly legal: LegalService) {}

  @Public()
  @Get('privacy-policy')
  @ApiOperation({ summary: 'Current privacy policy (Markdown)' })
  @ApiOkResponse({ type: LegalDocument })
  @ResponseTitle('Privacy policy fetched')
  privacy(@Query('lang') lang?: 'en' | 'fr' | 'ar'): Promise<LegalDocument> {
    return this.legal.current(LegalType.PRIVACY_POLICY, lang ?? 'en');
  }

  @Public()
  @Get('terms')
  @ApiOperation({ summary: 'Current terms of use (Markdown)' })
  @ApiOkResponse({ type: LegalDocument })
  @ResponseTitle('Terms of use fetched')
  terms(@Query('lang') lang?: 'en' | 'fr' | 'ar'): Promise<LegalDocument> {
    return this.legal.current(LegalType.TERMS_OF_USE, lang ?? 'en');
  }

  @Get('status')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Which versions I accepted, and whether a newer one needs accepting' })
  @ApiOkResponse({ type: LegalStatusDto })
  @ResponseTitle('Legal status fetched')
  status(@CurrentUser('id') userId: number): Promise<LegalStatusDto> {
    return this.legal.status(userId);
  }

  // Declared before POST :type so "accept" is not read as a type.
  @Post('accept')
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Accept the current terms and/or privacy policy',
    description: 'Records the current version and the time. Without `types`, accepts both.',
  })
  @ApiOkResponse({ type: LegalStatusDto })
  @ResponseTitle('Accepted')
  accept(@CurrentUser('id') userId: number, @Body() dto: AcceptLegalDto): Promise<LegalStatusDto> {
    return this.legal.accept(userId, dto.types);
  }

  @Public()
  @Get(':type/versions')
  @ApiParam(TYPE_PARAM)
  @ApiOperation({ summary: 'Version history, newest first (without content)' })
  @ApiOkResponse({ type: [LegalVersionDto] })
  @ResponseTitle('Versions fetched')
  versions(@Param('type', LegalTypePipe) type: LegalType): Promise<LegalVersionDto[]> {
    return this.legal.versions(type);
  }

  @Public()
  @Get(':type/versions/:version')
  @ApiParam(TYPE_PARAM)
  @ApiOperation({ summary: 'One past or current version' })
  @ApiOkResponse({ type: LegalDocument })
  @ResponseTitle('Version fetched')
  version(
    @Param('type', LegalTypePipe) type: LegalType,
    @Param('version') version: string,
  ): Promise<LegalDocument> {
    return this.legal.version(type, version);
  }

  @Post(':type')
  @Roles(UserRole.ADMIN)
  @ApiBearerAuth()
  @ApiParam(TYPE_PARAM)
  @ApiOperation({
    summary: 'Publish a new version (admin)',
    description: 'It becomes the current version immediately; users are asked to accept it.',
  })
  @ApiCreatedResponse({ type: LegalDocument })
  @ApiConflictResponse({ description: 'That version already exists' })
  @ResponseTitle('New version published')
  publish(
    @Param('type', LegalTypePipe) type: LegalType,
    @Body() dto: PublishLegalDto,
  ): Promise<LegalDocument> {
    return this.legal.publish(type, dto);
  }

  @Patch(':type')
  @Roles(UserRole.ADMIN)
  @ApiBearerAuth()
  @ApiParam(TYPE_PARAM)
  @ApiOperation({
    summary: 'Edit the current version (admin)',
    description:
      'Changes title, content and/or effectiveDate in place. The version number stays, so users ' +
      'are not asked to accept again. Publish a new version for changes users must accept.',
  })
  @ApiOkResponse({ type: LegalDocument })
  @ApiForbiddenResponse({ description: 'Admins only' })
  @ResponseTitle('Document updated')
  updateCurrent(
    @Param('type', LegalTypePipe) type: LegalType,
    @Body() dto: UpdateLegalDto,
  ): Promise<LegalDocument> {
    return this.legal.update(type, null, dto);
  }

  @Patch(':type/versions/:version')
  @Roles(UserRole.ADMIN)
  @ApiBearerAuth()
  @ApiParam(TYPE_PARAM)
  @ApiOperation({ summary: 'Edit any version in place (admin)' })
  @ApiOkResponse({ type: LegalDocument })
  @ApiForbiddenResponse({ description: 'Admins only' })
  @ResponseTitle('Version updated')
  updateVersion(
    @Param('type', LegalTypePipe) type: LegalType,
    @Param('version') version: string,
    @Body() dto: UpdateLegalDto,
  ): Promise<LegalDocument> {
    return this.legal.update(type, version, dto);
  }

  @Put(':type/versions/:version/current')
  @Roles(UserRole.ADMIN)
  @ApiBearerAuth()
  @ApiParam(TYPE_PARAM)
  @ApiOperation({
    summary: 'Make a version the current one, e.g. to roll back (admin)',
    description: 'Users who accepted another version are asked to accept again.',
  })
  @ApiOkResponse({ type: LegalDocument })
  @ApiForbiddenResponse({ description: 'Admins only' })
  @ResponseTitle('Current version changed')
  makeCurrent(
    @Param('type', LegalTypePipe) type: LegalType,
    @Param('version') version: string,
  ): Promise<LegalDocument> {
    return this.legal.makeCurrent(type, version);
  }

  @Delete(':type/versions/:version')
  @Roles(UserRole.ADMIN)
  @ApiBearerAuth()
  @ApiParam(TYPE_PARAM)
  @ApiOperation({ summary: 'Delete an old version (admin; not the current one)' })
  @ApiOkResponse({ description: 'response_body is null' })
  @ApiForbiddenResponse({ description: 'Admins only' })
  @ResponseTitle('Version deleted')
  removeVersion(
    @Param('type', LegalTypePipe) type: LegalType,
    @Param('version') version: string,
  ): Promise<void> {
    return this.legal.removeVersion(type, version);
  }
}
