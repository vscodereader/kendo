import type { Request, Response, NextFunction } from 'express';

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  if (!req.isAuthenticated() || !req.user?.id) {
    res.status(401).json({ message: '로그인이 필요합니다.' });
    return;
  }

  next();
}