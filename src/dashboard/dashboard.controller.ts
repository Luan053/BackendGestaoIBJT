import { Controller, Get } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Role } from '../generated/prisma/enums';
import { Roles } from '../common/decorators/roles.decorator';
import { DashboardService } from './dashboard.service';

@ApiTags('dashboard')
@ApiBearerAuth()
@Roles(Role.ADMIN, Role.TESOUREIRO)
@Controller('dashboard')
export class DashboardController {
  constructor(private readonly dashboardService: DashboardService) {}

  @Get('stats')
  @ApiOperation({
    summary:
      'Totais: membros ativos, entradas da semana, despesas do mês e células ativas',
  })
  stats() {
    return this.dashboardService.stats();
  }
}