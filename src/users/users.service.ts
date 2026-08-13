import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../prisma/prisma.service';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  private async hashSenha(senha: string): Promise<string> {
    return bcrypt.hash(senha, 12);
  }

  async create(dto: CreateUserDto) {
    const emailExistente = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });
    if (emailExistente) {
      throw new ConflictException('Já existe um usuário com este e-mail.');
    }

    const { senha, ...dados } = dto;
    return this.prisma.user.create({
      data: {
        ...dados,
        senhaHash: await this.hashSenha(senha),
      },
      select: {
        id: true,
        nome: true,
        email: true,
        role: true,
        createdAt: true,
        updatedAt: true,
      },
    });
  }

  async findAll() {
    return this.prisma.user.findMany({
      select: {
        id: true,
        nome: true,
        email: true,
        role: true,
        createdAt: true,
        updatedAt: true,
      },
      orderBy: { nome: 'asc' },
    });
  }

  async update(id: string, dto: UpdateUserDto) {
    await this.ensureExists(id);

    if (dto.email) {
      const conflito = await this.prisma.user.findFirst({
        where: { email: dto.email, NOT: { id } },
      });
      if (conflito) {
        throw new ConflictException('Já existe um usuário com este e-mail.');
      }
    }

    const { senha, ...dados } = dto;

    return this.prisma.user.update({
      where: { id },
      data: {
        ...dados,
        ...(senha ? { senhaHash: await this.hashSenha(senha) } : {}),
      },
      select: {
        id: true,
        nome: true,
        email: true,
        role: true,
        createdAt: true,
        updatedAt: true,
      },
    });
  }

  async remove(id: string): Promise<void> {
    await this.ensureExists(id);
    await this.prisma.user.delete({ where: { id } });
  }

  private async ensureExists(id: string) {
    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user) {
      throw new NotFoundException('Usuário não encontrado.');
    }
    return user;
  }
}
