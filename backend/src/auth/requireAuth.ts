import type { Request, Response, NextFunction } from 'express';
import { prisma } from '../lib/prisma.js';
import { verifyMobileToken } from '../lib/mobileAuth.js';

export async function attachMobileUser(req: Request) {
  if (req.user?.id) return;

  const authHeader = req.headers.authorization;

  if (!authHeader?.startsWith('Bearer ')) return;

  const token = authHeader.slice('Bearer '.length).trim();

  if (!token) return;

  try {
    const payload = verifyMobileToken(token);

    if (payload.type !== 'mobile-access') return;

    const user = await prisma.user.findUnique({
      where: { id: payload.sub },
      select: { id: true }
    });

    if (!user) return;

    req.user = { id: user.id } as Express.User;
  } catch {
    // ignore invalid token
  }
}

export async function requireAuth(req: Request, res: Response, next: NextFunction) {
  if (req.isAuthenticated?.() && req.user?.id) {
    next();
    return;
  }

  await attachMobileUser(req);

  if (!req.user?.id) {
    res.status(401).json({ message: '로그인이 필요합니다.' });
    return;
  }

  next();
}