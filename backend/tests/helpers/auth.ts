import { randomUUID } from 'node:crypto';
import jwt from 'jsonwebtoken';
import argon2 from 'argon2';
import type { UserRole } from '@prisma/client';
import { prisma } from '../../src/config/prisma';
import { env } from '../../src/config/env';

export function signAccessToken(id: string, role: UserRole): string {
  return jwt.sign({ id, role }, env.JWT_ACCESS_SECRET, { expiresIn: '15m' });
}

export function bearer(token: string): { Authorization: string } {
  return { Authorization: `Bearer ${token}` };
}

interface CreateUserOpts {
  role?: UserRole;
  email?: string;
  phone?: string;
  name?: string;
  /** When set, a real argon2 hash is stored so the login route works. */
  password?: string;
  /** Defaults to `true` — verified, so login works out of the box. Pass
   *  `false` to test the email-verification gate. */
  emailVerified?: boolean;
}

export async function createUser(opts: CreateUserOpts = {}) {
  const role = opts.role ?? 'CUSTOMER';
  const user = await prisma.user.create({
    data: {
      name: opts.name ?? `${role} User`,
      email: opts.email ?? `${role.toLowerCase()}-${randomUUID()}@test.dev`,
      phone: opts.phone,
      role,
      passwordHash: opts.password ? await argon2.hash(opts.password) : null,
      emailVerified: opts.emailVerified === false ? null : new Date(),
    },
  });
  return { user, token: signAccessToken(user.id, role), password: opts.password };
}

export const createCustomer = () => createUser({ role: 'CUSTOMER' });
export const createStaff = () => createUser({ role: 'STAFF' });
export const createAdmin = () => createUser({ role: 'ADMIN' });
