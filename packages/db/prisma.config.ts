import 'dotenv/config';
import { defineConfig } from 'prisma/config';

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
  },
  datasource: {
    // migrations need a direct connection; Neon (Vercel Storage) exposes it as DATABASE_URL_UNPOOLED
    url: process.env['DATABASE_URL_UNPOOLED'] ?? process.env['DATABASE_URL'] ?? 'postgresql://goalbet@127.0.0.1:5434/goalbet',
  },
});
