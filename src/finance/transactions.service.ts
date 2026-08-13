import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuthenticatedUser } from '../common/types/authenticated-user';
import { CreateTransactionDto } from './dto/create-transaction.dto';
import { UpdateTransactionDto } from './dto/update-transaction.dto';
import { QueryTransactionDto } from './dto/query-transaction.dto';

@Injectable()
export class TransactionsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(user: AuthenticatedUser, dto: CreateTransactionDto) {
    if (dto.membroId) {
      await this.ensureMemberExists(dto.membroId);
    }

    return this.prisma.transaction.create({
      data: {
        tipo: dto.tipo,
        categoria: dto.categoria,
        valor: new Prisma.Decimal(dto.valor),
        data: dto.data ? new Date(dto.data) : new Date(),
        descricao: dto.descricao ?? null,
        membroId: dto.membroId ?? null,
        criadoPorId: user.id,
      },
      include: { membro: { select: { id: true, nome: true } } },
    });
  }

  async findAll(query: QueryTransactionDto) {
    const { mes, ano, tipo, categoria, membroId, page = 1, limit = 20 } = query;

    const where: Prisma.TransactionWhereInput = {};

    if (mes !== undefined || ano !== undefined) {
      const now = new Date();
      const month = mes ?? now.getMonth() + 1;
      const year = ano ?? now.getFullYear();

      if (month < 1 || month > 12) {
        throw new BadRequestException('mes deve estar entre 1 e 12.');
      }

      where.data = {
        gte: new Date(year, month - 1, 1),
        lt: new Date(year, month, 1),
      };
    }

    if (tipo) where.tipo = tipo;
    if (categoria) where.categoria = categoria;
    if (membroId) where.membroId = membroId;

    const [total, data] = await this.prisma.$transaction([
      this.prisma.transaction.count({ where }),
      this.prisma.transaction.findMany({
        where,
        include: {
          membro: { select: { id: true, nome: true } },
        },
        orderBy: { data: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
    ]);

    return {
      data,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async findOne(id: string) {
    const transaction = await this.prisma.transaction.findUnique({
      where: { id },
      include: { membro: { select: { id: true, nome: true } } },
    });

    if (!transaction) {
      throw new NotFoundException('Transação não encontrada.');
    }

    return transaction;
  }

  async update(user: AuthenticatedUser, id: string, dto: UpdateTransactionDto) {
    await this.findOne(id);

    if (dto.membroId) {
      await this.ensureMemberExists(dto.membroId);
    }

    return this.prisma.transaction.update({
      where: { id },
      data: {
        tipo: dto.tipo,
        categoria: dto.categoria,
        valor:
          dto.valor !== undefined ? new Prisma.Decimal(dto.valor) : undefined,
        data: dto.data ? new Date(dto.data) : undefined,
        descricao: dto.descricao,
        membroId: dto.membroId,
        criadoPorId: user.id,
      },
      include: { membro: { select: { id: true, nome: true } } },
    });
  }

  async remove(id: string) {
    await this.findOne(id);
    await this.prisma.transaction.delete({ where: { id } });
  }

  private async ensureMemberExists(membroId: string) {
    const member = await this.prisma.member.findUnique({
      where: { id: membroId },
    });
    if (!member) {
      throw new NotFoundException('Membro não encontrado.');
    }
  }
}
