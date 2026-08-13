import {
  Controller,
  Get,
  Header,
  HttpCode,
  HttpStatus,
  Param,
  ParseIntPipe,
  Post,
  Res,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Response } from 'express';
import { Role } from '../generated/prisma/enums';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AuthenticatedUser } from '../common/types/authenticated-user';
import { ReportsService } from './reports.service';

@ApiTags('reports')
@ApiBearerAuth()
@Roles(Role.ADMIN, Role.TESOUREIRO)
@Controller('reports')
export class ReportsController {
  constructor(private readonly reportsService: ReportsService) {}

  @Get('monthly/:ano/:mes')
  @ApiOperation({
    summary:
      'Balanço mensal calculado em tempo real (saldo inicial/final, entradas, saídas, por categoria)',
  })
  getMonthly(
    @Param('ano', ParseIntPipe) ano: number,
    @Param('mes', ParseIntPipe) mes: number,
  ) {
    return this.reportsService.getMonthly(ano, mes);
  }

  @Post('monthly/:ano/:mes/pdf')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Gera (ou sobrescreve) o PDF do balanço mensal e persiste em FinancialReport',
  })
  generatePdf(
    @Param('ano', ParseIntPipe) ano: number,
    @Param('mes', ParseIntPipe) mes: number,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.reportsService.generatePdf(ano, mes, user);
  }

  @Get('monthly/:ano/:mes/pdf')
  @Header('Content-Type', 'application/pdf')
  @ApiOperation({ summary: 'Baixa o PDF do balanço mensal já gerado' })
  async getPdf(
    @Param('ano', ParseIntPipe) ano: number,
    @Param('mes', ParseIntPipe) mes: number,
    @Res() res: Response,
  ) {
    const buffer = await this.reportsService.getPdf(ano, mes);
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="balanco-${ano}-${String(mes).padStart(2, '0')}.pdf"`,
    );
    res.setHeader('Content-Length', buffer.length);
    res.end(buffer);
  }
}
