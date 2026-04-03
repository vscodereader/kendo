import { Router } from 'express';
import passport from '../auth/passport.js';
import { prisma } from '../lib/prisma.js';
import { attachMobileUser, requireAuth } from '../auth/requireAuth.js';
import {
  buildActiveClubContext,
  canLead,
  canManageRoster,
  isProfileCompletedUser,
  isRootUser,
  normalizeApprovalStatus,
  normalizeClubRole,
  normalizeTrainingType,
  sanitizeNullableInt,
  sanitizeNullableString
} from '../lib/club.js';
import {
  signMobileLoginCode,
  signMobileOAuthState,
  signMobileToken,
  verifyMobileLoginCode,
  verifyMobileOAuthState
} from '../lib/mobileAuth.js';
import { countPendingApprovalApplicants, sendPendingApprovalDigestMail } from '../services/approvalMailer.js';
import { registerPushDevice, sendPushNotification } from '../services/pushNotifications.js';

const router = Router();
const clientUrl = process.env.CLIENT_URL ?? 'http://localhost:5173';

async function buildAuthUserPayload(authUserId: string) {
  const context = await buildActiveClubContext(authUserId);
  if (!context?.user) {
    return null;
  }

  const { user, activeMember, latestRoster } = context;
  const root = isRootUser(user);
  const profileCompleted = isProfileCompletedUser(user);
  const clubRole = root ? '관리자' : normalizeClubRole(activeMember?.role ?? '일반');
  const approvalStatus = root ? 'APPROVED' : normalizeApprovalStatus(user.approvalStatus);
  const canReviewApplicants = root ? true : canManageRoster(clubRole);
  const approvalQueueCount = canReviewApplicants ? await countPendingApprovalApplicants() : 0;
  const canAccessClubContent = root || approvalStatus === 'APPROVED' || canReviewApplicants;

  return {
    id: user.id,
    email: user.email,
    googleName: user.googleName,
    googleImage: user.googleImage,
    displayName: root ? 'Admin' : user.displayName,
    studentId: root ? null : user.studentId,
    grade: root ? null : user.grade,
    age: root ? null : user.age,
    trainingType: root ? '기본' : normalizeTrainingType(user.trainingType),
    department: root ? null : user.department ?? null,
    profileCompleted,
    approvalStatus,
    approvalRequestedAt: user.approvalRequestedAt,
    approvedAt: user.approvedAt,
    rejectedAt: user.rejectedAt,
    canAccessClubContent,
    approvalQueueCount,
    clubRole,
    clubRoleDetail: root ? 'Admin' : activeMember?.roleDetail ?? null,
    activeRosterId: latestRoster?.id ?? null,
    memberId: activeMember?.id ?? null,
    isRoot: root,
    systemRole: root ? 'ROOT' : 'USER',
    permissions: {
      canManageRoster: root ? true : canManageRoster(clubRole),
      canManageMoney: root ? true : canManageRoster(clubRole),
      canLead: root ? true : canLead(clubRole),
      canReviewApplicants
    }
  };
}

router.get('/google/mobile', (req, res, next) => {
  try {
    const redirectUri = String(req.query.redirect_uri || 'kendoapp://auth/login/callback');
    const state = signMobileOAuthState(redirectUri);

    passport.authenticate('google', {
      scope: ['profile', 'email'],
      state,
      prompt: 'select_account'
    })(req, res, next);
  } catch (error) {
    next(error);
  }
});

router.post('/push/register', async (req, res, next) => {
  try {
    if (!req.user?.id && req.headers.authorization) {
      await attachMobileUser(req);
    }

    const sessionUserId = req.user?.id ?? null;
    const { installationId, pushToken, platform, appVersion } = req.body as {
      installationId?: string;
      pushToken?: string;
      platform?: string;
      appVersion?: string;
    };

    const saved = await registerPushDevice({
      installationId: String(installationId ?? ''),
      pushToken: String(pushToken ?? ''),
      platform: String(platform ?? ''),
      appVersion: appVersion ?? null,
      userId: sessionUserId
    });

    res.json({ ok: true, id: saved.id });
  } catch (error) {
    next(error);
  }
});

