import { Test } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { Prisma } from '../generated/prisma/client';
import {
  TransactionCategory,
  TransactionType,
} from '../generated/prisma/enums';
import { PrismaService } from '../prisma/prisma.service';
import { TransactionsService } from './transactions.service';
import { CreateTransactionDto } from './dto/create-transaction.dto';
import { AuthenticatedUser } from '../common/types/authenticated-user';

describe('TransactionsService', () => {
  let service: TransactionsService;
  let prisma: {
    transaction: {
      create: jest.Mock;
      findUnique: jest.Mock;
      findMany: jest.Mock;
      update: jest.Mock;
      delete: jest.Mock;
      count: jest.Mock;
      aggregate: jest.Mock;
    };
    member: { findUnique: jest.Mock };
    $transaction: jest.Mock;
  };

  const user: AuthenticatedUser = {
    id: 'admin-1',
    email: 'admin@ibjt.com.br',
    nome: 'Admin',
    role: 'ADMIN',
  };

  beforeEach(async () => {
    prisma = {
      transaction: {
        create: jest.fn(),
        findUnique: jest.fn(),
        findMany: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
        count: jest.fn(),
        aggregate: jest.fn(),
      },
      member: { findUnique: jest.fn() },
      $transaction: jest.fn(),
    };

    const moduleRef = await Test.createTestingModule({
      providers: [
        TransactionsService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();

    service = moduleRef.get(TransactionsService);
  });

  describe('validação de DTO (tipo/valor)', () => {
    it('aceita valor positivo com tipo válido', async () => {
      const dto = plainToInstance(CreateTransactionDto, {
        tipo: TransactionType.ENTRADA,
        categoria: TransactionCategory.DIZIMO,
        valor: 150.5,
      });

      const errors = await validate(dto);
      expect(errors).toHaveLength(0);
    });

    it('rejeita valor negativo', async () => {
      const dto = plainToInstance(CreateTransactionDto, {
        tipo: TransactionType.ENTRADA,
        categoria: TransactionCategory.DIZIMO,
        valor: -10,
      });

      const errors = await validate(dto);
      expect(errors.some((e) => e.property === 'valor')).toBe(true);
    });

    it('rejeita tipo inválido', async () => {
      const dto = plainToInstance(CreateTransactionDto, {
        tipo: 'TRANSFERENCIA',
        categoria: TransactionCategory.DIZIMO,
        valor: 10,
      });

      const errors = await validate(dto);
      expect(errors.some((e) => e.property === 'tipo')).toBe(true);
    });
  });

  describe('create', () => {
    it('grava valor como Decimal positivo e criadoPorId para auditoria', async () => {
      prisma.transaction.create.mockResolvedValue({ id: 'tx-1' });

      await service.create(user, {
        tipo: TransactionType.ENTRADA,
        categoria: TransactionCategory.OFERTA,
        valor: 200,
        descricao: 'Culto de domingo',
      });

      expect(prisma.transaction.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            tipo: TransactionType.ENTRADA,
            categoria: TransactionCategory.OFERTA,
            valor: expect.any(Prisma.Decimal),
            criadoPorId: 'admin-1',
          }),
        }),
      );

      const data = prisma.transaction.create.mock.calls[0][0].data;
      expect(data.valor.toNumber()).toBe(200);
    });

    it('lança NotFoundException quando membroId não existe', async () => {
      prisma.member.findUnique.mockResolvedValue(null);

      await expect(
        service.create(user, {
          tipo: TransactionType.SAIDA,
          categoria: TransactionCategory.CONTAS,
          valor: 50,
          membroId: 'membro-inexistente',
        }),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('update', () => {
    it('atualiza os campos informados', async () => {
      prisma.transaction.findUnique.mockResolvedValue({ id: 'tx-1' });
      prisma.transaction.update.mockResolvedValue({ id: 'tx-1' });

      await service.update(user, 'tx-1', {
        descricao: 'nova descrição',
      });

      expect(prisma.transaction.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'tx-1' },
          data: expect.objectContaining({ descricao: 'nova descrição' }),
        }),
      );
    });

    it('lança NotFoundException para transação inexistente', async () => {
      prisma.transaction.findUnique.mockResolvedValue(null);

      await expect(
        service.update(user, 'tx-x', { descricao: 'x' }),
      ).rejects.toThrow(NotFoundException);
    });
  });
});
