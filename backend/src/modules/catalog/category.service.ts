import { prisma } from '../../config/prisma';
import { Department } from '@prisma/client';

export async function listCategories(department?: Department) {
  return prisma.category.findMany({
    where: { isActive: true, ...(department ? { department } : {}) },
    orderBy: { sortOrder: 'asc' },
    include: { children: { where: { isActive: true }, orderBy: { sortOrder: 'asc' } } },
  });
}
