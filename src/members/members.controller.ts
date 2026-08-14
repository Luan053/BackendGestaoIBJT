import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
import { Role } from '../generated/prisma/enums';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../common/types/authenticated-user';
import { MembersService } from './members.service';
import { CreateMemberDto } from './dto/create-member.dto';
import { UpdateMemberDto } from './dto/update-member.dto';
import { QueryMemberDto } from './dto/query-member.dto';

@ApiTags('members')
@ApiBearerAuth()
@Controller('members')
export class MembersController {
  constructor(private readonly membersService: MembersService) {}

  @Get()
  @Roles(Role.ADMIN, Role.TESOUREIRO, Role.LIDER_CELULA)
  @ApiOperation({ summary: 'Lista membros (filtros + paginação)' })
  @ApiQuery({ name: 'nome', required: false })
  @ApiQuery({ name: 'status', required: false, enum: ['ATIVO', 'INATIVO'] })
  @ApiQuery({ name: 'cellId', required: false })
  @ApiQuery({ name: 'page', required: false, example: 1 })
  @ApiQuery({ name: 'limit', required: false, example: 10 })
  findAll(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: QueryMemberDto,
  ) {
    return this.membersService.findAll(user, query);
  }

  @Get(':id')
  @Roles(Role.ADMIN, Role.TESOUREIRO, Role.LIDER_CELULA)
  @ApiOperation({ summary: 'Busca um membro pelo id' })
  findOne(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.membersService.findOne(user, id);
  }

  @Post()
  @Roles(Role.ADMIN, Role.LIDER_CELULA)
  @ApiOperation({
    summary: 'Cria um membro (ADMIN ou LIDER_CELULA na própria célula)',
  })
  create(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateMemberDto) {
    return this.membersService.create(user, dto);
  }

  @Patch(':id')
  @Roles(Role.ADMIN, Role.LIDER_CELULA)
  @ApiOperation({
    summary: 'Atualiza um membro (ADMIN ou LIDER_CELULA da própria célula)',
  })
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateMemberDto,
  ) {
    return this.membersService.update(user, id, dto);
  }

  @Delete(':id')
  @Roles(Role.ADMIN, Role.LIDER_CELULA)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Exclui o membro permanentemente (ADMIN ou líder da célula)',
  })
  remove(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.membersService.remove(user, id);
  }

  @Get(':id/export')
  @Roles(Role.ADMIN, Role.TESOUREIRO)
  @ApiOperation({
    summary: 'LGPD — exporta todos os dados pessoais de um membro',
  })
  exportData(@Param('id', ParseUUIDPipe) id: string) {
    return this.membersService.exportData(id);
  }

  @Post(':id/anonymize')
  @Roles(Role.ADMIN)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'LGPD — anonimiza os dados pessoais de um membro (irreversível)',
  })
  anonymize(@Param('id', ParseUUIDPipe) id: string) {
    return this.membersService.anonymize(id);
  }
}
