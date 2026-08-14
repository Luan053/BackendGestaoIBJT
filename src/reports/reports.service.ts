import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '../generated/prisma/client';
import {
  TransactionCategory,
  TransactionType,
} from '../generated/prisma/enums';
import { PrismaService } from '../prisma/prisma.service';
import type { AuthenticatedUser } from '../common/types/authenticated-user';
import {
  STORAGE_PROVIDER,
  type StorageProvider,
} from './storage/storage-provider.interface';
import { ReportPdfService, PdfReportData } from './pdf/report-pdf.service';

export interface MonthlyBalance {
  mes: number;
  ano: number;
  saldoInicial: number;
  totalEntradas: number;
  totalSaidas: number;
  saldoFinal: number;
  porCategoria: {
    categoria: TransactionCategory;
    total: number;
    transacoes: {
      id: string;
      data: Date;
      tipo: TransactionType;
      descricao: string | null;
      membro: string | null;
      valor: number;
    }[];
  }[];
  pdfUrl?: string | null;
  reportId?: string | null;
}

const CATEGORIAS: TransactionCategory[] = [
  TransactionCategory.DIZIMO,
  TransactionCategory.OFERTA,
  TransactionCategory.EVENTO,
  TransactionCategory.CONTAS,
  TransactionCategory.MANUTENCAO,
  TransactionCategory.OUTROS,
];

@Injectable()
export class ReportsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly pdfService: ReportPdfService,
    @Inject(STORAGE_PROVIDER) private readonly storage: StorageProvider,
    private readonly config: ConfigService,
  ) {}

  private validatePeriodo(ano: number, mes: number) {
    if (mes < 1 || mes > 12) {
      throw new NotFoundException('Mês inválido (1 a 12).');
    }
  }

  private monthRange(ano: number, mes: number): { start: Date; end: Date } {
    return {
      start: new Date(ano, mes - 1, 1),
      end: new Date(ano, mes, 1),
    };
  }

  async getMonthly(ano: number, mes: number): Promise<MonthlyBalance> {
    this.validatePeriodo(ano, mes);
    const { start, end } = this.monthRange(ano, mes);

    const [saldoAnterior, entradas, saidas, transacoes, report] =
      await this.prisma.$transaction([
        this.prisma.transaction.aggregate({
          where: { data: { lt: start } },
          _sum: { valor: true },
          _count: true,
        }),
        this.prisma.transaction.aggregate({
          where: {
            tipo: TransactionType.ENTRADA,
            data: { gte: start, lt: end },
          },
          _sum: { valor: true },
        }),
        this.prisma.transaction.aggregate({
          where: {
            tipo: TransactionType.SAIDA,
            data: { gte: start, lt: end },
          },
          _sum: { valor: true },
        }),
        this.prisma.transaction.findMany({
          where: { data: { gte: start, lt: end } },
          include: { membro: { select: { id: true, nome: true } } },
          orderBy: { data: 'asc' },
        }),
        this.prisma.financialReport.findUnique({
          where: { mes_ano: { mes, ano } },
        }),
      ]);

    const saldoInicial = this.saldoFromAggregate(saldoAnterior._sum.valor);
    const totalEntradas = Number(entradas._sum.valor ?? 0);
    const totalSaidas = Number(saidas._sum.valor ?? 0);
    const saldoFinal = saldoInicial + totalEntradas - totalSaidas;

    const porCategoria = CATEGORIAS.map((categoria) => {
      const daCategoria = transacoes.filter((t) => t.categoria === categoria);
      return {
        categoria,
        total: daCategoria.reduce(
          (acc, t) =>
            acc +
            (t.tipo === TransactionType.ENTRADA
              ? t.valor.toNumber()
              : -t.valor.toNumber()),
          0,
        ),
        transacoes: daCategoria.map((t) => ({
          id: t.id,
          data: t.data,
          tipo: t.tipo,
          descricao: t.descricao,
          membro: t.membro?.nome ?? null,
          valor: t.valor.toNumber(),
        })),
      };
    });

    return {
      mes,
      ano,
      saldoInicial,
      totalEntradas,
      totalSaidas,
      saldoFinal,
      porCategoria,
      pdfUrl: report?.pdfUrl ?? null,
      reportId: report?.id ?? null,
    };
  }

  async generatePdf(
    ano: number,
    mes: number,
    user: AuthenticatedUser,
  ): Promise<{ reportId: string; pdfUrl: string }> {
    this.validatePeriodo(ano, mes);
    const balance = await this.getMonthly(ano, mes);

    const data: PdfReportData = {
      periodo: `${String(mes).padStart(2, '0')}/${ano}`,
      ano,
      mes,
      saldoInicial: balance.saldoInicial,
      totalEntradas: balance.totalEntradas,
      totalSaidas: balance.totalSaidas,
      saldoFinal: balance.saldoFinal,
      porCategoria: balance.porCategoria,
      geradoEm: new Date(),
    };

    const buffer = await this.pdfService.generate(data);

    const key = `monthly/${ano}/${String(mes).padStart(2, '0')}/balanco.pdf`;
    const publicUrl = `${this.config.get<string>(
      'PUBLIC_BASE_URL',
      'http://localhost:3000',
    )}/reports/monthly/${ano}/${mes}/pdf`;

    const pdfUrl = await this.storage.save(
      key,
      buffer,
      'application/pdf',
      publicUrl,
    );

    // Upsert: o @@unique([mes, ano]) garante sobrescrita em vez de duplicado
    const report = await this.prisma.financialReport.upsert({
      where: { mes_ano: { mes, ano } },
      update: {
        saldoInicial: new Prisma.Decimal(balance.saldoInicial),
        totalEntradas: new Prisma.Decimal(balance.totalEntradas),
        totalSaidas: new Prisma.Decimal(balance.totalSaidas),
        saldoFinal: new Prisma.Decimal(balance.saldoFinal),
        pdfUrl,
        geradoPorId: user.id,
        geradoEm: new Date(),
      },
      create: {
        mes,
        ano,
        saldoInicial: new Prisma.Decimal(balance.saldoInicial),
        totalEntradas: new Prisma.Decimal(balance.totalEntradas),
        totalSaidas: new Prisma.Decimal(balance.totalSaidas),
        saldoFinal: new Prisma.Decimal(balance.saldoFinal),
        pdfUrl,
        geradoPorId: user.id,
      },
    });

    return { reportId: report.id, pdfUrl };
  }

  async getPdf(ano: number, mes: number): Promise<Buffer> {
    this.validatePeriodo(ano, mes);

    const report = await this.prisma.financialReport.findUnique({
      where: { mes_ano: { mes, ano } },
    });

    if (!report?.pdfUrl) {
      throw new NotFoundException(
        'Relatório PDF ainda não foi gerado para este mês.',
      );
    }

    const key = `monthly/${ano}/${String(mes).padStart(2, '0')}/balanco.pdf`;
    if (!(await this.storage.exists(key))) {
      throw new NotFoundException(
        'Arquivo PDF não encontrado no armazenamento.',
      );
    }

    return this.storage.read(key);
  }

  private saldoFromAggregate(valor: Prisma.Decimal | null): number {
    return Number(valor ?? 0);
  }
}
