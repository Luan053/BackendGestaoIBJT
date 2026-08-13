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
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Role } from '../generated/prisma/enums';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AuthenticatedUser } from '../common/types/authenticated-user';
import { CellsService } from './cells.service';
import { CreateCellDto } from './dto/create-cell.dto';
import { UpdateCellDto } from './dto/update-cell.dto';

@ApiTags('cells')
@ApiBearerAuth()
@Controller('cells')
export class CellsController {
  constructor(private readonly cellsService: CellsService) {}

  @Get()
  @Roles(Role.ADMIN, Role.TESOUREIRO, Role.LIDER_CELULA)
  @ApiOperation({
    summary:
      'Lista células com contagem de membros (LIDER_CELULA vê apenas as suas)',
  })
  findAll(@CurrentUser() user: AuthenticatedUser) {
    return this.cellsService.findAll(user);
  }

  @Get(':id')
  @Roles(Role.ADMIN, Role.TESOUREIRO, Role.LIDER_CELULA)
  @ApiOperation({
    summary: 'Busca uma célula com a lista de membros',
  })
  findOne(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.cellsService.findOne(user, id);
  }

  @Post()
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Cria uma célula (ADMIN)' })
  create(@Body() dto: CreateCellDto) {
    return this.cellsService.create(dto);
  }

  @Patch(':id')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Atualiza uma célula (ADMIN)' })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateCellDto,
  ) {
    return this.cellsService.update(id, dto);
  }

  @Delete(':id')
  @Roles(Role.ADMIN)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Remove uma célula — membros vinculados ficam com cellId null (ADMIN)',
  })
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.cellsService.remove(id);
  }
}