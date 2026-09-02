import argon2 from 'argon2';
import jwt from 'jsonwebtoken';
import { createHash, randomUUID } from 'crypto';
import { prisma } from '../../config/prisma';
import { env } from '../../config/env';
import { AppError } from '../../lib/AppError';
import { AuthedUser } from '../../middleware/auth.middleware';

interface TokenPair {
  accessToken: string;
  refreshToken: string;
}

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

function signAccessToken(user: AuthedUser) {
  return jwt.sign(user, env.JWT_ACCESS_SECRET, {
    expiresIn: env.JWT_ACCESS_TTL,
  } as jwt.SignOptions);
}

async function issueRefreshToken(userID: string): Promise<string> {
  const jti = randomUUID();
  const token = jwt.sign({ sub: userID, jti }, env.JWT_REFRESH_SECRET, {
    expiresIn: `${env.JWT_REFRESH_TTL_DAYS}d`,
  } as jwt.SignOptions);

  // Stored hashed (not the raw JWT) so a DB leak alone can't be replayed.
  // This is the Postgres-backed equivalent of the Redis `refresh:<jti>` key
  // pos-backend used — no Redis needed at this scale.
  await prisma.refreshToken.create({
    data: {
      userID,
      tokenHash: hashToken(token),
      expiresAt: new Date(Date.now() + env.JWT_REFRESH_TTL_DAYS * 24 * 60 * 60 * 1000),
    },
  });
  return token;
}

export async function register(input: { name: string; email?: string; phone?: string; password: string }) {
  const existing = await prisma.user.findFirst({
    where: {
      OR: [input.email ? { email: input.email } : {}, input.phone ? { phone: input.phone } : {}],
    },
  });
  if (existing) throw new AppError('CONFLICT', 'An account with this email or phone already exists');

  const passwordHash = await argon2.hash(input.password);
  const user = await prisma.user.create({
    data: {
      name: input.name,
      email: input.email,
      phone: input.phone,
      passwordHash,
      role: 'CUSTOMER',
    },
  });

  const accessToken = signAccessToken({ id: user.id, role: user.role });
  const refreshToken = await issueRefreshToken(user.id);
  return { accessToken, refreshToken, user };
}

export async function login(identifier: string, password: string): Promise<TokenPair> {
  const user = await prisma.user.findFirst({
    where: { OR: [{ email: identifier }, { phone: identifier }], deletedAt: null },
  });
  if (!user || !user.isActive || !user.passwordHash) {
    throw new AppError('UNAUTHORIZED', 'Invalid credentials');
  }
  const valid = await argon2.verify(user.passwordHash, password);
  if (!valid) throw new AppError('UNAUTHORIZED', 'Invalid credentials');

  const accessToken = signAccessToken({ id: user.id, role: user.role });
  const refreshToken = await issueRefreshToken(user.id);
  return { accessToken, refreshToken };
}

export async function refresh(refreshToken: string): Promise<TokenPair> {
  let payload: { sub: string; jti: string };
  try {
    payload = jwt.verify(refreshToken, env.JWT_REFRESH_SECRET) as { sub: string; jti: string };
  } catch {
    throw new AppError('UNAUTHORIZED', 'Invalid or expired refresh token');
  }

  const stored = await prisma.refreshToken.findUnique({ where: { tokenHash: hashToken(refreshToken) } });
  if (!stored || stored.revokedAt || stored.expiresAt < new Date()) {
    throw new AppError('UNAUTHORIZED', 'Refresh token has been revoked or expired');
  }

  // Rotate: revoke the old row, issue a new pair.
  await prisma.refreshToken.update({ where: { id: stored.id }, data: { revokedAt: new Date() } });

  const user = await prisma.user.findUnique({ where: { id: payload.sub } });
  if (!user || !user.isActive || user.deletedAt) {
    throw new AppError('UNAUTHORIZED', 'User no longer active');
  }

  const accessToken = signAccessToken({ id: user.id, role: user.role });
  const newRefreshToken = await issueRefreshToken(user.id);
  return { accessToken, refreshToken: newRefreshToken };
}

export async function logout(refreshToken: string): Promise<void> {
  const stored = await prisma.refreshToken.findUnique({ where: { tokenHash: hashToken(refreshToken) } });
  if (stored) {
    await prisma.refreshToken.update({ where: { id: stored.id }, data: { revokedAt: new Date() } });
  }
}
