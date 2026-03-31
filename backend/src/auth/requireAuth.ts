import type { Request, Response, NextFunction } from 'express';
import { prisma } from '../lib/prisma.js';
import { verifyMobileToken } from '../lib/mobileAuth.js';
import {
  buildActiveClubContext,
  canManageRoster,
  isRootUser,
  normalizeApprovalStatus,
  normalizeClubRole
} from '../lib/club.js';

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

export async function requireApprovedClubAccess(req: Request, res: Response, next: NextFunction) {
  await requireAuth(req, res, async () => {
    const authUserId = req.user?.id;
    if (!authUserId) {
      res.status(401).json({ message: '로그인이 필요합니다.' });
      return;
    }

    const context = await buildActiveClubContext(authUserId);
    if (!context?.user) {
      res.status(401).json({ message: '로그인이 필요합니다.' });
      return;
    }

    const root = isRootUser(context.user);
    const role = root ? '관리자' : normalizeClubRole(context.activeMember?.role ?? '일반');
    const approvalStatus = root ? 'APPROVED' : normalizeApprovalStatus(context.user.approvalStatus);
    const canReviewApplicants = root ? true : canManageRoster(role);

    if (root || approvalStatus === 'APPROVED' || canReviewApplicants) {
      next();
      return;
    }

    if (approvalStatus === 'REJECTED') {
      res.status(403).json({
        message: '거절되었습니다! 다시 프로필을 입력해 주세요.',
        code: 'APPROVAL_REJECTED',
        approvalStatus
      });
      return;
    }

    res.status(403).json({
      message: '승인된 동아리원만 확인할 수 있습니다.',
      code: 'APPROVAL_REQUIRED',
      approvalStatus
    });
  });
}