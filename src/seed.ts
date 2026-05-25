import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  const email = 'admin@campusconnect.com';
  const existing = await prisma.user.findUnique({ where: { email } });

  if (existing) {
    console.log('✅ Admin user already exists:', email);
    return;
  }

  const hashedPassword = await bcrypt.hash('Admin@123', 10);
  const admin = await prisma.user.create({
    data: {
      name: 'Campus Admin',
      email,
      password: hashedPassword,
      role: 'ADMIN',
    },
  });

  console.log('🌱 Admin user created successfully!');
  console.log(`   Email:    ${admin.email}`);
  console.log(`   Password: Admin@123`);
  console.log(`   ID:       ${admin.id}`);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(async () => { await prisma.$disconnect(); });
