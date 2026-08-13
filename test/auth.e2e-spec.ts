import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { randomUUID } from 'crypto';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';

describe('Auth e RBAC (e2e)', () => {
  let app: INestApplication;
  let adminToken: string;
  let adminRefresh: string;

  const suffix = randomUUID().slice(0, 8);
  const tesoureiroEmail = `tesoureiro-${suffix}@ibjt.com.br`;
  const liderEmail = `lider-${suffix}@ibjt.com.br`;
  let tesoureiroToken: string;
  let liderToken: string;
  let cellDoLiderId: string;
  let outraCellId: string;
  let liderId: string;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleRef.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    await app.init();
  });

  afterAll(async () => {
    const prisma = app.get(PrismaService);
    await prisma.user
      .deleteMany({ where: { email: { in: [tesoureiroEmail, liderEmail] } } })
      .catch(() => undefined);
    await prisma.cell
      .deleteMany({ where: { id: { in: [cellDoLiderId, outraCellId] } } })
      .catch(() => undefined);
    await app.close();
  });

  describe('login', () => {
    it('retorna accessToken e refreshToken com credenciais do seed', async () => {
      const res = await request(app.getHttpServer())
        .post('/auth/login')
        .send({
          email: process.env.ADMIN_SEED_EMAIL ?? 'admin@ibjt.com.br',
          senha: process.env.ADMIN_SEED_PASSWORD ?? 'Admin@123',
        })
        .expect(200);

      expect(res.body.accessToken).toBeDefined();
      expect(res.body.refreshToken).toBeDefined();
      expect(res.body.user.role).toBe('ADMIN');
      adminToken = res.body.accessToken;
      adminRefresh = res.body.refreshToken;
    });

    it('rejeita senha incorreta (401)', async () => {
      await request(app.getHttpServer())
        .post('/auth/login')
        .send({ email: 'admin@ibjt.com.br', senha: 'senha-errada' })
        .expect(401);
    });

    it('bloqueia rota protegida sem token (401)', async () => {
      await request(app.getHttpServer()).get('/members').expect(401);
    });
  });

  describe('refresh token', () => {
    it('rotaciona: novo par funciona e o antigo é revogado', async () => {
      const res = await request(app.getHttpServer())
        .post('/auth/refresh')
        .send({ refreshToken: adminRefresh })
        .expect(200);

      expect(res.body.accessToken).toBeDefined();
      const newRefresh = res.body.refreshToken;

      // token antigo revogado
      await request(app.getHttpServer())
        .post('/auth/refresh')
        .send({ refreshToken: adminRefresh })
        .expect(401);

      // novo funciona
      await request(app.getHttpServer())
        .post('/auth/refresh')
        .send({ refreshToken: newRefresh })
        .expect(200);

      adminRefresh = newRefresh;
    });
  });

  describe('RBAC', () => {
    it('ADMIN cria usuário TESOUREIRO', async () => {
      const res = await request(app.getHttpServer())
        .post('/users')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          nome: 'Tesoureiro E2E',
          email: tesoureiroEmail,
          senha: 'Senha@123',
          role: 'TESOUREIRO',
        })
        .expect(201);

      expect(res.body.role).toBe('TESOUREIRO');
    });

    it('TESOUREIRO acessa finance e leitura de members, mas não escreve em members', async () => {
      const login = await request(app.getHttpServer())
        .post('/auth/login')
        .send({ email: tesoureiroEmail, senha: 'Senha@123' })
        .expect(200);
      tesoureiroToken = login.body.accessToken;

      await request(app.getHttpServer())
        .get('/members')
        .set('Authorization', `Bearer ${tesoureiroToken}`)
        .expect(200);

      await request(app.getHttpServer())
        .post('/transactions')
        .set('Authorization', `Bearer ${tesoureiroToken}`)
        .send({ tipo: 'ENTRADA', categoria: 'DIZIMO', valor: 10 })
        .expect(201);

      await request(app.getHttpServer())
        .post('/members')
        .set('Authorization', `Bearer ${tesoureiroToken}`)
        .send({ nome: 'Membro Inválido' })
        .expect(403);
    });

    it('ADMIN cria LIDER_CELULA, células e membros', async () => {
      const lider = await request(app.getHttpServer())
        .post('/users')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          nome: 'Líder E2E',
          email: liderEmail,
          senha: 'Senha@123',
          role: 'LIDER_CELULA',
        })
        .expect(201);
      liderId = lider.body.id;

      const cell1 = await request(app.getHttpServer())
        .post('/cells')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          nome: 'Célula do Líder',
          diaDaSemana: 'Quarta',
          horario: '19:30',
          local: 'Rua A',
          liderId,
        })
        .expect(201);
      cellDoLiderId = cell1.body.id;

      const cell2 = await request(app.getHttpServer())
        .post('/cells')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          nome: 'Outra Célula',
          diaDaSemana: 'Sábado',
          horario: '18:00',
          local: 'Rua B',
        })
        .expect(201);
      outraCellId = cell2.body.id;

      await request(app.getHttpServer())
        .post('/members')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ nome: 'Membro da Célula', cellId: cellDoLiderId })
        .expect(201);

      await request(app.getHttpServer())
        .post('/members')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ nome: 'Membro de Fora', cellId: outraCellId })
        .expect(201);
    });

    it('LIDER_CELULA vê apenas as próprias células', async () => {
      const login = await request(app.getHttpServer())
        .post('/auth/login')
        .send({ email: liderEmail, senha: 'Senha@123' })
        .expect(200);
      liderToken = login.body.accessToken;

      const res = await request(app.getHttpServer())
        .get('/cells')
        .set('Authorization', `Bearer ${liderToken}`)
        .expect(200);

      expect(res.body).toHaveLength(1);
      expect(res.body[0].id).toBe(cellDoLiderId);
    });

    it('LIDER_CELULA vê apenas os membros da própria célula', async () => {
      const res = await request(app.getHttpServer())
        .get('/members')
        .set('Authorization', `Bearer ${liderToken}`)
        .expect(200);

      expect(res.body.meta.total).toBe(1);
      expect(res.body.data[0].nome).toBe('Membro da Célula');
    });

    it('LIDER_CELULA não acessa finance (403)', async () => {
      await request(app.getHttpServer())
        .get('/transactions')
        .set('Authorization', `Bearer ${liderToken}`)
        .expect(403);
    });

    it('LIDER_CELULA não vincula membro a célula de outro líder (403)', async () => {
      await request(app.getHttpServer())
        .post('/members')
        .set('Authorization', `Bearer ${liderToken}`)
        .send({ nome: 'Tentativa', cellId: outraCellId })
        .expect(403);
    });

    it('LIDER_CELULA cria membro na própria célula (201)', async () => {
      await request(app.getHttpServer())
        .post('/members')
        .set('Authorization', `Bearer ${liderToken}`)
        .send({ nome: 'Membro Novo', cellId: cellDoLiderId })
        .expect(201);
    });

    it('LIDER_CELULA não cria célula (403)', async () => {
      await request(app.getHttpServer())
        .post('/cells')
        .set('Authorization', `Bearer ${liderToken}`)
        .send({
          nome: 'Célula Ilegal',
          diaDaSemana: 'Seg',
          horario: '20:00',
          local: 'X',
        })
        .expect(403);
    });

    it('logout revoga o refresh token (401 no próximo refresh)', async () => {
      const login = await request(app.getHttpServer())
        .post('/auth/login')
        .send({ email: tesoureiroEmail, senha: 'Senha@123' })
        .expect(200);

      await request(app.getHttpServer())
        .post('/auth/logout')
        .set('Authorization', `Bearer ${tesoureiroToken}`)
        .send({ refreshToken: login.body.refreshToken })
        .expect(200);

      await request(app.getHttpServer())
        .post('/auth/refresh')
        .send({ refreshToken: login.body.refreshToken })
        .expect(401);
    });
  });

  describe('soft delete de membro', () => {
    it('DELETE muda status para INATIVO em vez de remover', async () => {
      const criado = await request(app.getHttpServer())
        .post('/members')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ nome: 'Membro Soft Delete', status: 'ATIVO' })
        .expect(201);

      const removido = await request(app.getHttpServer())
        .delete(`/members/${criado.body.id}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(removido.body.status).toBe('INATIVO');

      const buscado = await request(app.getHttpServer())
        .get(`/members/${criado.body.id}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(buscado.body.id).toBe(criado.body.id);
    });
  });
});
