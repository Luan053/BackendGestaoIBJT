import { Test } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '../generated/prisma/client';
import {
  TransactionCategory,
  TransactionType,
} from '../generated/prisma/enums';
import { PrismaService } from '../prisma/prisma.service';
import { ReportsService } from './reports.service';
import { STORAGE_PROVIDER } from './storage/storage-provider.interface';
import { AuthenticatedUser } from '../common/types/authenticated-user';

jest.mock('./pdf/report-pdf.service', () => ({
  ReportPdfService: jest.fn().mockImplementation(() => ({
    generate: jest.fn().mockResolvedValue(Buffer.from('%PDF-gerado')),
  })),
}));

import { ReportPdfService } from './pdf/report-pdf.service';

describe('ReportsService', () => {
  let service: ReportsService;
  let prisma: {
    transaction: {
      aggregate: jest.Mock;
      findMany: jest.Mock;
    };
    financialReport: {
      findUnique: jest.Mock;
      upsert: jest.Mock;
    };
    $transaction: jest.Mock;
  };
  let storage: { save: jest.Mock; read: jest.Mock; exists: jest.Mock };

  const admin: AuthenticatedUser = {
    id: 'admin-1',
    email: 'admin@ibjt.com.br',
    nome: 'Admin',
    role: 'ADMIN',
  };

  beforeEach(async () => {
    prisma = {
      transaction: { aggregate: jest.fn(), findMany: jest.fn() },
      financialReport: { findUnique: jest.fn(), upsert: jest.fn() },
      $transaction: jest.fn(),
    };

    storage = {
      save: jest
        .fn()
        .mockResolvedValue('http://localhost:3000/reports/monthly/2026/8/pdf'),
      read: jest.fn().mockResolvedValue(Buffer.from('%PDF')),
      exists: jest.fn().mockResolvedValue(true),
    };

    const pdfService = {
      generate: jest.fn().mockResolvedValue(Buffer.from('%PDF-gerado')),
    };

    const config = {
      get: jest.fn((key: string, fallback?: string) => {
        if (key === 'PUBLIC_BASE_URL') return 'http://localhost:3000';
        return fallback;
      }),
    };

    const moduleRef = await Test.createTestingModule({
      providers: [
        ReportsService,
        { provide: PrismaService, useValue: prisma },
        { provide: ReportPdfService, useValue: pdfService },
        { provide: STORAGE_PROVIDER, useValue: storage },
        { provide: ConfigService, useValue: config },
      ],
    }).compile();

    service = moduleRef.get(ReportsService);
  });

  describe('getMonthly', () => {
    it('calcula saldo inicial, entradas, saídas e saldo final a partir do histórico', async () => {
      prisma.$transaction.mockResolvedValue([
        { _sum: { valor: new Prisma.Decimal(500) } }, // saldo anterior
        { _sum: { valor: new Prisma.Decimal(300) } }, // entradas do mês
        { _sum: { valor: new Prisma.Decimal(120) } }, // saídas do mês
        [
          {
            id: 'tx-1',
            data: new Date(2026, 7, 10),
            tipo: TransactionType.ENTRADA,
            categoria: TransactionCategory.DIZIMO,
            descricao: 'Dízimo',
            valor: new Prisma.Decimal(300),
            membro: { nome: 'João' },
          },
          {
            id: 'tx-2',
            data: new Date(2026, 7, 15),
            tipo: TransactionType.SAIDA,
            categoria: TransactionCategory.CONTAS,
            descricao: 'Água',
            valor: new Prisma.Decimal(120),
            membro: null,
          },
        ],
        null, // report (nenhum PDF gerado ainda)
      ]);

      const result = await service.getMonthly(2026, 8);

      expect(result.saldoInicial).toBe(500);
      expect(result.totalEntradas).toBe(300);
      expect(result.totalSaidas).toBe(120);
      expect(result.saldoFinal).toBe(500 + 300 - 120);
      expect(result.pdfUrl).toBeNull();

      const dizimos = result.porCategoria.find(
        (c) => c.categoria === TransactionCategory.DIZIMO,
      );
      expect(dizimos?.transacoes).toHaveLength(1);
      expect(
        result.porCategoria.every(
          (c) =>
            c.transacoes.length === 0 ||
            c.categoria === TransactionCategory.DIZIMO ||
            c.categoria === TransactionCategory.CONTAS,
        ),
      ).toBe(true);
    });

    it('considera saldo inicial zero quando não há histórico anterior', async () => {
      prisma.$transaction.mockResolvedValue([
        { _sum: { valor: null } },
        { _sum: { valor: new Prisma.Decimal(10) } },
        { _sum: { valor: new Prisma.Decimal(4) } },
        [],
        null,
      ]);

      const result = await service.getMonthly(2026, 8);
      expect(result.saldoInicial).toBe(0);
      expect(result.saldoFinal).toBe(6);
    });
  });

  describe('generatePdf', () => {
    it('gera o PDF, salva no storage e faz upsert em FinancialReport (sobrescreve)', async () => {
      prisma.$transaction.mockResolvedValue([
        { _sum: { valor: new Prisma.Decimal(0) } },
        { _sum: { valor: new Prisma.Decimal(100) } },
        { _sum: { valor: new Prisma.Decimal(0) } },
        [],
        null,
      ]);
      prisma.financialReport.upsert.mockResolvedValue({ id: 'report-1' });

      const result = await service.generatePdf(2026, 8, admin);

      expect(storage.save).toHaveBeenCalledWith(
        'monthly/2026/08/balanco.pdf',
        Buffer.from('%PDF-gerado'),
        'application/pdf',
        'http://localhost:3000/reports/monthly/2026/8/pdf',
      );
      expect(prisma.financialReport.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { mes_ano: { mes: 8, ano: 2026 } },
          update: expect.objectContaining({
            saldoFinal: expect.any(Prisma.Decimal),
            geradoPorId: 'admin-1',
          }),
        }),
      );
      expect(result.reportId).toBe('report-1');
    });
  });

  describe('getPdf', () => {
    it('lança NotFoundException quando o mês ainda não tem PDF gerado', async () => {
      prisma.financialReport.findUnique.mockResolvedValue(null);

      await expect(service.getPdf(2026, 8)).rejects.toThrow(NotFoundException);
    });

    it('retorna o buffer do PDF quando o relatório existe', async () => {
      prisma.financialReport.findUnique.mockResolvedValue({
        id: 'report-1',
        pdfUrl: 'http://localhost:3000/reports/monthly/2026/8/pdf',
      });

      const buffer = await service.getPdf(2026, 8);
      expect(buffer.toString()).toBe('%PDF');
    });
  });
});
