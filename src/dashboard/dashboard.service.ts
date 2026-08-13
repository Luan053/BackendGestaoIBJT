import { Injectable } from '@nestjs/common';
import { Prisma } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class DashboardService {
  constructor(private readonly prisma: PrismaService) {}

  async stats() {
    const now = new Date();
    const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    // Semana: últimos 7 dias
    const weekStart = new Date(startOfDay.getTime() - 6 * 24 * 60 * 60 * 1000);

    // Mês corrente
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const nextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1);

    const [membrosAtivos, entradasSemana, saidasMes, celulasAtivas] =
      await this.prisma.$transaction([
        this.prisma.member.count({ where: { status: 'ATIVO' } }),
        this.prisma.transaction.aggregate({
          where: {
            tipo: 'ENTRADA',
            data: { gte: weekStart, lt: new Date(startOfDay.getTime() + 24 * 60 * 60 * 1000) },
          },
          _sum: { valor: true },
        }),
        this.prisma.transaction.aggregate({
          where: {
            tipo: 'SAIDA',
            data: { gte: monthStart, lt: nextMonth },
          },
          _sum: { valor: true },
        }),
        this.prisma.cell.count({
          where: { membros: { some: {} } },
        }),
      ]);

    return {
      membrosAtivos,
      entradasDaSemana: Number(entradasSemana._sum.valor ?? new Prisma.Decimal(0)),
      despesasDoMes: Number(saidasMes._sum.valor ?? new Prisma.Decimal(0)),
      celulasAtivas: celulasAtivas,
      geradoEm: now,
    };
  }
}