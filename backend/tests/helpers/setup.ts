import { afterAll, beforeEach } from 'vitest';
import { prisma } from '../../src/config/prisma';
import { resetDb } from './db';

// Each test starts from an empty database.
beforeEach(async () => {
  await resetDb();
});

afterAll(async () => {
  await prisma.$disconnect();
});
