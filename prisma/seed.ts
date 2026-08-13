import 'dotenv/config';
import { PrismaClient } from '../src/generated/prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import * as bcrypt from 'bcrypt';
import { Role } from '../src/generated/prisma/enums';

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});

async function main() {
  const email = process.env.ADMIN_SEED_EMAIL ?? 'admin@ibjt.com.br';
  const password = process.env.ADMIN_SEED_PASSWORD ?? 'Admin@123';
  const nome = process.env.ADMIN_SEED_NOME ?? 'Administrador';

  const senhaHash = await bcrypt.hash(password, 12);

  const admin = await prisma.user.upsert({
    where: { email },
    update: { role: Role.ADMIN, senhaHash },
    create: {
      nome,
      email,
      senhaHash,
      role: Role.ADMIN,
    },
  });

  console.log(`Usuário ADMIN garantido: ${admin.email} (${admin.id})`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());