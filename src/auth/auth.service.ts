import { createHash, randomUUID } from 'crypto';
import {
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
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

  private expiresIn(value: string | undefined, fallback: string): JwtSignOptions['expiresIn'] {
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
    refreshToken: string,
    userAgent?: string,
  ) {
    const expiresIn = this.refreshTokenExpiresIn();
    const expiresAt = new Date(Date.now() + parseDuration(expiresIn));

    return this.prisma.refreshToken.create({
      data: {
        tokenHash: hashToken(refreshToken),
        userId,
        expiresAt,
        userAgent: userAgent?.slice(0, 200) ?? null,
      },
    });
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

    const refreshToken = this.issueRefreshToken(user.id, randomUUID());
    await this.persistRefreshToken(user.id, refreshToken, userAgent);

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
    const newTokenId = randomUUID();
    const newRefreshToken = this.issueRefreshToken(user.id, newTokenId);
    await this.prisma.$transaction([
      this.prisma.refreshToken.update({
        where: { id: stored.id },
        data: { revokedAt: new Date() },
      }),
      this.prisma.refreshToken.create({
        data: {
          tokenHash: hashToken(newRefreshToken),
          userId: user.id,
          expiresAt: stored.expiresAt,
          userAgent: userAgent?.slice(0, 200) ?? null,
        },
      }),
    ]);

    return {
      accessToken: this.issueAccessToken(user),
      refreshToken: newRefreshToken,
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