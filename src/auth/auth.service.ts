import { createHash, randomUUID } from 'crypto';
import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService, JwtSignOptions } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../prisma/prisma.service';
import { User } from '../generated/prisma/client';
import { AccessTokenPayload } from './strategies/jwt.strategy';
import { RefreshTokenPayload } from './strategies/jwt-refresh.strategy';
import { LoginDto } from './dto/login.dto';

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly config: ConfigService,
  ) {}

  private expiresIn(
    value: string | undefined,
    fallback: string,
  ): JwtSignOptions['expiresIn'] {
    return (value ?? fallback) as JwtSignOptions['expiresIn'];
  }

  private issueAccessToken(user: User): string {
    const payload: AccessTokenPayload = {
      sub: user.id,
      email: user.email,
      nome: user.nome,
      role: user.role,
    };
    return this.jwtService.sign(payload, {
      secret: this.config.getOrThrow<string>('JWT_ACCESS_SECRET'),
      expiresIn: this.expiresIn(
        this.config.get<string>('JWT_ACCESS_EXPIRES_IN'),
        '15m',
      ),
    });
  }

  private issueRefreshToken(userId: string, tokenId: string): string {
    const payload: RefreshTokenPayload = { sub: userId, tokenId };
    return this.jwtService.sign(payload, {
      secret: this.config.getOrThrow<string>('JWT_REFRESH_SECRET'),
      expiresIn: this.expiresIn(
        this.config.get<string>('JWT_REFRESH_EXPIRES_IN'),
        '7d',
      ),
    });
  }

  private refreshTokenExpiresIn(): string {
    return this.config.get<string>('JWT_REFRESH_EXPIRES_IN', '7d');
  }

  private async persistRefreshToken(
    userId: string,
    userAgent?: string,
  ): Promise<{ id: string; refreshToken: string }> {
    const expiresIn = this.refreshTokenExpiresIn();
    const expiresAt = new Date(Date.now() + parseDuration(expiresIn));

    // Cria a linha primeiro para usar o id real como tokenId do JWT,
    // garantindo o vínculo entre payload e registro no banco.
    // O placeholder é único para não colidir com logins concorrentes.
    const stored = await this.prisma.refreshToken.create({
      data: {
        tokenHash: `pending-${randomUUID()}`,
        userId,
        expiresAt,
        userAgent: userAgent?.slice(0, 200) ?? null,
      },
    });

    const refreshToken = this.issueRefreshToken(userId, stored.id);
    await this.prisma.refreshToken.update({
      where: { id: stored.id },
      data: { tokenHash: hashToken(refreshToken) },
    });

    return { id: stored.id, refreshToken };
  }

  async login(dto: LoginDto, userAgent?: string) {
    const user = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });

    const senhaValida =
      user && (await bcrypt.compare(dto.senha, user.senhaHash));

    if (!user || !senhaValida) {
      throw new UnauthorizedException('Credenciais inválidas.');
    }

    const { refreshToken } = await this.persistRefreshToken(user.id, userAgent);

    return {
      accessToken: this.issueAccessToken(user),
      refreshToken,
      user: {
        id: user.id,
        nome: user.nome,
        email: user.email,
        role: user.role,
      },
    };
  }

  async refresh(refreshToken: string, userAgent?: string) {
    const tokenHash = hashToken(refreshToken);
    const stored = await this.prisma.refreshToken.findUnique({
      where: { tokenHash },
    });

    if (!stored || stored.revokedAt) {
      throw new UnauthorizedException('Refresh token inválido ou revogado.');
    }

    if (stored.expiresAt.getTime() <= Date.now()) {
      throw new UnauthorizedException('Refresh token expirado.');
    }

    let payload: RefreshTokenPayload;
    try {
      payload = await this.jwtService.verifyAsync<RefreshTokenPayload>(
        refreshToken,
        { secret: this.config.getOrThrow<string>('JWT_REFRESH_SECRET') },
      );
    } catch {
      throw new UnauthorizedException('Refresh token inválido.');
    }

    if (payload.sub !== stored.userId || payload.tokenId !== stored.id) {
      throw new UnauthorizedException('Refresh token inconsistente.');
    }

    const user = await this.prisma.user.findUnique({
      where: { id: stored.userId },
    });

    if (!user) {
      throw new UnauthorizedException('Usuário não encontrado.');
    }

    // Rotação: revoga o token antigo e emite um novo par
    const novaId = await this.prisma.$transaction(async (tx) => {
      await tx.refreshToken.update({
        where: { id: stored.id },
        data: { revokedAt: new Date() },
      });

      const nova = await tx.refreshToken.create({
        data: {
          tokenHash: `pending-${randomUUID()}`,
          userId: user.id,
          expiresAt: stored.expiresAt,
          userAgent: userAgent?.slice(0, 200) ?? null,
        },
      });
      return nova.id;
    });

    // Vincula o payload ao id real da nova linha (igual ao login)
    const finalToken = this.issueRefreshToken(user.id, novaId);
    await this.prisma.refreshToken.update({
      where: { id: novaId },
      data: { tokenHash: hashToken(finalToken) },
    });

    return {
      accessToken: this.issueAccessToken(user),
      refreshToken: finalToken,
      user: {
        id: user.id,
        nome: user.nome,
        email: user.email,
        role: user.role,
      },
    };
  }

  async logout(refreshToken: string): Promise<void> {
    const stored = await this.prisma.refreshToken.findUnique({
      where: { tokenHash: hashToken(refreshToken) },
    });

    if (!stored || stored.revokedAt) {
      throw new UnauthorizedException('Refresh token inválido ou revogado.');
    }

    await this.prisma.refreshToken.update({
      where: { id: stored.id },
      data: { revokedAt: new Date() },
    });
  }
}

function parseDuration(value: string): number {
  const match = /^(\d+)(s|m|h|d)$/.exec(value);
  if (!match) {
    return 7 * 24 * 60 * 60 * 1000;
  }
  const amount = parseInt(match[1], 10);
  const unit = match[2];
  const multipliers: Record<string, number> = {
    s: 1000,
    m: 60 * 1000,
    h: 60 * 60 * 1000,
    d: 24 * 60 * 60 * 1000,
  };
  return amount * multipliers[unit];
}
