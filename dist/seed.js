"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const client_1 = require("@prisma/client");
const bcryptjs_1 = __importDefault(require("bcryptjs"));
const prisma = new client_1.PrismaClient();
async function main() {
    const email = 'admin@campusconnect.com';
    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
        console.log('✅ Admin user already exists:', email);
        return;
    }
    const hashedPassword = await bcryptjs_1.default.hash('Admin@123', 10);
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
