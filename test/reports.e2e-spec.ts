import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';

describe('Relatório mensal (e2e)', () => {
  jest.setTimeout(90_000);
  let app: INestApplication;
  let adminToken: string;
  let prisma: any;

  const now = new Date();
  const ano = now.getFullYear();
  const mes = now.getMonth() + 1;

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

    prisma = app.get(PrismaService);

    const login = await request(app.getHttpServer())
      .post('/auth/login')
      .send({
        email: process.env.ADMIN_SEED_EMAIL ?? 'admin@ibjt.com.br',
        senha: process.env.ADMIN_SEED_PASSWORD ?? 'Admin@123',
      })
      .expect(200);

    adminToken = login.body.accessToken;
  });

  afterAll(async () => {
    await prisma.$disconnect().catch(() => undefined);
    await app.close();
  });

  async function criarTransacao(body: Record<string, unknown>) {
    const res = await request(app.getHttpServer())
      .post('/transactions')
      .set('Authorization', `Bearer ${adminToken}`)
      .send(body)
      .expect(201);
    return res.body;
  }

  it('rejeita valor negativo na criação (400)', async () => {
    await request(app.getHttpServer())
      .post('/transactions')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ tipo: 'ENTRADA', categoria: 'DIZIMO', valor: -50 })
      .expect(400);
  });

  it('rejeita tipo inválido (400)', async () => {
    await request(app.getHttpServer())
      .post('/transactions')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ tipo: 'TRANSFERENCIA', categoria: 'DIZIMO', valor: 50 })
      .expect(400);
  });

  it('calcula o balanço mensal em tempo real a partir do histórico', async () => {
    const ent = await criarTransacao({
      tipo: 'ENTRADA',
      categoria: 'DIZIMO',
      valor: 123.45,
      descricao: 'e2e entrada',
    });
    const sai = await criarTransacao({
      tipo: 'SAIDA',
      categoria: 'CONTAS',
      valor: 23.45,
      descricao: 'e2e saída',
    });

    const res = await request(app.getHttpServer())
      .get(`/reports/monthly/${ano}/${mes}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);

    expect(res.body.mes).toBe(mes);
    expect(res.body.ano).toBe(ano);
    expect(res.body.totalEntradas).toBeGreaterThanOrEqual(123.45);
    expect(res.body.totalSaidas).toBeGreaterThanOrEqual(23.45);
    expect(res.body.saldoFinal).toBe(
      res.body.saldoInicial + res.body.totalEntradas - res.body.totalSaidas,
    );
    expect(res.body.porCategoria).toBeInstanceOf(Array);

    // limpeza das transações criadas no teste
    await prisma.transaction.deleteMany({
      where: { id: { in: [ent.id, sai.id] } },
    });
  });

  it('gera o PDF do balanço e permite download', async () => {
    const gerado = await request(app.getHttpServer())
      .post(`/reports/monthly/${ano}/${mes}/pdf`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);

    expect(gerado.body.reportId).toBeDefined();
    expect(gerado.body.pdfUrl).toContain(`/reports/monthly/${ano}/${mes}/pdf`);

    const download = await request(app.getHttpServer())
      .get(`/reports/monthly/${ano}/${mes}/pdf`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200)
      .buffer(true)
      .parse((res, cb) => {
        const chunks: Buffer[] = [];
        res.on('data', (c: Buffer) => chunks.push(c));
        res.on('end', () => cb(null, Buffer.concat(chunks)));
      });

    expect(download.headers['content-type']).toContain('application/pdf');
    expect(download.body.subarray(0, 4).toString()).toBe('%PDF');
  });

  it('regenerar o PDF do mesmo mês sobrescreve (mesmo reportId)', async () => {
    const primeiro = await request(app.getHttpServer())
      .post(`/reports/monthly/${ano}/${mes}/pdf`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);

    const segundo = await request(app.getHttpServer())
      .post(`/reports/monthly/${ano}/${mes}/pdf`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);

    expect(segundo.body.reportId).toBe(primeiro.body.reportId);

    const relatorios = await prisma.financialReport.findMany({
      where: { mes, ano },
    });
    expect(relatorios).toHaveLength(1);
  });
});
