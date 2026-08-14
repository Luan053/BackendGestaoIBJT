import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '../generated/prisma/client';
import { MemberStatus, Role } from '../generated/prisma/enums';
import { PrismaService } from '../prisma/prisma.service';
import { toLocalDate } from '../common/utils/date.util';
import { AuthenticatedUser } from '../common/types/authenticated-user';
import { CreateMemberDto } from './dto/create-member.dto';
import { UpdateMemberDto } from './dto/update-member.dto';
import { QueryMemberDto } from './dto/query-member.dto';

@Injectable()
export class MembersService {
  constructor(private readonly prisma: PrismaService) {}

  private isLeader(user: AuthenticatedUser): boolean {
    return user.role === Role.LIDER_CELULA;
  }

  private async assertCanManage(user: AuthenticatedUser) {
    if (user.role === Role.TESOUREIRO) {
      throw new ForbiddenException(
        'Tesoureiro possui apenas leitura no módulo de membros.',
      );
    }
    if (this.isLeader(user)) {
      await this.assertIsLeader(user);
    }
  }

  private async assertIsLeader(user: AuthenticatedUser) {
    const celulas = await this.prisma.cell.findMany({
      where: { liderId: user.id },
      select: { id: true },
    });
    if (celulas.length === 0) {
      throw new ForbiddenException(
        'Você não está vinculado a nenhuma célula como líder.',
      );
    }
    return celulas.map((c) => c.id);
  }

  async findAll(user: AuthenticatedUser, query: QueryMemberDto) {
    const { nome, status, cellId, page = 1, limit = 10 } = query;

    const where: Prisma.MemberWhereInput = {};

    if (nome) {
      where.nome = { contains: nome, mode: 'insensitive' };
    }
    if (status) {
      where.status = status;
    }
    if (cellId) {
      where.cellId = cellId;
    }

    if (this.isLeader(user)) {
      // Nunca confia em filtro do frontend: escopo é SEMPRE as células do líder.
      where.cell = { liderId: user.id };
    }

    const [total, data] = await this.prisma.$transaction([
      this.prisma.member.count({ where }),
      this.prisma.member.findMany({
        where,
        include: {
          cell: { select: { id: true, nome: true } },
        },
        orderBy: { nome: 'asc' },
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

  async findOne(user: AuthenticatedUser, id: string) {
    const member = await this.prisma.member.findUnique({
      where: { id },
      include: {
        cell: { select: { id: true, nome: true, liderId: true } },
      },
    });

    if (!member) {
      throw new NotFoundException('Membro não encontrado.');
    }

    if (this.isLeader(user) && member.cell?.liderId !== user.id) {
      throw new NotFoundException('Membro não encontrado.');
    }

    return member;
  }

  async create(user: AuthenticatedUser, dto: CreateMemberDto) {
    await this.assertCanManage(user);

    if (dto.cellId) {
      await this.assertCellAllowed(user, dto.cellId);
    }

    return this.prisma.member.create({
      data: {
        nome: dto.nome,
        email: dto.email ?? null,
        telefone: dto.telefone ?? null,
        cpf: dto.cpf ?? null,
        dataNascimento: toLocalDate(dto.dataNascimento),
        dataBatismo: toLocalDate(dto.dataBatismo),
        endereco: dto.endereco ?? null,
        fotoUrl: dto.fotoUrl ?? null,
        status: dto.status ?? MemberStatus.ATIVO,
        cellId: dto.cellId ?? null,
        consentimentoLGPD: dto.consentimentoLGPD ?? false,
      },
      include: { cell: { select: { id: true, nome: true } } },
    });
  }

  async update(user: AuthenticatedUser, id: string, dto: UpdateMemberDto) {
    const member = await this.findOne(user, id);
    await this.assertCanManage(user);

    if (dto.cellId) {
      await this.assertCellAllowed(user, dto.cellId);
    }

    return this.prisma.member.update({
      where: { id },
      data: {
        nome: dto.nome,
        email: dto.email ?? member.email,
        telefone: dto.telefone ?? member.telefone,
        cpf: dto.cpf ?? member.cpf,
        dataNascimento: toLocalDate(dto.dataNascimento) ?? member.dataNascimento,
        dataBatismo: toLocalDate(dto.dataBatismo) ?? member.dataBatismo,
        endereco: dto.endereco ?? member.endereco,
        fotoUrl: dto.fotoUrl ?? member.fotoUrl,
        status: dto.status ?? member.status,
        cellId: dto.cellId ?? member.cellId,
        consentimentoLGPD: dto.consentimentoLGPD ?? member.consentimentoLGPD,
      },
      include: { cell: { select: { id: true, nome: true } } },
    });
  }

  async remove(user: AuthenticatedUser, id: string) {
    await this.findOne(user, id);
    await this.assertCanManage(user);

    // Soft delete: apenas inativa, nunca remove fisicamente
    return this.prisma.member.update({
      where: { id },
      data: { status: MemberStatus.INATIVO },
      include: { cell: { select: { id: true, nome: true } } },
    });
  }

  async exportData(id: string) {
    const member = await this.prisma.member.findUnique({
      where: { id },
      include: {
        cell: { select: { id: true, nome: true } },
        transactions: {
          orderBy: { data: 'desc' },
          select: {
            id: true,
            tipo: true,
            categoria: true,
            valor: true,
            data: true,
            descricao: true,
          },
        },
      },
    });

    if (!member) {
      throw new NotFoundException('Membro não encontrado.');
    }

    return {
      exportadoEm: new Date(),
      membro: {
        id: member.id,
        nome: member.nome,
        email: member.email,
        telefone: member.telefone,
        cpf: member.cpf,
        dataNascimento: member.dataNascimento,
        dataBatismo: member.dataBatismo,
        endereco: member.endereco,
        fotoUrl: member.fotoUrl,
        status: member.status,
        consentimentoLGPD: member.consentimentoLGPD,
        cell: member.cell,
        createdAt: member.createdAt,
        updatedAt: member.updatedAt,
      },
      transactions: member.transactions,
    };
  }

  async anonymize(id: string) {
    const member = await this.prisma.member.findUnique({ where: { id } });

    if (!member) {
      throw new NotFoundException('Membro não encontrado.');
    }

    return this.prisma.$transaction(async (tx) => {
      await tx.transaction.updateMany({
        where: { membroId: id },
        data: { membroId: null },
      });

      return tx.member.update({
        where: { id },
        data: {
          nome: 'Membro anonimizado',
          email: null,
          telefone: null,
          cpf: null,
          dataNascimento: null,
          dataBatismo: null,
          endereco: null,
          fotoUrl: null,
          cellId: null,
          consentimentoLGPD: false,
          status: MemberStatus.INATIVO,
          anonymizedAt: new Date(),
        },
      });
    });
  }

  private async assertCellAllowed(
    user: AuthenticatedUser,
    cellId: string,
  ): Promise<void> {
    if (!this.isLeader(user)) {
      return;
    }

    const cell = await this.prisma.cell.findUnique({
      where: { id: cellId },
      select: { liderId: true },
    });

    if (!cell || cell.liderId !== user.id) {
      throw new ForbiddenException(
        'Você só pode vincular membros às suas próprias células.',
      );
    }
  }
}
