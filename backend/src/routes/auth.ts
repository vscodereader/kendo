import { Router } from 'express';
import passport from '../auth/passport.js';
import { prisma } from '../lib/prisma.js';
import { requireAuth } from '../auth/requireAuth.js';
import {
  buildActiveClubContext,
  canLead,
  canManageRoster,
  isRootUser,
  normalizeClubRole,
  normalizeTrainingType,
  sanitizeNullableInt,
  sanitizeNullableString
} from '../lib/club.js';

const router = Router();
const clientUrl = process.env.CLIENT_URL ?? 'http://localhost:5173';

router.get('/google', passport.authenticate('google', { scope: ['profile', 'email'] }));

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

        const profileCompleted = Boolean(
          current.studentId &&
            current.displayName &&
            current.department &&
            current.agreedPersonalPolicyAt
        );

        if (!profileCompleted) {
          res.redirect(`${clientUrl}/profile-setup`);
          return;
        }

        res.redirect(`${clientUrl}/main`);
      } catch (error) {
        next(error);
      }
    });
  })(req, res, next);
});

router.get('/me', async (req, res, next) => {
  try {
    if (!req.isAuthenticated() || !req.user?.id) {
      res.json({ authenticated: false, user: null });
      return;
    }

    const context = await buildActiveClubContext(req.user.id);
    if (!context?.user) {
      res.json({ authenticated: false, user: null });
      return;
    }

    const { user, activeMember, latestRoster } = context;
    const root = isRootUser(user);
    const profileCompleted = Boolean(
      user.studentId &&
        user.displayName &&
        user.department &&
        user.agreedPersonalPolicyAt
    );
    const clubRole = root ? '관리자' : normalizeClubRole(activeMember?.role ?? '일반');

    res.json({
      authenticated: true,
      user: {
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
        clubRole,
        clubRoleDetail: root ? 'Admin' : activeMember?.roleDetail ?? null,
        activeRosterId: latestRoster?.id ?? null,
        memberId: activeMember?.id ?? null,
        isRoot: root,
        systemRole: root ? 'ROOT' : 'USER',
        permissions: {
          canManageRoster: canManageRoster(clubRole),
          canManageMoney: canManageRoster(clubRole),
          canLead: canLead(clubRole)
        }
      }
    });
  } catch (error) {
    next(error);
  }
});

router.post('/profile-setup', requireAuth, async (req, res, next) => {
  try {
    const current = await prisma.user.findUnique({ where: { id: req.user!.id } });
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

    const updated = await prisma.user.update({
      where: { id: req.user!.id },
      data: {
        studentId: normalizedStudentId,
        displayName: normalizedDisplayName,
        grade: normalizedGrade,
        age: normalizedAge,
        trainingType: normalizedTrainingType,
        department: normalizedDepartment,
        agreedPersonalPolicyAt: new Date()
      }
    });

    const context = await buildActiveClubContext(updated.id);
    const activeMember = context?.activeMember;
    const clubRole = root ? '관리자' : normalizeClubRole(activeMember?.role ?? '일반');

    res.json({
      ok: true,
      user: {
        id: updated.id,
        email: updated.email,
        googleName: updated.googleName,
        googleImage: updated.googleImage,
        displayName: updated.displayName,
        studentId: updated.studentId,
        grade: updated.grade,
        age: updated.age,
        trainingType: normalizeTrainingType(updated.trainingType),
        department: updated.department ?? null,
        profileCompleted: true,
        clubRole,
        clubRoleDetail: root ? 'Admin' : activeMember?.roleDetail ?? null,
        memberId: activeMember?.id ?? null,
        isRoot: root,
        systemRole: root ? 'ROOT' : 'USER',
        permissions: {
          canManageRoster: root ? true : canManageRoster(clubRole),
          canManageMoney: root ? true : canManageRoster(clubRole),
          canLead: root ? true : canLead(clubRole)
        }
      }
    });
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
