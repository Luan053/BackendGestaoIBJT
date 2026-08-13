import { Test } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CellsService } from './cells.service';
import { AuthenticatedUser } from '../common/types/authenticated-user';

describe('CellsService', () => {
  let service: CellsService;
  let prisma: {
    cell: {
      findUnique: jest.Mock;
      findMany: jest.Mock;
      create: jest.Mock;
      update: jest.Mock;
      delete: jest.Mock;
    };
    member: { updateMany: jest.Mock };
    $transaction: jest.Mock;
  };

  const admin: AuthenticatedUser = {
    id: 'admin-1',
    email: 'admin@ibjt.com.br',
    nome: 'Admin',
    role: 'ADMIN',
  };

  beforeEach(async () => {
    prisma = {
      cell: {
        findUnique: jest.fn(),
        findMany: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
      },
      member: { updateMany: jest.fn() },
      $transaction: jest.fn(),
    };

    const moduleRef = await Test.createTestingModule({
      providers: [CellsService, { provide: PrismaService, useValue: prisma }],
    }).compile();

    service = moduleRef.get(CellsService);
  });

  describe('remove (regra de exclusão de célula)', () => {
    it('desvincula os membros (cellId = null) e remove a célula na mesma transação', async () => {
      prisma.cell.findUnique.mockResolvedValue({ id: 'cell-1' });
      prisma.member.updateMany.mockResolvedValue({ count: 3 });
      prisma.cell.delete.mockResolvedValue({ id: 'cell-1' });

      await service.remove('cell-1');

      expect(prisma.member.updateMany).toHaveBeenCalledWith({
        where: { cellId: 'cell-1' },
        data: { cellId: null },
      });
      expect(prisma.cell.delete).toHaveBeenCalledWith({
        where: { id: 'cell-1' },
      });
      const [args] = prisma.$transaction.mock.calls[0];
      expect(args).toHaveLength(2);
    });

    it('lança NotFoundException para célula inexistente', async () => {
      prisma.cell.findUnique.mockResolvedValue(null);

      await expect(service.remove('cell-x')).rejects.toThrow(NotFoundException);
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });
  });

  describe('findAll (escopo por liderId)', () => {
    it('LIDER_CELULA vê apenas as próprias células', async () => {
      prisma.cell.findMany.mockResolvedValue([]);

      const leader: AuthenticatedUser = {
        id: 'leader-1',
        email: 'lider@ibjt.com.br',
        nome: 'Líder',
        role: 'LIDER_CELULA',
      };

      await service.findAll(leader);

      expect(prisma.cell.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { liderId: 'leader-1' } }),
      );
    });

    it('ADMIN vê todas as células', async () => {
      prisma.cell.findMany.mockResolvedValue([]);

      await service.findAll(admin);

      expect(prisma.cell.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: {} }),
      );
    });
  });
});