router.post('/mobile/exchange', async (req, res, next) => {
  try {
    const { code } = req.body as { code?: string };

    if (!code) {
      res.status(400).json({ message: 'code가 필요합니다.' });
      return;
    }

    const payload = verifyMobileLoginCode(code);
    if (payload.type !== 'mobile-login-code') {
      res.status(400).json({ message: '유효하지 않은 로그인 코드입니다.' });
      return;
    }

    const authUser = await buildAuthUserPayload(payload.sub);
    if (!authUser) {
      res.status(404).json({ message: '사용자를 찾을 수 없습니다.' });
      return;
    }

    const token = signMobileToken(authUser.id);

    res.json({
      authenticated: true,
      token,
      user: authUser
    });
  } catch (error) {
    next(error);
  }
});

router.get('/google', passport.authenticate('google', {
  scope: ['profile', 'email'],
  prompt: 'select_account'
}));

router.get('/google/callback', (req, res, next) => {
  passport.authenticate('google', (error: unknown, user: Express.User | false, info?: { message?: string }) => {
    if (error) {
      next(error);
      return;
    }

    if (!user) {
      const errorKey = info?.message === 'banned' ? 'banned' : 'google';
      res.redirect(`${clientUrl}/login?error=${encodeURIComponent(errorKey)}`);
      return;
    }

    req.logIn(user, async (loginError) => {
      if (loginError) {
        next(loginError);
        return;
      }

      try {
        const current = await prisma.user.findUnique({
          where: { id: req.user!.id }
        });

        if (!current) {
          res.redirect(`${clientUrl}/login?error=${encodeURIComponent('google')}`);
          return;
        }

        const profileCompleted = isProfileCompletedUser(current);
        const approvalStatus = isRootUser(current) ? 'APPROVED' : normalizeApprovalStatus(current.approvalStatus);

        const rawState = typeof req.query.state === 'string' ? req.query.state : '';
        let mobileRedirectUri: string | null = null;

        if (rawState) {
          try {
            const statePayload = verifyMobileOAuthState(rawState);
            if (statePayload.type === 'mobile-oauth-state') {
              mobileRedirectUri = statePayload.redirectUri;
            }
          } catch {
            mobileRedirectUri = null;
          }
        }

        const nextPath = !profileCompleted || approvalStatus === 'REJECTED' ? '/profile-setup' : '/main';

        if (mobileRedirectUri) {
          const code = signMobileLoginCode(current.id, nextPath);
          res.redirect(`${mobileRedirectUri}?code=${encodeURIComponent(code)}`);
          return;
        }

        res.redirect(`${clientUrl}${nextPath}`);
      } catch (callbackError) {
        next(callbackError);
      }
    });
  })(req, res, next);
});

router.get('/me', async (req, res, next) => {
  try {
    if (!req.user?.id && req.headers.authorization) {
      await attachMobileUser(req);
    }

    const authUserId = req.user?.id;

    if (!authUserId && !req.isAuthenticated()) {
      res.json({ authenticated: false, user: null });
      return;
    }

    if (!authUserId) {
      res.json({ authenticated: false, user: null });
      return;
    }

    const authUser = await buildAuthUserPayload(authUserId);
    if (!authUser) {
      res.json({ authenticated: false, user: null });
      return;
    }

    res.json({ authenticated: true, user: authUser });
  } catch (error) {
    next(error);
  }
});

