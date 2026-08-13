import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Role } from '../generated/prisma/enums';
import { AuthenticatedUser } from '../common/types/authenticated-user';
import { CreateCellDto } from './dto/create-cell.dto';
import { UpdateCellDto } from './dto/update-cell.dto';

@Injectable()
export class CellsService {
  constructor(private readonly prisma: PrismaService) {}

  private isLeader(user: AuthenticatedUser): boolean {
    return user.role === Role.LIDER_CELULA;
  }

  async findAll(user: AuthenticatedUser) {
    const where =
      this.isLeader(user) ? { liderId: user.id } : {};

    return this.prisma.cell.findMany({
      where,
      include: {
        lider: { select: { id: true, nome: true } },
        _count: { select: { membros: true } },
      },
      orderBy: { nome: 'asc' },
    });
  }

  async findOne(user: AuthenticatedUser, id: string) {
    const cell = await this.prisma.cell.findUnique({
      where: { id },
      include: {
        lider: { select: { id: true, nome: true } },
        membros: {
          select: {
            id: true,
            nome: true,
            telefone: true,
            email: true,
            status: true,
          },
          orderBy: { nome: 'asc' },
        },
        _count: { select: { membros: true } },
      },
    });

    if (!cell) {
      throw new NotFoundException('Célula não encontrada.');
    }

    if (this.isLeader(user) && cell.liderId !== user.id) {
      throw new NotFoundException('Célula não encontrada.');
    }

    return cell;
  }

  async create(dto: CreateCellDto) {
    return this.prisma.cell.create({
      data: {
        nome: dto.nome,
        diaDaSemana: dto.diaDaSemana,
        horario: dto.horario,
        local: dto.local,
        liderId: dto.liderId ?? null,
      },
      include: {
        lider: { select: { id: true, nome: true } },
        _count: { select: { membros: true } },
      },
    });
  }

  async update(id: string, dto: UpdateCellDto) {
    await this.ensureExists(id);

    return this.prisma.cell.update({
      where: { id },
      data: {
        nome: dto.nome,
        diaDaSemana: dto.diaDaSemana,
        horario: dto.horario,
        local: dto.local,
        liderId: dto.liderId,
      },
      include: {
        lider: { select: { id: true, nome: true } },
        _count: { select: { membros: true } },
      },
    });
  }

  async remove(id: string) {
    await this.ensureExists(id);

    // Regra: membros vinculados ficam sem célula (cellId = null), nunca são deletados
    return this.prisma.$transaction([
      this.prisma.member.updateMany({
        where: { cellId: id },
        data: { cellId: null },
      }),
      this.prisma.cell.delete({ where: { id } }),
    ]);
  }

  private async ensureExists(id: string) {
    const cell = await this.prisma.cell.findUnique({ where: { id } });
    if (!cell) {
      throw new NotFoundException('Célula não encontrada.');
    }
    return cell;
  }
}