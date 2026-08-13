# IBJT — Backend (API de Gestão)

API REST do sistema de gestão da **Igreja Batista Jesus Transforma (IBJT)**:
membros, células, finanças, relatórios mensais (PDF), dashboard e base para
integração futura com WhatsApp.

## Stack

- **Node.js** (>= 20.19) + **NestJS 11**
- **PostgreSQL** + **Prisma 7** (driver adapter `@prisma/adapter-pg`)
- **Swagger/OpenAPI** em `/api/docs`
- **JWT** (access 15min + refresh 7d rotativo), **bcrypt** (12 rounds),
  **helmet**, CORS restrito e **rate limiting** nas rotas de auth
- **Puppeteer** para geração de PDFs dos balanços mensais
- **Jest** (unitários + e2e)

## Estrutura de módulos

```
src/
├── auth/        # login, refresh (rotação), logout, estratégias JWT
├── users/       # gestão de usuários (papéis) — ADMIN
├── members/     # CRUD de membros + LGPD (export/anonimização)
├── cells/       # CRUD de células (contagem de membros)
├── finance/     # transações (entradas/saídas)
├── reports/     # balanço mensal + PDF (StorageProvider: local/S3)
├── dashboard/   # totais rápidos
├── whatsapp/    # stub (rota reservada) — ver src/whatsapp/README.md
├── common/      # guards (JWT/RBAC), decorators, filtro de exceções Prisma,
│                # interceptor de serialização (Decimal → number)
└── generated/   # client Prisma gerado (não versionar)
```

## Setup

### 1. Pré-requisitos

- Node.js >= 20.19 (recomendado 22+)
- Docker (para o Postgres) **ou** um Postgres local

### 2. Subir o banco

```bash
docker compose up -d
```

> O `docker-compose.yml` publica o Postgres na porta **5434** para não
> conflitar com outros Postgres locais. Ajuste em `.env` se preferir.

### 3. Configurar variáveis de ambiente

```bash
cp .env.example .env
```

Edite `DATABASE_URL` (usuário/senha/porta do seu Postgres) e troque os
segredos de JWT. O `.env.example` já vem alinhado com o `docker-compose.yml`.

### 4. Instalar dependências

```bash
npm install
```

> Se o download do Chromium (puppeteer) não ocorrer durante o install,
> rode `npx puppeteer browsers install chrome`.

### 5. Migrar e popular o banco

```bash
npx prisma migrate dev        # aplica a migration inicial
npx prisma db seed            # cria o usuário ADMIN padrão
```

Usuário ADMIN padrão (definido por `ADMIN_SEED_EMAIL`/`ADMIN_SEED_PASSWORD`):

```
e-mail: admin@ibjt.com.br
senha:  Admin@123
```

**Importante:** troque a senha padrão em produção.

### 6. Rodar em desenvolvimento

```bash
npm run start:dev
```

- API: `http://localhost:3000`
- Swagger: `http://localhost:3000/api/docs`

### Scripts úteis

```bash
npm run build            # compila (dist/)
npm run lint             # eslint
npm test                 # testes unitários
npm run test:e2e         # testes e2e (exige banco rodando e .env)
npm run prisma:studio    # Prisma Studio
npm run prisma:migrate   # nova migration (dev)
npm run prisma:seed      # seed
```

## Autenticação e RBAC

`POST /auth/login` retorna `accessToken` (15min) + `refreshToken` (7d).
Use o access token como `Authorization: Bearer <token>`. Quando expirar,
chame `POST /auth/refresh` com o corpo `{ "refreshToken": "..." }` — o par é
**rotacionado** (o antigo é revogado). `POST /auth/logout` revoga o refresh.

| Papel          | Acesso                                                                 |
| -------------- | ---------------------------------------------------------------------- |
| `ADMIN`        | Tudo.                                                                  |
| `TESOUREIRO`   | `finance`, `reports`, `dashboard` e **leitura** de `members`.          |
| `LIDER_CELULA` | Somente as células em que é líder e os membros vinculados (filtro aplicado **sempre no backend** pelo `liderId`). Sem acesso a finanças. |

## Regras de negócio principais

- **Valor de transação é sempre positivo** — quem define entrada/saída é o
  campo `tipo` (`ENTRADA`/`SAIDA`).
- **Saldo é sempre calculado** a partir do histórico; `FinancialReport` guarda
  apenas um snapshot mensal (com `@@unique([mes, ano])`, gerar de novo
  **sobrescreve**).
- **Deletar célula** desvincula os membros (`cellId = null`), nunca os deleta.
- **Deletar membro** é soft delete (`status = INATIVO`).
- `email`, `telefone` e `cpf` de membros são únicos (opcionais).
- Cada transação guarda `criadoPorId` (auditoria).

## LGPD

- Campo `consentimentoLGPD` em cada membro.
- `GET /members/:id/export` — exporta todos os dados pessoais do membro.
- `POST /members/:id/anonymize` — anonimiza os dados (irreversível, ADMIN).
- `senhaHash` e dados desnecessários nunca são expostos nas respostas.

## Armazenamento de PDFs

- `STORAGE_PROVIDER=local` (padrão): salva em `storage/reports` e o download
  é feito pelo endpoint `GET /reports/monthly/:ano/:mes/pdf`.
- `STORAGE_PROVIDER=s3`: placeholder (implemente o provider em
  `src/reports/storage/s3-storage.provider.ts`) sem alterar a lógica de
  geração do relatório.

## WhatsApp

Não implementado — apenas stub. Veja `src/whatsapp/README.md`.

## Testes

- **Unitários** (`src/**/*.spec.ts`): auth (login/refresh/RBAC), criação de
  transação (validação de tipo/valor), regra de exclusão de célula.
- **E2E** (`test/`): fluxo de autenticação completo e geração do relatório
  mensal contra o banco real.

```bash
npm test         # unitários
npm run test:e2e # e2e (Postgres via docker compose + seed)
```
