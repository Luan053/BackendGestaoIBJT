import { Test } from '@nestjs/testing';
import { UnauthorizedException } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { AuthService } from './auth.service';
import { PrismaService } from '../prisma/prisma.service';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';

jest.mock('bcrypt', () => ({
  compare: jest.fn(),
  hash: jest.fn(),
}));

const mockedCompare = bcrypt.compare as jest.Mock;

describe('AuthService', () => {
  let service: AuthService;
  let prisma: {
    user: { findUnique: jest.Mock };
    refreshToken: {
      findUnique: jest.Mock;
      create: jest.Mock;
      update: jest.Mock;
    };
    $transaction: jest.Mock;
  };

  const baseUser = {
    id: 'user-1',
    nome: 'Admin',
    email: 'admin@ibjt.com.br',
    senhaHash: 'hash',
    role: 'ADMIN',
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  beforeEach(async () => {
    prisma = {
      user: { findUnique: jest.fn() },
      refreshToken: {
        findUnique: jest.fn(),
        create: jest.fn().mockResolvedValue({ id: 'rt-1' }),
        update: jest.fn(),
      },
      $transaction: jest.fn(),
    };

    const config = {
      get: jest.fn((key: string, fallback?: string) => {
        const values: Record<string, string> = {
          JWT_ACCESS_EXPIRES_IN: '15m',
          JWT_REFRESH_EXPIRES_IN: '7d',
        };
        return values[key] ?? fallback;
      }),
      getOrThrow: jest.fn((key: string) => {
        const values: Record<string, string> = {
          JWT_ACCESS_SECRET: 'access-secret',
          JWT_REFRESH_SECRET: 'refresh-secret',
          DATABASE_URL: 'postgres://localhost',
        };
        return values[key];
      }),
    };

    const jwtService = {
      sign: jest.fn().mockReturnValue('signed-token'),
      verifyAsync: jest
        .fn()
        .mockResolvedValue({ sub: 'user-1', tokenId: 'rt-1' }),
    };

    const moduleRef = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: PrismaService, useValue: prisma },
        { provide: JwtService, useValue: jwtService },
        { provide: ConfigService, useValue: config },
      ],
    }).compile();

    service = moduleRef.get(AuthService);
    mockedCompare.mockReset();
  });

  describe('login', () => {
    it('retorna accessToken + refreshToken e persiste o refresh token', async () => {
      prisma.user.findUnique.mockResolvedValue(baseUser);
      mockedCompare.mockResolvedValue(true);

      const result = await service.login(
        { email: 'admin@ibjt.com.br', senha: 'Admin@123' },
        'curl/8',
      );

      expect(result.accessToken).toBe('signed-token');
      expect(result.refreshToken).toBe('signed-token');
      expect(result.user.role).toBe('ADMIN');
      expect(prisma.refreshToken.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            userId: 'user-1',
            tokenHash: expect.stringMatching(/^pending-/),
            userAgent: 'curl/8',
          }),
        }),
      );
      // o hash real é gravado no update (vínculo id real ↔ payload)
      expect(prisma.refreshToken.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'rt-1' },
          data: expect.objectContaining({
            tokenHash: expect.any(String),
          }),
        }),
      );
    });

    it('rejeita credenciais inválidas', async () => {
      prisma.user.findUnique.mockResolvedValue(baseUser);
      mockedCompare.mockResolvedValue(false);

      await expect(
        service.login({ email: 'admin@ibjt.com.br', senha: 'errada' }),
      ).rejects.toThrow(UnauthorizedException);
      expect(prisma.refreshToken.create).not.toHaveBeenCalled();
    });

    it('rejeita usuário inexistente', async () => {
      prisma.user.findUnique.mockResolvedValue(null);

      await expect(
        service.login({ email: 'nobody@ibjt.com.br', senha: 'qualquer' }),
      ).rejects.toThrow(UnauthorizedException);
    });
  });

  describe('refresh', () => {
    it('rotaciona o refresh token: revoga o antigo e emite um novo par', async () => {
      prisma.refreshToken.findUnique.mockResolvedValue({
        id: 'rt-1',
        userId: 'user-1',
        tokenHash: 'hash',
        expiresAt: new Date(Date.now() + 100_000),
        revokedAt: null,
      });
      prisma.user.findUnique.mockResolvedValue(baseUser);
      prisma.refreshToken.create.mockResolvedValue({ id: 'rt-2' });
      prisma.$transaction.mockImplementation(
        (callback: (tx: typeof prisma) => Promise<unknown>) => callback(prisma),
      );

      const result = await service.refresh('refresh-token-raw');

      expect(result.accessToken).toBe('signed-token');
      expect(result.refreshToken).toBe('signed-token');
      expect(prisma.refreshToken.update).toHaveBeenCalledWith({
        where: { id: 'rt-1' },
        data: expect.objectContaining({ revokedAt: expect.any(Date) }),
      });
      expect(prisma.refreshToken.update).toHaveBeenCalledWith({
        where: { id: 'rt-2' },
        data: expect.objectContaining({ tokenHash: expect.any(String) }),
      });
    });

    it('rejeita token revogado', async () => {
      prisma.refreshToken.findUnique.mockResolvedValue({
        id: 'rt-1',
        userId: 'user-1',
        tokenHash: 'hash',
        expiresAt: new Date(Date.now() + 100_000),
        revokedAt: new Date(),
      });

      await expect(service.refresh('refresh-token-raw')).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('rejeita token expirado', async () => {
      prisma.refreshToken.findUnique.mockResolvedValue({
        id: 'rt-1',
        userId: 'user-1',
        tokenHash: 'hash',
        expiresAt: new Date(Date.now() - 100_000),
        revokedAt: null,
      });

      await expect(service.refresh('refresh-token-raw')).rejects.toThrow(
        UnauthorizedException,
      );
    });
  });

  describe('logout', () => {
    it('revoga o refresh token', async () => {
      prisma.refreshToken.findUnique.mockResolvedValue({
        id: 'rt-1',
        revokedAt: null,
      });

      await service.logout('refresh-token-raw');

      expect(prisma.refreshToken.update).toHaveBeenCalledWith({
        where: { id: 'rt-1' },
        data: expect.objectContaining({ revokedAt: expect.any(Date) }),
      });
    });
  });
});
