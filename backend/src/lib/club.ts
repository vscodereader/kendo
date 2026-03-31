import { prisma } from './prisma.js';

export const ROOT_ADMIN_EMAIL = (process.env.CLUB_CONTACT_EMAIL ?? '').trim().toLowerCase();
export const CLUB_ROLES = ['일반', '임원', '부회장', '회장', '관리자'] as const;
export const APPOINTABLE_ROLES = ['일반', '임원', '부회장', '회장'] as const;
export type ClubRole = (typeof CLUB_ROLES)[number];
export type AppointableClubRole = (typeof APPOINTABLE_ROLES)[number];
export const TRAINING_TYPES = ['기본', '호구'] as const;
export type TrainingType = (typeof TRAINING_TYPES)[number];
export const USER_SYSTEM_ROLES = ['USER', 'ROOT'] as const;
export type UserSystemRole = (typeof USER_SYSTEM_ROLES)[number];

export type ActiveClubContext = {
  user: Awaited<ReturnType<typeof prisma.user.findUnique>>;
  latestRoster: Awaited<ReturnType<typeof prisma.memberRoster.findFirst>>;
  activeMember: Awaited<ReturnType<typeof prisma.clubMember.findFirst>>;
};

export function nowInSeoul(date = new Date()) {
  const formatter = new Intl.DateTimeFormat('ko-KR', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  });

  const parts = Object.fromEntries(
    formatter
      .formatToParts(date)
      .filter((part) => part.type !== 'literal')
      .map((part) => [part.type, part.value])
  ) as Record<'year' | 'month' | 'day' | 'hour' | 'minute', string>;

  return {
    year: Number(parts.year),
    month: parts.month,
    day: parts.day,
    hour: parts.hour,
    minute: parts.minute,
    timestampLabel: `${parts.year}/${parts.month}/${parts.day}/${parts.hour}:${parts.minute}`,
    rosterTitle: `${parts.year}년 검도부 명단`,
    moneyTitle: `${parts.year}/${parts.month}/${parts.day}/${parts.hour}:${parts.minute}`
  };
}

export function normalizeClubRole(value: unknown): ClubRole {
  return CLUB_ROLES.includes(value as ClubRole) ? (value as ClubRole) : '일반';
}

export function normalizeAppointableRole(value: unknown): AppointableClubRole {
  return APPOINTABLE_ROLES.includes(value as AppointableClubRole) ? (value as AppointableClubRole) : '일반';
}

export function normalizeTrainingType(value: unknown): TrainingType {
  return TRAINING_TYPES.includes(value as TrainingType) ? (value as TrainingType) : '기본';
}

export function normalizeSystemRole(value: unknown): UserSystemRole {
  return USER_SYSTEM_ROLES.includes(value as UserSystemRole) ? (value as UserSystemRole) : 'USER';
}

export function isRootEmail(email: string | null | undefined) {
  return String(email ?? '').trim().toLowerCase() === ROOT_ADMIN_EMAIL;
}

export function isRootUser(user: { email?: string | null; systemRole?: string | null } | null | undefined) {
  if (!user) return false;
  return normalizeSystemRole(user.systemRole) === 'ROOT' || isRootEmail(user.email);
}

export async function syncRootSystemRole(userId: string) {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) return null;

  const shouldBeRoot = isRootEmail(user.email);
  const nextRole: UserSystemRole = shouldBeRoot ? 'ROOT' : 'USER';
  if (normalizeSystemRole(user.systemRole) === nextRole) return user;

  return prisma.user.update({
    where: { id: user.id },
    data: {
      systemRole: nextRole,
      displayName: shouldBeRoot ? 'Admin' : user.displayName
    }
  });
}

export async function getRootAdminUser() {
  const bySystemRole = await prisma.user.findFirst({
    where: { systemRole: 'ROOT' },
    orderBy: { createdAt: 'asc' }
  });
  if (bySystemRole) return bySystemRole;

  const byEmail = await prisma.user.findUnique({ where: { email: ROOT_ADMIN_EMAIL } });
  if (!byEmail) return null;

  if (normalizeSystemRole(byEmail.systemRole) !== 'ROOT') {
    return prisma.user.update({
      where: { id: byEmail.id },
      data: { systemRole: 'ROOT', displayName: 'Admin' }
    });
  }

  return byEmail;
}

export async function getLatestRoster() {
  return prisma.memberRoster.findFirst({
    where: { isActive: true },
    orderBy: [{ savedAt: 'desc' }, { createdAt: 'desc' }]
  });
}

export async function getLatestMoneySnapshot() {
  return prisma.moneyLedgerSnapshot.findFirst({
    where: { isActive: true },
    orderBy: [{ savedAt: 'desc' }, { createdAt: 'desc' }]
  });
}

export async function ensureLatestRosterExists(createdByUserId?: string | null) {
  const existing = await getLatestRoster();
  if (existing) return existing;

  const seoul = nowInSeoul();
  return prisma.memberRoster.create({
    data: {
      title: seoul.rosterTitle,
      rosterYear: seoul.year,
      isActive: true,
      createdByUserId: createdByUserId ?? null
    }
  });
}