router.post('/profile-setup', requireAuth, async (req, res, next) => {
  try {
    const current = await prisma.user.findUnique({ where: { id: req.user!.id } });
    if (!current) {
      res.status(404).json({ message: '사용자를 찾을 수 없습니다.' });
      return;
    }

    const root = isRootUser(current);
    const { studentId, displayName, agreePersonalPolicy, grade, age, trainingType, department } = req.body as {
      studentId?: string;
      displayName?: string;
      agreePersonalPolicy?: boolean;
      grade?: string | number;
      age?: string | number;
      trainingType?: string;
      department?: string;
    };

    const normalizedStudentId = String(studentId ?? '').trim();
    const normalizedDisplayName = String(displayName ?? '').trim();
    const normalizedGrade = sanitizeNullableInt(grade);
    const normalizedAge = sanitizeNullableInt(age);
    const normalizedTrainingType = normalizeTrainingType(trainingType);
    const normalizedDepartment = sanitizeNullableString(department);

    if (!/^\d{9}$/.test(normalizedStudentId)) {
      res.status(400).json({ message: '학번은 숫자 9자리여야 합니다.' });
      return;
    }

    if (!normalizedDisplayName || normalizedDisplayName.length > 10) {
      res.status(400).json({ message: '이름은 1자 이상 10자 이하로 입력해주세요.' });
      return;
    }

    if (/^(null|undefined)$/i.test(normalizedDisplayName)) {
      res.status(400).json({ message: '이름 형식이 올바르지 않습니다.' });
      return;
    }

    if (!normalizedDepartment || normalizedDepartment.length > 60) {
      res.status(400).json({ message: '학과를 1자 이상 60자 이하로 입력해주세요.' });
      return;
    }

    if (normalizedGrade !== null && (normalizedGrade < 1 || normalizedGrade > 10)) {
      res.status(400).json({ message: '학년은 1 이상의 숫자로 입력해주세요.' });
      return;
    }

    if (normalizedAge !== null && (normalizedAge < 1 || normalizedAge > 120)) {
      res.status(400).json({ message: '나이는 1 이상 120 이하로 입력해주세요.' });
      return;
    }

    if (!agreePersonalPolicy) {
      res.status(400).json({ message: '개인정보 이용 동의가 필요합니다.' });
      return;
    }

    const duplicate = await prisma.user.findFirst({
      where: {
        studentId: normalizedStudentId,
        NOT: { id: req.user!.id }
      }
    });

    if (duplicate) {
      res.status(400).json({ message: '이미 사용 중인 학번입니다.' });
      return;
    }

    const now = new Date();
    const updated = await prisma.user.update({
      where: { id: req.user!.id },
      data: {
        studentId: normalizedStudentId,
        displayName: normalizedDisplayName,
        grade: normalizedGrade,
        age: normalizedAge,
        trainingType: normalizedTrainingType,
        department: normalizedDepartment,
        agreedPersonalPolicyAt: now,
        approvalStatus: root ? 'APPROVED' : 'PENDING',
        approvalRequestedAt: root ? current.approvalRequestedAt ?? now : now,
        approvedAt: root ? current.approvedAt ?? now : null,
        rejectedAt: null
      }
    });

    const authUser = await buildAuthUserPayload(updated.id);
    if (!authUser) {
      res.status(404).json({ message: '사용자를 찾을 수 없습니다.' });
      return;
    }

    res.json({ ok: true, user: authUser });

    if (!root) {
      void sendPendingApprovalDigestMail('immediate').catch((mailError) => {
        console.error('[approval-mail] 즉시 승인 알림 메일 전송 실패', mailError);
      });

      void sendPushNotification({
        audience: 'reviewers',
        body: `${normalizedDisplayName}님이 가입 대기중이에요!`,
        targetPath: '/main'
      }).catch((pushError) => {
        console.error('[push] 가입 대기 알림 전송 실패', pushError);
      });
    }
  } catch (error) {
    next(error);
  }
});

router.post('/logout', (req, res, next) => {
  req.logout((logoutError) => {
    if (logoutError) {
      next(logoutError);
      return;
    }

    req.session.destroy((sessionError) => {
      if (sessionError) {
        next(sessionError);
        return;
      }

      res.clearCookie('coursechecker.sid');
      res.json({ ok: true });
    });
  });
});

export default router;