export async function ensureLatestMoneySnapshotExists(createdByUserId?: string | null) {
  const existing = await getLatestMoneySnapshot();
  if (existing) return existing;

  const seoul = nowInSeoul();
  return prisma.moneyLedgerSnapshot.create({
    data: {
      title: seoul.moneyTitle,
      isActive: true,
      createdByUserId: createdByUserId ?? null,
      entries: { create: [] }
    }
  });
}

export async function ensureAdminMemberForRoster(rosterId: string) {
  const roster = await prisma.memberRoster.findUnique({ where: { id: rosterId } });
  const adminUser = await getRootAdminUser();
  if (!roster || !adminUser) return null;

  const existing = await prisma.clubMember.findFirst({
    where: {
      rosterId,
      OR: compactOr([
        { isAdmin: true },
        { linkedUserId: adminUser.id },
        adminUser.email ? { email: adminUser.email } : null
      ])
    }
  });

  const baseData = {
    linkedUserId: adminUser.id,
    email: adminUser.email,
    year: roster.rosterYear,
    studentId: null,
    grade: null,
    age: null,
    name: 'Admin',
    trainingType: '기본',
    department: null,
    role: '관리자',
    roleDetail: 'Admin',
    isAdmin: true
  } as const;

  if (existing) {
    return prisma.clubMember.update({
      where: { id: existing.id },
      data: baseData
    });
  }

  return prisma.clubMember.create({
    data: {
      rosterId,
      ...baseData
    }
  });
}

export function sanitizeNullableString(value: unknown) {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

export function sanitizeNullableInt(value: unknown) {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number(value);
  return Number.isInteger(parsed) ? parsed : null;
}

export async function buildActiveClubContext(userId: string): Promise<ActiveClubContext | null> {
  let user = await syncRootSystemRole(userId);
  if (!user) return null;

  const latestRoster = await ensureLatestRosterExists(user.id);
  await ensureAdminMemberForRoster(latestRoster.id);

  if (isRootUser(user)) {
    const adminMember = await prisma.clubMember.findFirst({
      where: { rosterId: latestRoster.id, isAdmin: true }
    });
    return { user, latestRoster, activeMember: adminMember };
  }

  let activeMember = await prisma.clubMember.findFirst({
    where: {
      rosterId: latestRoster.id,
      isAdmin: false,
      OR: compactOr([
        { linkedUserId: user.id },
        user.email ? { email: user.email } : null,
        user.studentId ? { studentId: Number(user.studentId) } : null
      ])
    }
  });

  const profileCompleted = Boolean(user.studentId && user.displayName && user.agreedPersonalPolicyAt);

  if (!activeMember && profileCompleted) {
    activeMember = await prisma.clubMember.create({
      data: {
        rosterId: latestRoster.id,
        linkedUserId: user.id,
        email: user.email,
        year: latestRoster.rosterYear,
        studentId: user.studentId ? Number(user.studentId) : null,
        grade: user.grade ?? null,
        age: user.age ?? null,
        name: user.displayName ?? user.googleName ?? user.email,
        trainingType: normalizeTrainingType(user.trainingType),
        department: user.department ?? null,
        role: '일반',
        roleDetail: null,
        isAdmin: false
      }
    });
  }

  if (activeMember && (!activeMember.linkedUserId || activeMember.email !== user.email)) {
    activeMember = await prisma.clubMember.update({
      where: { id: activeMember.id },
      data: {
        linkedUserId: user.id,
        email: user.email,
        name: user.displayName ?? activeMember.name,
        studentId: user.studentId ? Number(user.studentId) : activeMember.studentId,
        grade: user.grade ?? activeMember.grade,
        age: user.age ?? activeMember.age,
        trainingType: normalizeTrainingType(user.trainingType ?? activeMember.trainingType),
        department: user.department ?? activeMember.department ?? null,
        isAdmin: false
      }
    });
  }

  user = (await prisma.user.findUnique({ where: { id: user.id } })) ?? user;
  return { user, latestRoster, activeMember };
}

export function compactOr<T>(items: Array<T | null | undefined>) {
  return items.filter(Boolean) as T[];
}

export function canManageRoster(role: ClubRole | null | undefined) {
  return role === '임원' || role === '부회장' || role === '회장' || role === '관리자';
}

export function canLead(role: ClubRole | null | undefined) {
  return role === '부회장' || role === '회장' || role === '관리자';
}

export function isSameIdentity(
  actor: { linkedUserId?: string | null; email?: string | null; studentId?: number | null },
  row: { linkedUserId?: string | null; email?: string | null; studentId?: number | null }
) {
  if (actor.linkedUserId && row.linkedUserId && actor.linkedUserId === row.linkedUserId) return true;
  if (actor.email && row.email && actor.email === row.email) return true;
  if (actor.studentId && row.studentId && actor.studentId === row.studentId) return true;
  return false;
}
