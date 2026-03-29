import { Router } from 'express';
import type { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma.js';
import { requireAuth } from '../auth/requireAuth.js';
import {
  buildActiveClubContext,
  canManageRoster,
  ensureLatestMoneySnapshotExists,
  isSameIdentity,
  normalizeAppointableRole,
  normalizeClubRole,
  normalizeTrainingType,
  nowInSeoul,
  sanitizeNullableInt,
  sanitizeNullableString,
  type AppointableClubRole,
  type ClubRole
} from '../lib/club.js';
import multer from 'multer';

const router = Router();

router.get('/rosters', requireAuth, async (req, res, next) => {
  try {
    const context = await requireRosterManager(req.user!.id);
    if (!context.ok) {
      res.status(context.status).json({ message: context.message });
      return;
    }

    const items = await prisma.memberRoster.findMany({
      orderBy: [{ savedAt: 'desc' }, { createdAt: 'desc' }],
      include: {
        members: {
          select: { isAdmin: true }
        }
      }
    });

    res.json({
      latestRosterId: context.active.latestRoster?.id ?? null,
      items: items.map(toRosterSummary)
    });
  } catch (error) {
    next(error);
  }
});

router.get('/rosters/bootstrap', requireAuth, async (req, res, next) => {
  try {
    const context = await requireRosterManager(req.user!.id);
    if (!context.ok) {
      res.status(context.status).json({ message: context.message });
      return;
    }

    const requestedRosterId = sanitizeNullableString(req.query.rosterId);
    const items = await prisma.memberRoster.findMany({
      orderBy: [{ savedAt: 'desc' }, { createdAt: 'desc' }],
      include: {
        members: {
          select: { isAdmin: true }
        }
      }
    });

    const latestRosterId = context.active.latestRoster?.id ?? items[0]?.id ?? null;
    const selectedRosterId = requestedRosterId ?? latestRosterId;
    const roster = selectedRosterId
      ? await prisma.memberRoster.findUnique({
          where: { id: selectedRosterId },
          include: {
            members: {
              orderBy: [{ isAdmin: 'asc' }, { studentId: 'asc' }, { name: 'asc' }]
            }
          }
        })
      : null;

    res.json({
      latestRosterId,
      items: items.map(toRosterSummary),
      roster: roster ? serializeRoster(roster) : null
    });
  } catch (error) {
    next(error);
  }
});

router.get('/rosters/:rosterId', requireAuth, async (req, res, next) => {
  try {
    const context = await requireRosterManager(req.user!.id);
    if (!context.ok) {
      res.status(context.status).json({ message: context.message });
      return;
    }

    const roster = await prisma.memberRoster.findUnique({
      where: { id: String(req.params.rosterId) },
      include: {
        members: {
          orderBy: [{ isAdmin: 'asc' }, { studentId: 'asc' }, { name: 'asc' }]
        }
      }
    });

    if (!roster) {
      res.status(404).json({ message: '명단을 찾을 수 없습니다.' });
      return;
    }

    res.json(serializeRoster(roster));
  } catch (error) {
    next(error);
  }
});

router.get('/money-snapshots', requireAuth, async (req, res, next) => {
  try {
    const context = await requireRosterManager(req.user!.id);
    if (!context.ok) {
      res.status(context.status).json({ message: context.message });
      return;
    }

    const snapshots = await prisma.moneyLedgerSnapshot.findMany({
      orderBy: [{ savedAt: 'desc' }, { createdAt: 'desc' }],
      include: { _count: { select: { entries: true } } }
    });

    res.json({
      latestSnapshotId: snapshots.find((item: (typeof snapshots)[number]) => item.isActive)?.id ?? null,
      items: snapshots.map(toMoneySummary)
    });
  } catch (error) {
    next(error);
  }
});

router.get('/money-snapshots/bootstrap', requireAuth, async (req, res, next) => {
  try {
    const context = await requireRosterManager(req.user!.id);
    if (!context.ok) {
      res.status(context.status).json({ message: context.message });
      return;
    }

    const requestedSnapshotId = sanitizeNullableString(req.query.snapshotId);
    const latestSnapshot = await ensureLatestMoneySnapshotExists(req.user!.id);
    const snapshots = await prisma.moneyLedgerSnapshot.findMany({
      orderBy: [{ savedAt: 'desc' }, { createdAt: 'desc' }],
      include: { _count: { select: { entries: true } } }
    });

    const latestSnapshotId = snapshots.find((item: (typeof snapshots)[number]) => item.isActive)?.id ?? latestSnapshot.id;
    const selectedSnapshotId = requestedSnapshotId ?? latestSnapshotId;
    const snapshot = selectedSnapshotId
      ? await prisma.moneyLedgerSnapshot.findUnique({
          where: { id: selectedSnapshotId },
          include: {
            entries: {
              orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }]
            }
          }
        })
      : null;

    res.json({
      latestSnapshotId,
      items: snapshots.map(toMoneySummary),
      snapshot: snapshot ? serializeMoneySnapshot(snapshot) : null
    });
  } catch (error) {
    next(error);
  }
});

router.get('/money-snapshots/:snapshotId', requireAuth, async (req, res, next) => {
  try {
    const context = await requireRosterManager(req.user!.id);
    if (!context.ok) {
      res.status(context.status).json({ message: context.message });
      return;
    }

    const snapshot = await prisma.moneyLedgerSnapshot.findUnique({
      where: { id: String(req.params.snapshotId) },
      include: {
        entries: {
          orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }]
        }
      }
    });

    if (!snapshot) {
      res.status(404).json({ message: '회비 내역을 찾을 수 없습니다.' });
      return;
    }

    res.json(serializeMoneySnapshot(snapshot));
  } catch (error) {
    next(error);
  }
});

router.get('/pages/:slug', requireAuth, async (req, res, next) => {
  try {
    const slug = normalizePageSlug(String(req.params.slug));
    if (!slug) {
      res.status(404).json({ message: '페이지를 찾을 수 없습니다.' });
      return;
    }

    const active = await buildActiveClubContext(req.user!.id);

    if (!active || !active.user) {
  res.status(403).json({ message: '권한이 없습니다.' });
  return;
}

if (!canViewBoardPage(active, slug)) {
      res.status(403).json({ message: '권한이 없습니다.' });
      return;
    }

    const page = await ensureBoardPage(slug);

    res.json(serializeBoardPage(page, canEditBoardPage(active)));
  } catch (error) {
    next(error);
  }
});

router.put('/pages/:slug', requireAuth, async (req, res, next) => {
  try {
    const slug = normalizePageSlug(String(req.params.slug));
    if (!slug) {
      res.status(404).json({ message: '페이지를 찾을 수 없습니다.' });
      return;
    }

    const active = await buildActiveClubContext(req.user!.id);

    if (!active || !active.user) {
      res.status(403).json({ message: '권한이 없습니다.' });
      return;
    }

    if (!canViewBoardPage(active, slug)) {
      res.status(403).json({ message: '권한이 없습니다.' });
      return;
    }

    const { title, bodyHtml, placeName, address, mapLink } = req.body as {
      title?: string;
      bodyHtml?: string;
      placeName?: string;
      address?: string;
      mapLink?: string;
    };

    const nextTitle = sanitizeNullableString(title);
    const nextPlaceName = sanitizeNullableString(placeName);
    const nextAddress = sanitizeNullableString(address);
    const nextMapLink = sanitizeNullableString(mapLink);
    const nextBodyHtml = String(bodyHtml ?? '').trim();

    if (!nextTitle) {
      res.status(400).json({ message: '제목을 입력해주세요.' });
      return;
    }

    if (!nextBodyHtml) {
      res.status(400).json({ message: '본문 내용을 입력해주세요.' });
      return;
    }

    const updated = await prisma.clubPageContent.upsert({
      where: { slug },
      update: {
        title: nextTitle,
        bodyHtml: nextBodyHtml,
        placeName: nextPlaceName,
        address: nextAddress,
        mapLink: nextMapLink,
        updatedByUserId: req.user!.id
      },
      create: {
        slug,
        title: nextTitle,
        bodyHtml: nextBodyHtml,
        placeName: nextPlaceName,
        address: nextAddress,
        mapLink: nextMapLink,
        updatedByUserId: req.user!.id
      }
    });

    res.json(serializeBoardPage(updated, true));
  } catch (error) {
    next(error);
  }
});

router.post('/rosters/save', requireAuth, async (req, res, next) => {
  try {
    const context = await requireRosterManager(req.user!.id);
    if (!context.ok) {
      res.status(context.status).json({ message: context.message });
      return;
    }

    const { baseRosterId, members, title, mode } = req.body as {
      baseRosterId?: string | null;
      members?: Array<Record<string, unknown>>;
      title?: string | null;
      mode?: 'overwrite' | 'clone';
    };

    const normalizedMode = mode === 'overwrite' ? 'overwrite' : 'clone';

    if (!Array.isArray(members) || members.length === 0) {
      res.status(400).json({ message: '저장할 동아리원 명단이 없습니다.' });
      return;
    }

    const baseRoster = baseRosterId
      ? await prisma.memberRoster.findUnique({
          where: { id: baseRosterId },
          include: { members: true }
        })
      : await prisma.memberRoster.findUnique({
          where: { id: context.active.latestRoster!.id },
          include: { members: true }
        });

    if (!baseRoster) {
      res.status(404).json({ message: '기준 명단을 찾을 수 없습니다.' });
      return;
    }

    const normalizedRows = members
      .map(normalizeSubmittedMemberRow)
      .filter((row) => !row.isAdmin && row.name);

    if (normalizedRows.length === 0) {
      res.status(400).json({ message: '이름이 있는 동아리원이 최소 1명 이상 필요합니다.' });
      return;
    }

    const originalRows = baseRoster.members.filter((row: (typeof baseRoster.members)[number]) => !row.isAdmin);
    const originalMap = new Map<string, (typeof originalRows)[number]>(
      originalRows.map((item: (typeof originalRows)[number]) => [item.id, item])
    );
    const actorRole = normalizeClubRole(context.active.activeMember?.role ?? '일반');

    if (actorRole === '회장') {
      const actorSubmitted = findActorSubmittedRow(context.active, normalizedRows);
      const newlyPromotedPresident = normalizedRows.find((row) => {
        const before = row.id ? originalMap.get(row.id) : null;
        return !isActorRow(context.active, row) && row.role === '회장' && normalizeClubRole(before?.role) !== '회장';
      });

      if (newlyPromotedPresident && actorSubmitted && actorSubmitted.role === '회장') {
        actorSubmitted.role = '임원';
      }
    }

    const validationMessage = validateRosterSave({
      actorRole,
      actor: context.active,
      originalRows,
      submittedRows: normalizedRows
    });

    if (validationMessage) {
      res.status(400).json({ message: validationMessage });
      return;
    }

    const normalizedTitle = sanitizeNullableString(title);
    const seoul = nowInSeoul();

    const adminUser = await prisma.user.findFirst({
      where: { systemRole: 'ROOT' },
      orderBy: { createdAt: 'asc' }
    });

    const removedRows = originalRows.filter((row: (typeof originalRows)[number]) => !normalizedRows.some((item) => isSameIdentity(item, row)));

    const savedRoster = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      let rosterId: string;

      if (normalizedMode === 'overwrite') {
        await tx.memberRoster.updateMany({
          where: {
            isActive: true,
            id: { not: baseRoster.id }
          },
          data: {
            isActive: false
          }
        });

        await tx.clubMember.deleteMany({
          where: {
            rosterId: baseRoster.id,
            isAdmin: false
          }
        });

        await tx.memberRoster.update({
          where: { id: baseRoster.id },
          data: {
            title: baseRoster.title,
            rosterYear: seoul.year,
            savedAt: new Date(),
            isActive: true,
            members: {
              create: normalizedRows.map((row) => ({
                linkedUserId: row.linkedUserId,
                email: row.email,
                year: row.year ?? seoul.year,
                studentId: row.studentId,
                department: row.department,
                grade: row.grade,
                age: row.age,
                name: row.name,
                trainingType: row.trainingType,
                role: row.role,
                roleDetail: row.role === '임원' ? row.roleDetail : null,
                isAdmin: false
              }))
            }
          }
        });

        rosterId = baseRoster.id;

        const existingAdmin = await tx.clubMember.findFirst({
          where: { rosterId, isAdmin: true }
        });

        if (!existingAdmin && adminUser) {
          await tx.clubMember.create({
            data: {
              rosterId,
              linkedUserId: adminUser.id,
              email: adminUser.email,
              year: seoul.year,
              studentId: null,
              grade: null,
              age: null,
              name: 'Admin',
              trainingType: '기본',
              department: null,
              role: '관리자',
              roleDetail: 'Admin',
              isAdmin: true
            }
          });
        }
      } else {
        await tx.memberRoster.updateMany({
          where: { isActive: true },
          data: { isActive: false }
        });

        const created = await tx.memberRoster.create({
          data: {
            title: normalizedTitle ?? seoul.rosterTitle,
            rosterYear: seoul.year,
            savedAt: new Date(),
            isActive: true,
            createdByUserId: req.user!.id,
            members: {
              create: normalizedRows.map((row) => ({
                linkedUserId: row.linkedUserId,
                email: row.email,
                year: row.year ?? seoul.year,
                studentId: row.studentId,
                department: row.department,
                grade: row.grade,
                age: row.age,
                name: row.name,
                trainingType: row.trainingType,
                role: row.role,
                roleDetail: row.role === '임원' ? row.roleDetail : null,
                isAdmin: false
              }))
            }
          }
        });

        rosterId = created.id;

        if (adminUser) {
          await tx.clubMember.create({
            data: {
              rosterId,
              linkedUserId: adminUser.id,
              email: adminUser.email,
              year: seoul.year,
              studentId: null,
              grade: null,
              age: null,
              name: 'Admin',
              trainingType: '기본',
              department: null,
              role: '관리자',
              roleDetail: 'Admin',
              isAdmin: true
            }
          });
        }
      }

      for (const removed of removedRows) {
        const linkedUser = removed.linkedUserId
          ? await tx.user.findUnique({ where: { id: removed.linkedUserId } })
          : null;

        const createPayload = {
          email: removed.email ?? null,
          googleId: linkedUser?.googleId ?? null,
          studentId: removed.studentId ?? null,
          name: removed.name,
          reason: '동아리원 관리 페이지에서 퇴출 처리됨',
          bannedByUserId: req.user!.id
        };

        if (createPayload.email) {
          await tx.bannedAccount.upsert({
            where: { email: createPayload.email },
            update: {
              googleId: createPayload.googleId,
              studentId: createPayload.studentId,
              name: createPayload.name,
              reason: createPayload.reason,
              bannedByUserId: req.user!.id
            },
            create: createPayload
          });
        } else if (createPayload.googleId) {
          await tx.bannedAccount.upsert({
            where: { googleId: createPayload.googleId },
            update: {
              studentId: createPayload.studentId,
              name: createPayload.name,
              reason: createPayload.reason,
              bannedByUserId: req.user!.id
            },
            create: createPayload
          });
        } else {
          await tx.bannedAccount.create({ data: createPayload });
        }
      }

      return tx.memberRoster.findUniqueOrThrow({
        where: { id: rosterId },
        include: {
          members: {
            orderBy: [{ isAdmin: 'asc' }, { studentId: 'asc' }, { name: 'asc' }]
          }
        }
      });
    });

    res.json({
      ok: true,
      roster: serializeRoster(savedRoster),
      summary: toRosterSummary(savedRoster)
    });
  } catch (error) {
    next(error);
  }
});

router.get('/schedule/events', requireAuth, async (req, res, next) => {
  try {
    const events = await prisma.clubScheduleEvent.findMany({
      orderBy: [{ startDateKey: 'asc' }, { sortOrder: 'asc' }, { createdAt: 'asc' }]
    });

    res.json(events.map(serializeScheduleEvent));
  } catch (error) {
    next(error);
  }
});

router.post('/schedule/events/save', requireAuth, async (req, res, next) => {
  try {
    const context = await requireRosterManager(req.user!.id);
    if (!context.ok) {
      res.status(context.status).json({ message: context.message });
      return;
    }

    const rawEvents = Array.isArray(req.body?.events) ? req.body.events : [];
    const normalizedEvents = rawEvents
      .map((row: unknown, index: number) => normalizeSubmittedScheduleEvent(row as Record<string, unknown>, index))
      .filter((row: SubmittedScheduleEvent | null): row is SubmittedScheduleEvent => Boolean(row));

    const saved = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      await tx.clubScheduleEvent.deleteMany({});

      if (normalizedEvents.length > 0) {
        await tx.clubScheduleEvent.createMany({
          data: normalizedEvents.map((item: SubmittedScheduleEvent) => ({
            title: item.title,
            displayNote: item.displayNote,
            startDateKey: item.startDateKey,
            endDateKey: item.endDateKey,
            colorHex: item.colorHex,
            sortOrder: item.sortOrder
          }))
        });
      }

      return tx.clubScheduleEvent.findMany({
        orderBy: [{ startDateKey: 'asc' }, { sortOrder: 'asc' }, { createdAt: 'asc' }]
      });
    });

    res.json(saved.map(serializeScheduleEvent));
  } catch (error) {
    next(error);
  }
});

router.post('/money-snapshots/save', requireAuth, async (req, res, next) => {
  try {
    const context = await requireRosterManager(req.user!.id);
    if (!context.ok) {
      res.status(context.status).json({ message: context.message });
      return;
    }

    const { entries } = req.body as { baseSnapshotId?: string | null; entries?: Array<Record<string, unknown>> };
    if (!Array.isArray(entries)) {
      res.status(400).json({ message: '저장할 회비 내역이 없습니다.' });
      return;
    }

    const normalizedEntries = recalculateMoneyEntries(entries.map(normalizeMoneyEntryRow)).filter(
      (entry) => entry.category || entry.item || entry.note || entry.income !== null || entry.expense !== null || entry.leftFee !== null
    );

    const seoul = nowInSeoul();
    const snapshot = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      await tx.moneyLedgerSnapshot.updateMany({ where: { isActive: true }, data: { isActive: false } });
      return tx.moneyLedgerSnapshot.create({
        data: {
          title: seoul.moneyTitle,
          isActive: true,
          createdByUserId: req.user!.id,
          entries: {
            create: normalizedEntries.map((entry, index) => ({
              sortOrder: index,
              category: entry.category,
              item: entry.item,
              note: entry.note,
              income: entry.income,
              expense: entry.expense,
              remainingFee: entry.remainingFee,
              leftFee: entry.leftFee
            }))
          }
        },
        include: { entries: { orderBy: [{ sortOrder: 'asc' }] } }
      });
    });

    res.json({ ok: true, snapshot: serializeMoneySnapshot(snapshot), summary: toMoneySummary(snapshot) });
  } catch (error) {
    next(error);
  }
});

const BOARD_PAGE_DEFAULTS = {
  gym: {
    title: '도장 위치',
    bodyHtml: `
      <p>우리 가천대학교 검도부는 정기 운동과 친목 활동을 함께 운영하는 동아리입니다.</p>
      <p>검도관 위치는 <strong>문정검도관</strong>입니다.</p>
      <p>아래 지도를 드래그해서 위치를 확인하고, 지도를 더블클릭하면 네이버 지도가 새 창에서 열립니다.</p>
    `.trim(),
    placeName: '문정검도관',
    address: '서울 송파구 문정로 11 지하 1층 문정검도관',
    mapLink:
      'https://map.naver.com/p/entry/place/31510503?c=15.00,0,0,0,dh&placePath=/home?from=map&fromPanelNum=1&additionalHeight=76&timestamp=202603241644&locale=ko&svcName=map_pcv5'
  },
  mt: {
    title: '엠티 장소 물색',
    bodyHtml: `
      <p>엠티 후보 장소를 이곳에 정리하세요.</p>
      <p>장소 설명, 장단점, 예상 비용, 예약 링크 등을 자유롭게 작성할 수 있습니다.</p>
      <p>아래 지도 영역에는 현재 후보 장소의 주소를 기준으로 지도가 표시됩니다.</p>
    `.trim(),
    placeName: '',
    address: '',
    mapLink: ''
  }
} as const;

type BoardPageSlug = keyof typeof BOARD_PAGE_DEFAULTS;

function normalizePageSlug(value: string): BoardPageSlug | null {
  if (value === 'gym' || value === 'mt') return value;
  return null;
}

function canEditBoardPage(
  active:
    | {
        user: { systemRole: string } | null;
        activeMember: { role: string } | null;
      }
    | null
) {
  if (!active?.user) return false;
  if (active.user.systemRole === 'ROOT') return true;
  const role = normalizeClubRole(active.activeMember?.role ?? '일반');
  return role === '임원' || role === '부회장' || role === '회장';
}

function canViewBoardPage(
  active:
    | {
        user: { systemRole: string } | null;
        activeMember: { role: string } | null;
      }
    | null,
  slug: BoardPageSlug
) {
  if (slug === 'gym') return true;
  return canEditBoardPage(active);
}

async function ensureBoardPage(slug: BoardPageSlug) {
  const defaults = BOARD_PAGE_DEFAULTS[slug];

  return prisma.clubPageContent.upsert({
    where: { slug },
    update: {},
    create: {
      slug,
      title: defaults.title,
      bodyHtml: defaults.bodyHtml,
      placeName: defaults.placeName,
      address: defaults.address,
      mapLink: defaults.mapLink
    }
  });
}

function serializeBoardPage(
  page: {
    slug: string;
    title: string;
    bodyHtml: string;
    placeName: string | null;
    address: string | null;
    mapLink: string | null;
    updatedAt: Date;
  },
  canEdit: boolean
) {
  return {
    slug: page.slug,
    title: page.title,
    bodyHtml: page.bodyHtml,
    placeName: page.placeName ?? '',
    address: page.address ?? '',
    mapLink: page.mapLink ?? '',
    updatedAt: page.updatedAt,
    canEdit
  };
}

function toRosterSummary(item: {
  id: string;
  title: string;
  rosterYear: number;
  savedAt: Date;
  isActive: boolean;
  members: Array<{ isAdmin: boolean }>;
}) {
  return {
    id: item.id,
    title: item.title,
    rosterYear: item.rosterYear,
    savedAt: item.savedAt,
    isActive: item.isActive,
    count: item.members.filter((member) => !member.isAdmin).length
  };
}

function toMoneySummary(item: {
  id: string;
  title: string;
  savedAt: Date;
  isActive: boolean;
  _count?: { entries: number };
  entries?: Array<unknown>;
}) {
  return {
    id: item.id,
    title: item.title,
    savedAt: item.savedAt,
    isActive: item.isActive,
    count: item._count?.entries ?? item.entries?.length ?? 0
  };
}

function serializeRoster(roster: {
  id: string;
  title: string;
  rosterYear: number;
  savedAt: Date;
  isActive: boolean;
  members: Array<{
    id: string;
    linkedUserId: string | null;
    email: string | null;
    year: number;
    studentId: number | null;
    grade: number | null;
    age: number | null;
    name: string;
    trainingType: string;
    department: string | null;
    role: string;
    roleDetail: string | null;
    isAdmin: boolean;
  }>;
}) {
  const sortedMembers = [...roster.members].sort((left, right) => {
    if (left.isAdmin === right.isAdmin) return 0;
    return left.isAdmin ? 1 : -1;
  });
  const membersForStats = sortedMembers.filter((member) => !member.isAdmin);
  const executive = membersForStats.filter((member) => ['임원', '부회장', '회장'].includes(member.role)).length;
  return {
    id: roster.id,
    title: roster.title,
    rosterYear: roster.rosterYear,
    savedAt: roster.savedAt,
    isActive: roster.isActive,
    stats: {
      total: membersForStats.length,
      general: membersForStats.filter((member) => member.role === '일반').length,
      executive
    },
    members: sortedMembers.map((member) => {
      if (member.isAdmin) {
        return {
          id: member.id,
          linkedUserId: null,
          email: null,
          year: null,
          studentId: null,
          grade: null,
          age: null,
          name: 'Admin',
          trainingType: null,
          department: null,
          role: '관리자',
          roleDetail: null,
          isAdmin: true
        };
      }

      return {
        id: member.id,
        linkedUserId: member.linkedUserId,
        email: member.email,
        year: member.year,
        studentId: member.studentId,
        grade: member.grade,
        age: member.age,
        name: member.name,
        trainingType: normalizeTrainingType(member.trainingType),
        department: member.department ?? null,
        role: normalizeClubRole(member.role),
        roleDetail: member.roleDetail,
        isAdmin: false
      };
    })
  };
}

function serializeMoneySnapshot(snapshot: {
  id: string;
  title: string;
  savedAt: Date;
  isActive: boolean;
  entries: Array<{
    id: string;
    category: string | null;
    item: string | null;
    note: string | null;
    income: number | null;
    expense: number | null;
    remainingFee: number | null;
    leftFee: number | null;
  }>;
}) {
  return {
    id: snapshot.id,
    title: snapshot.title,
    savedAt: snapshot.savedAt,
    isActive: snapshot.isActive,
    entries: snapshot.entries.map((entry) => ({
      id: entry.id,
      category: entry.category,
      item: entry.item,
      note: entry.note,
      income: entry.income,
      expense: entry.expense,
      remainingFee: entry.remainingFee,
      leftFee: entry.leftFee
    }))
  };
}

type SubmittedMemberRow = {
  id: string | null;
  linkedUserId: string | null;
  email: string | null;
  year: number | null;
  studentId: number | null;
  grade: number | null;
  age: number | null;
  name: string;
  trainingType: '기본' | '호구';
  department: string | null;
  role: AppointableClubRole;
  roleDetail: string | null;
  isAdmin: boolean;
};

function normalizeSubmittedMemberRow(row: Record<string, unknown>): SubmittedMemberRow {
  return {
    id: typeof row.id === 'string' && row.id.startsWith('draft:') ? null : sanitizeNullableString(row.id),
    linkedUserId: sanitizeNullableString(row.linkedUserId),
    email: sanitizeNullableString(row.email)?.toLowerCase() ?? null,
    year: sanitizeNullableInt(row.year),
    studentId: sanitizeNullableInt(row.studentId),
    grade: sanitizeNullableInt(row.grade),
    age: sanitizeNullableInt(row.age),
    name: sanitizeNullableString(row.name) ?? '',
    trainingType: normalizeTrainingType(row.trainingType),
    department: sanitizeNullableString(row.department),
    role: normalizeAppointableRole(row.role),
    roleDetail: sanitizeNullableString(row.roleDetail),
    isAdmin: Boolean(row.isAdmin)
  };
}

type MoneyEntryRow = {
  id: string | null;
  category: string | null;
  item: string | null;
  note: string | null;
  income: number | null;
  expense: number | null;
  remainingFee: number | null;
  leftFee: number | null;
};

function normalizeMoneyEntryRow(row: Record<string, unknown>): MoneyEntryRow {
  return {
    id: sanitizeNullableString(row.id),
    category: sanitizeNullableString(row.category),
    item: sanitizeNullableString(row.item),
    note: sanitizeNullableString(row.note),
    income: sanitizeNullableInt(row.income),
    expense: sanitizeNullableInt(row.expense),
    remainingFee: sanitizeNullableInt(row.remainingFee),
    leftFee: sanitizeNullableInt(row.leftFee)
  };
}

function recalculateMoneyEntries(rows: MoneyEntryRow[]) {
  let running = 0;
  return rows.map((row) => {
    running += (row.income ?? 0) - (row.expense ?? 0);
    return { ...row, remainingFee: running };
  });
}

function isActorRow(
  active: NonNullable<Awaited<ReturnType<typeof buildActiveClubContext>>>,
  row: { linkedUserId?: string | null; email?: string | null; studentId?: number | null }
) {
  return isSameIdentity(
    {
      linkedUserId: active.activeMember?.linkedUserId ?? active.user?.id ?? null,
      email: active.user?.email ?? null,
      studentId: active.user?.studentId ? Number(active.user.studentId) : null
    },
    row
  );
}

function findActorSubmittedRow(
  active: NonNullable<Awaited<ReturnType<typeof buildActiveClubContext>>>,
  rows: SubmittedMemberRow[]
) {
  return rows.find((row) => isActorRow(active, row)) ?? null;
}

function validateRosterSave(input: {
  actorRole: ClubRole;
  actor: NonNullable<Awaited<ReturnType<typeof buildActiveClubContext>>>;
  originalRows: Array<{
    id: string;
    linkedUserId: string | null;
    email: string | null;
    studentId: number | null;
    role: string;
  }>;
  submittedRows: SubmittedMemberRow[];
}) {
  const { actorRole, actor, originalRows, submittedRows } = input;
  const presidentCount = submittedRows.filter((row) => row.role === '회장').length;
  if (presidentCount === 0) return '회장은 반드시 최소 1명 이상 존재해야 합니다.';
  if (presidentCount > 2) return '회장은 최대 2명까지만 존재할 수 있습니다.';

  if (actorRole === '관리자') return null;

  const originalMap = new Map(originalRows.map((row) => [row.id, row]));
  const roleChanges = submittedRows.filter((row) => row.id && originalMap.get(row.id) && normalizeClubRole(originalMap.get(row.id)?.role) !== row.role);
  const removedRows = originalRows.filter((row) => !submittedRows.some((item) => isSameIdentity(item, row)));

  if (actorRole === '임원' && (roleChanges.length > 0 || removedRows.length > 0)) {
    return '이 버튼은 회/부회장만 사용할 수 있습니다.';
  }

  if (actorRole === '부회장') {
    const invalid = roleChanges.find((row) => {
      const before = row.id ? originalMap.get(row.id) : null;
      const beforeRole = normalizeClubRole(before?.role);
      const isSelf = isActorRow(actor, row);
      if (beforeRole === '일반') return !(row.role === '임원' || row.role === '부회장');
      if (beforeRole === '임원') return !(row.role === '일반' || row.role === '부회장');
      if (beforeRole === '부회장' && isSelf) return !(row.role === '일반' || row.role === '임원');
      return true;
    });
    if (invalid) return '부회장은 일반/임원 전환과 부회장 지정만 처리할 수 있습니다.';
  }

  if (actorRole === '회장') {
    const actorSubmitted = findActorSubmittedRow(actor, submittedRows);
    if (actorSubmitted && actorSubmitted.role !== '회장') {
      const hasOtherPresident = submittedRows.some((row) => !isActorRow(actor, row) && row.role === '회장');
      if (!hasOtherPresident) {
        return '후임자를 회장으로 임명하지 않고 본인의 직책을 바꿀 순 없습니다. 후임자를 회장으로 먼저 임명하세요';
      }
    }
  }

  return null;
}

async function requireRosterManager(userId: string) {
  const active = await buildActiveClubContext(userId);
  if (!active?.user) {
    return { ok: false as const, status: 401, message: '로그인이 필요합니다.' };
  }

  const role = normalizeClubRole(active.activeMember?.role ?? (active.user ? '일반' : '일반'));
  if (!canManageRoster(role)) {
    return { ok: false as const, status: 403, message: '권한이 없습니다.' };
  }

  return { ok: true as const, active };
}

type SubmittedScheduleEvent = {
  title: string;
  displayNote: string | null;
  startDateKey: string;
  endDateKey: string;
  colorHex: string;
  sortOrder: number;
};

function normalizeDateKey(value: unknown) {
  const raw = sanitizeNullableString(value);
  if (!raw) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return null;
  return raw;
}

function normalizeColorHex(value: unknown) {
  const raw = sanitizeNullableString(value);
  if (!raw) return '#4f6df5';
  if (!/^#[0-9a-fA-F]{6}$/.test(raw)) return '#4f6df5';
  return raw;
}

function normalizeSubmittedScheduleEvent(row: Record<string, unknown>, index: number): SubmittedScheduleEvent | null {
  const title = sanitizeNullableString(row.title)?.trim() ?? '';
  if (!title) return null;

  const displayNote = sanitizeNullableString(row.displayNote)?.trim() ?? null;
  const startDate = normalizeDateKey(row.startDate);
  const endDate = normalizeDateKey(row.endDate);

  if (!startDate || !endDate) return null;

  const startDateKey = startDate <= endDate ? startDate : endDate;
  const endDateKey = startDate <= endDate ? endDate : startDate;

  return {
    title,
    displayNote,
    startDateKey,
    endDateKey,
    colorHex: normalizeColorHex(row.colorHex),
    sortOrder: index
  };
}

function serializeScheduleEvent(event: {
  id: string;
  title: string;
  displayNote: string | null;
  startDateKey: string;
  endDateKey: string;
  colorHex: string;
  sortOrder: number;
}) {
  return {
    id: event.id,
    title: event.title,
    displayNote: event.displayNote,
    startDate: event.startDateKey,
    endDate: event.endDateKey,
    colorHex: event.colorHex,
    sortOrder: event.sortOrder
  };
}

type NoticeSearchField = 'all' | 'title' | 'body' | 'author';

function normalizeNoticeSearchField(value: unknown): NoticeSearchField {
  if (value === 'title' || value === 'body' || value === 'author') return value;
  return 'all';
}

function buildNoticeWhere(query: string | null, field: NoticeSearchField) {
  if (!query) return {};

  if (field === 'title') {
    return { title: { contains: query, mode: 'insensitive' as const } };
  }

  if (field === 'body') {
    return { bodyHtml: { contains: query, mode: 'insensitive' as const } };
  }

  if (field === 'author') {
    return { authorDisplayName: { contains: query, mode: 'insensitive' as const } };
  }

  return {
    OR: [
      { title: { contains: query, mode: 'insensitive' as const } },
      { bodyHtml: { contains: query, mode: 'insensitive' as const } },
      { authorDisplayName: { contains: query, mode: 'insensitive' as const } }
    ]
  };
}

type ContactSearchField = 'all' | 'title' | 'content';

function normalizeContactSearchField(value: unknown): ContactSearchField {
  if (value === 'title' || value === 'content') return value;
  return 'all';
}

function buildContactWhere(query: string | null, field: ContactSearchField) {
  if (!query) return {};

  if (field === 'title') {
    return {
      title: {
        contains: query,
        mode: 'insensitive' as const
      }
    };
  }

  if (field === 'content') {
    return {
      bodyHtml: {
        contains: query,
        mode: 'insensitive' as const
      }
    };
  }

  return {
    OR: [
      {
        title: {
          contains: query,
          mode: 'insensitive' as const
        }
      },
      {
        bodyHtml: {
          contains: query,
          mode: 'insensitive' as const
        }
      }
    ]
  };
}

function canManagerReadSecretContact(
  active:
    | {
        user: { systemRole: string } | null;
        activeMember: { role: string } | null;
      }
    | null
) {
  if (!active?.user) return false;
  if (active.user.systemRole === 'ROOT') return true;
  const role = normalizeClubRole(active.activeMember?.role ?? '일반');
  return role === '임원' || role === '부회장' || role === '회장';
}

function canRevealAnonymousContactAuthor(
  active:
    | {
        user: { systemRole: string } | null;
        activeMember: { role: string } | null;
      }
    | null
) {
  if (!active?.user) return false;
  if (active.user.systemRole === 'ROOT') return true;
  const role = normalizeClubRole(active.activeMember?.role ?? '일반');
  return role === '회장';
}

function isContactAuthor(
  active: Awaited<ReturnType<typeof buildActiveClubContext>>,
  post: {
    authorUserId: string;
    authorMemberId: string | null;
  }
) {
  if (!active?.user) return false;
  return active.user.id === post.authorUserId || (!!active.activeMember?.id && active.activeMember.id === post.authorMemberId);
}

function canOpenContactPost(
  active: NonNullable<Awaited<ReturnType<typeof buildActiveClubContext>>>,
  post: {
    isSecret: boolean;
    authorUserId: string;
    authorMemberId: string | null;
  }
) {
  if (!post.isSecret) return true;
  if (canManagerReadSecretContact(active)) return true;
  return isContactAuthor(active, post);
}

function canDeleteAnyContact(
  active:
    | {
        user: { systemRole: string } | null;
        activeMember: { role: string } | null;
      }
    | null
) {
  if (!active?.user) return false;
  if (active.user.systemRole === 'ROOT') return true;
  const role = normalizeClubRole(active.activeMember?.role ?? '일반');
  return role === '임원' || role === '부회장' || role === '회장';
}

function canEditContactPost(
  active: NonNullable<Awaited<ReturnType<typeof buildActiveClubContext>>>,
  post: {
    authorUserId: string;
    authorMemberId: string | null;
  }
) {
  return isContactAuthor(active, post);
}

function canDeleteContactPost(
  active: NonNullable<Awaited<ReturnType<typeof buildActiveClubContext>>>,
  post: {
    authorUserId: string;
    authorMemberId: string | null;
  }
) {
  if (isContactAuthor(active, post)) return true;
  return canDeleteAnyContact(active);
}

function serializeContactSummary(
  active: NonNullable<Awaited<ReturnType<typeof buildActiveClubContext>>>,
  item: {
    id: string;
    title: string;
    isSecret: boolean;
    isAnonymous: boolean;
    authorUserId: string;
    authorMemberId: string | null;
    authorName: string;
    createdAt: Date;
    viewCount: number;
  }
) {
  const canOpen = canOpenContactPost(active, item);
  const isAuthor = isContactAuthor(active, item);
  const maskedTitle = item.isSecret && !isAuthor ? '비밀글입니다.' : item.title;

  return {
    id: item.id,
    title: maskedTitle,
    isSecret: item.isSecret,
    isAnonymous: item.isAnonymous,
    authorDisplayName: item.isAnonymous ? '익명' : item.authorName,
    createdAt: item.createdAt,
    viewCount: item.viewCount,
    canOpen
  };
}

function serializeContactDetail(
  active: NonNullable<Awaited<ReturnType<typeof buildActiveClubContext>>>,
  item: {
    id: string;
    title: string;
    bodyHtml: string;
    isSecret: boolean;
    isAnonymous: boolean;
    authorUserId: string;
    authorMemberId: string | null;
    authorName: string;
    createdAt: Date;
    updatedAt: Date;
    viewCount: number;
  }
) {
  const isAuthor = isContactAuthor(active, item);
  const canEdit = canEditContactPost(active, item);
  const canDelete = canDeleteContactPost(active, item);

  return {
    id: item.id,
    title: item.title,
    bodyHtml: item.bodyHtml,
    isSecret: item.isSecret,
    isAnonymous: item.isAnonymous,
    authorDisplayName: item.isAnonymous ? '익명' : item.authorName,
    realAuthorName: item.authorName,
    canRevealAuthor: item.isAnonymous && canRevealAnonymousContactAuthor(active),
    isAuthor,
    canEdit,
    canDelete,
    createdAt: item.createdAt,
    updatedAt: item.updatedAt,
    viewCount: item.viewCount
  };
}

function serializeNoticeSummary(item: {
  id: string;
  title: string;
  authorDisplayName: string;
  createdAt: Date;
  updatedAt: Date;
  viewCount: number;
  isPinned: boolean;
}) {
  return {
    id: item.id,
    title: item.title,
    authorDisplayName: item.authorDisplayName,
    createdAt: item.createdAt,
    updatedAt: item.updatedAt,
    viewCount: item.viewCount,
    isPinned: item.isPinned
  };
}

function serializeNoticeDetail(item: {
  id: string;
  title: string;
  bodyHtml: string;
  authorDisplayName: string;
  createdAt: Date;
  updatedAt: Date;
  viewCount: number;
  isPinned: boolean;
  attachments?: Array<{
    id: string;
    fileName: string;
    fileSize: number;
  }>;
}) {
  return {
    id: item.id,
    title: item.title,
    bodyHtml: item.bodyHtml,
    authorDisplayName: item.authorDisplayName,
    createdAt: item.createdAt,
    updatedAt: item.updatedAt,
    viewCount: item.viewCount,
    isPinned: item.isPinned,
    attachments: (item.attachments ?? []).map(serializeNoticeAttachment)
  };
}

const noticeUpload = multer({
  storage: multer.memoryStorage(),
  limits: {
    files: 10,
    fileSize: 15 * 1024 * 1024
  }
});

function serializeNoticeAttachment(item: {
  id: string;
  fileName: string;
  fileSize: number;
}) {
  return {
    id: item.id,
    fileName: item.fileName,
    fileSize: item.fileSize,
    downloadUrl: `/api/club/notice/attachments/${item.id}/download`
  };
}
type EventSearchField = 'all' | 'title' | 'body' | 'author';

function normalizeEventSearchField(value: unknown): EventSearchField {
  if (value === 'title' || value === 'body' || value === 'author') return value;
  return 'all';
}

function buildEventWhere(query: string | null, field: EventSearchField) {
  if (!query) return {};

  if (field === 'title') {
    return { title: { contains: query, mode: 'insensitive' as const } };
  }

  if (field === 'body') {
    return { bodyHtml: { contains: query, mode: 'insensitive' as const } };
  }

  if (field === 'author') {
    return { authorDisplayName: { contains: query, mode: 'insensitive' as const } };
  }

  return {
    OR: [
      { title: { contains: query, mode: 'insensitive' as const } },
      { bodyHtml: { contains: query, mode: 'insensitive' as const } },
      { authorDisplayName: { contains: query, mode: 'insensitive' as const } }
    ]
  };
}

function serializeEventSummary(item: {
  id: string;
  title: string;
  authorDisplayName: string;
  createdAt: Date;
  updatedAt: Date;
  viewCount: number;
  isPinned: boolean;
}) {
  return {
    id: item.id,
    title: item.title,
    authorDisplayName: item.authorDisplayName,
    createdAt: item.createdAt,
    updatedAt: item.updatedAt,
    viewCount: item.viewCount,
    isPinned: item.isPinned
  };
}

function serializeEventAttachment(item: {
  id: string;
  fileName: string;
  fileSize: number;
}) {
  return {
    id: item.id,
    fileName: item.fileName,
    fileSize: item.fileSize,
    downloadUrl: `/api/club/events/attachments/${item.id}/download`
  };
}

function serializeEventDetail(item: {
  id: string;
  title: string;
  bodyHtml: string;
  authorDisplayName: string;
  createdAt: Date;
  updatedAt: Date;
  viewCount: number;
  isPinned: boolean;
  attachments?: Array<{
    id: string;
    fileName: string;
    fileSize: number;
  }>;
}) {
  return {
    id: item.id,
    title: item.title,
    bodyHtml: item.bodyHtml,
    authorDisplayName: item.authorDisplayName,
    createdAt: item.createdAt,
    updatedAt: item.updatedAt,
    viewCount: item.viewCount,
    isPinned: item.isPinned,
    attachments: (item.attachments ?? []).map(serializeEventAttachment)
  };
}

router.get('/notice/posts', requireAuth, async (req, res, next) => {
  try {
    const page = Math.max(1, Number(req.query.page) || 1);
    const pageSize = 10;
    const query = sanitizeNullableString(req.query.query)?.trim() ?? null;
    const field = normalizeNoticeSearchField(req.query.field);

    const where = buildNoticeWhere(query, field);

    const pinnedItems =
      page === 1
        ? await prisma.clubNoticePost.findMany({
            where: {
              ...where,
              isPinned: true
            },
            orderBy: [{ createdAt: 'desc' }, { updatedAt: 'desc' }]
          })
        : [];

    const totalRegularCount = await prisma.clubNoticePost.count({
      where: {
        ...where,
        isPinned: false
      }
    });

    const totalPages = Math.max(1, Math.ceil(totalRegularCount / pageSize));

    const items = await prisma.clubNoticePost.findMany({
      where: {
        ...where,
        isPinned: false
      },
      orderBy: [{ createdAt: 'desc' }, { updatedAt: 'desc' }],
      skip: (page - 1) * pageSize,
      take: pageSize
    });

    res.json({
      currentPage: page,
      totalPages,
      totalCount: totalRegularCount,
      pinnedItems: pinnedItems.map(serializeNoticeSummary),
      items: items.map(serializeNoticeSummary)
    });
  } catch (error) {
    next(error);
  }
});

router.get('/notice/posts/:postId', requireAuth, async (req, res, next) => {
  try {
    const post = await prisma.clubNoticePost.findUnique({
      where: { id: String(req.params.postId) },
      include: {
        attachments: {
          orderBy: [{ createdAt: 'asc' }]
        }
      }
    });

    if (!post) {
      res.status(404).json({ message: '게시글을 찾을 수 없습니다.' });
      return;
    }

    const updated = await prisma.clubNoticePost.update({
      where: { id: post.id },
      data: {
        viewCount: {
          increment: 1
        }
      },
      include: {
        attachments: {
          orderBy: [{ createdAt: 'asc' }]
        }
      }
    });

    res.json(serializeNoticeDetail(updated));
  } catch (error) {
    next(error);
  }
});

router.post('/notice/posts', requireAuth, noticeUpload.array('attachments', 10), async (req, res, next) => {
  try {
    const context = await requireRosterManager(req.user!.id);
    if (!context.ok) {
      res.status(context.status).json({ message: context.message });
      return;
    }

    const files = Array.isArray(req.files) ? (req.files as Express.Multer.File[]) : [];

    const { title, bodyHtml } = req.body as {
      title?: string;
      bodyHtml?: string;
    };

    const normalizedTitle = sanitizeNullableString(title)?.trim() ?? '';
    const normalizedBody = String(bodyHtml ?? '').trim();

    if (!normalizedTitle) {
      res.status(400).json({ message: '제목을 입력해주세요.' });
      return;
    }

    if (!normalizedBody) {
      res.status(400).json({ message: '본문 내용을 입력해주세요.' });
      return;
    }

    const authorDisplayName =
      context.active.user?.systemRole === 'ROOT'
        ? 'Admin'
        : context.active.activeMember?.name ?? context.active.user?.email ?? '운영진';

    const saved = await prisma.clubNoticePost.create({
      data: {
        title: normalizedTitle,
        bodyHtml: normalizedBody,
        createdByUserId: req.user!.id,
        authorDisplayName,
        attachments: {
          create: files.map((file) => ({
            fileName: file.originalname,
            mimeType: file.mimetype || 'application/octet-stream',
            fileSize: file.size,
            data: new Uint8Array(file.buffer)
          }))
        }
      },
      include: {
        attachments: {
          orderBy: [{ createdAt: 'asc' }]
        }
      }
    });

    res.json(serializeNoticeDetail(saved));
  } catch (error) {
    next(error);
  }
});

router.put('/notice/posts/:postId', requireAuth, noticeUpload.array('attachments', 10), async (req, res, next) => {
  try {
    const context = await requireRosterManager(req.user!.id);
    if (!context.ok) {
      res.status(context.status).json({ message: context.message });
      return;
    }

    const postId = String(req.params.postId);
    const existing = await prisma.clubNoticePost.findUnique({
      where: { id: postId },
      include: {
        attachments: {
          orderBy: [{ createdAt: 'asc' }]
        }
      }
    });

    if (!existing) {
      res.status(404).json({ message: '게시글을 찾을 수 없습니다.' });
      return;
    }

    const files = Array.isArray(req.files) ? (req.files as Express.Multer.File[]) : [];

    const { title, bodyHtml } = req.body as {
      title?: string;
      bodyHtml?: string;
    };

    const normalizedTitle = sanitizeNullableString(title)?.trim() ?? '';
    const normalizedBody = String(bodyHtml ?? '').trim();

    if (!normalizedTitle) {
      res.status(400).json({ message: '제목을 입력해주세요.' });
      return;
    }

    if (!normalizedBody) {
      res.status(400).json({ message: '본문 내용을 입력해주세요.' });
      return;
    }

    const updateData: Prisma.ClubNoticePostUpdateInput = {
      title: normalizedTitle,
      bodyHtml: normalizedBody
    };

    if (files.length > 0) {
      updateData.attachments = {
        create: files.map((file) => ({
          fileName: file.originalname,
          mimeType: file.mimetype || 'application/octet-stream',
          fileSize: file.size,
          data: new Uint8Array(file.buffer)
        }))
      };
    }

    const updated = await prisma.clubNoticePost.update({
      where: { id: postId },
      data: updateData,
      include: {
        attachments: {
          orderBy: [{ createdAt: 'asc' }]
        }
      }
    });

    res.json(serializeNoticeDetail(updated));
  } catch (error) {
    next(error);
  }
});

router.post('/notice/posts/pin', requireAuth, async (req, res, next) => {
  try {
    const context = await requireRosterManager(req.user!.id);
    if (!context.ok) {
      res.status(context.status).json({ message: context.message });
      return;
    }

    const postIds = Array.isArray(req.body?.postIds)
      ? req.body.postIds.map((item: unknown) => String(item)).filter(Boolean)
      : [];

    if (postIds.length === 0) {
      res.status(400).json({ message: '고정할 게시글을 선택해주세요.' });
      return;
    }

    await prisma.clubNoticePost.updateMany({
      where: { id: { in: postIds } },
      data: { isPinned: true }
    });

    res.json({ ok: true });
  } catch (error) {
    next(error);
  }
});

router.post('/notice/posts/unpin', requireAuth, async (req, res, next) => {
  try {
    const context = await requireRosterManager(req.user!.id);
    if (!context.ok) {
      res.status(context.status).json({ message: context.message });
      return;
    }

    const postIds = Array.isArray(req.body?.postIds)
      ? req.body.postIds.map((item: unknown) => String(item)).filter(Boolean)
      : [];

    if (postIds.length === 0) {
      res.status(400).json({ message: '고정 해제할 게시글을 선택해주세요.' });
      return;
    }

    await prisma.clubNoticePost.updateMany({
      where: { id: { in: postIds } },
      data: { isPinned: false }
    });

    res.json({ ok: true });
  } catch (error) {
    next(error);
  }
});

router.get('/notice/attachments/:attachmentId/download', requireAuth, async (req, res, next) => {
  try {
    const attachment = await prisma.clubNoticeAttachment.findUnique({
      where: { id: String(req.params.attachmentId) }
    });

    if (!attachment) {
      res.status(404).json({ message: '첨부파일을 찾을 수 없습니다.' });
      return;
    }

    res.setHeader('Content-Type', attachment.mimeType || 'application/octet-stream');
    res.setHeader('Content-Length', String(attachment.fileSize));
    res.setHeader(
      'Content-Disposition',
      `attachment; filename*=UTF-8''${encodeURIComponent(attachment.fileName)}`
    );

    res.send(Buffer.from(attachment.data));
  } catch (error) {
    next(error);
  }
});

router.delete('/notice/posts/:postId', requireAuth, async (req, res, next) => {
  try {
    const context = await requireRosterManager(req.user!.id);
    if (!context.ok) {
      res.status(context.status).json({ message: context.message });
      return;
    }

    const postId = String(req.params.postId);

    const existing = await prisma.clubNoticePost.findUnique({
      where: { id: postId }
    });

    if (!existing) {
      res.status(404).json({ message: '게시글을 찾을 수 없습니다.' });
      return;
    }

    await prisma.clubNoticePost.delete({
      where: { id: postId }
    });

    res.json({ ok: true });
  } catch (error) {
    next(error);
  }
});

router.get('/events/posts', requireAuth, async (req, res, next) => {
  try {
    const page = Math.max(1, Number(req.query.page) || 1);
    const pageSize = 10;
    const query = sanitizeNullableString(req.query.query)?.trim() ?? null;
    const field = normalizeEventSearchField(req.query.field);

    const where = buildEventWhere(query, field);

    const pinnedItems =
      page === 1
        ? await prisma.clubEventPost.findMany({
            where: {
              ...where,
              isPinned: true
            },
            orderBy: [{ createdAt: 'desc' }, { updatedAt: 'desc' }]
          })
        : [];

    const totalRegularCount = await prisma.clubEventPost.count({
      where: {
        ...where,
        isPinned: false
      }
    });

    const totalPages = Math.max(1, Math.ceil(totalRegularCount / pageSize));

    const items = await prisma.clubEventPost.findMany({
      where: {
        ...where,
        isPinned: false
      },
      orderBy: [{ createdAt: 'desc' }, { updatedAt: 'desc' }],
      skip: (page - 1) * pageSize,
      take: pageSize
    });

    res.json({
      currentPage: page,
      totalPages,
      totalCount: totalRegularCount,
      pinnedItems: pinnedItems.map(serializeEventSummary),
      items: items.map(serializeEventSummary)
    });
  } catch (error) {
    next(error);
  }
});

router.get('/events/posts/:postId', requireAuth, async (req, res, next) => {
  try {
    const post = await prisma.clubEventPost.findUnique({
      where: { id: String(req.params.postId) },
      include: {
        attachments: {
          orderBy: [{ createdAt: 'asc' }]
        }
      }
    });

    if (!post) {
      res.status(404).json({ message: '게시글을 찾을 수 없습니다.' });
      return;
    }

    const updated = await prisma.clubEventPost.update({
      where: { id: post.id },
      data: {
        viewCount: {
          increment: 1
        }
      },
      include: {
        attachments: {
          orderBy: [{ createdAt: 'asc' }]
        }
      }
    });

    res.json(serializeEventDetail(updated));
  } catch (error) {
    next(error);
  }
});

router.post('/events/posts', requireAuth, noticeUpload.array('attachments', 10), async (req, res, next) => {
  try {
    const context = await requireRosterManager(req.user!.id);
    if (!context.ok) {
      res.status(context.status).json({ message: context.message });
      return;
    }

    const files = Array.isArray(req.files) ? (req.files as Express.Multer.File[]) : [];

    const { title, bodyHtml } = req.body as {
      title?: string;
      bodyHtml?: string;
    };

    const normalizedTitle = sanitizeNullableString(title)?.trim() ?? '';
    const normalizedBody = String(bodyHtml ?? '').trim();

    if (!normalizedTitle) {
      res.status(400).json({ message: '제목을 입력해주세요.' });
      return;
    }

    if (!normalizedBody) {
      res.status(400).json({ message: '본문 내용을 입력해주세요.' });
      return;
    }

    const authorDisplayName =
      context.active.user?.systemRole === 'ROOT'
        ? 'Admin'
        : context.active.activeMember?.name ?? context.active.user?.email ?? '운영진';

    const saved = await prisma.clubEventPost.create({
      data: {
        title: normalizedTitle,
        bodyHtml: normalizedBody,
        createdByUserId: req.user!.id,
        authorDisplayName,
        attachments: {
          create: files.map((file) => ({
            fileName: file.originalname,
            mimeType: file.mimetype || 'application/octet-stream',
            fileSize: file.size,
            data: new Uint8Array(file.buffer)
          }))
        }
      },
      include: {
        attachments: {
          orderBy: [{ createdAt: 'asc' }]
        }
      }
    });

    res.json(serializeEventDetail(saved));
  } catch (error) {
    next(error);
  }
});

router.put('/events/posts/:postId', requireAuth, noticeUpload.array('attachments', 10), async (req, res, next) => {
  try {
    const context = await requireRosterManager(req.user!.id);
    if (!context.ok) {
      res.status(context.status).json({ message: context.message });
      return;
    }

    const postId = String(req.params.postId);
    const existing = await prisma.clubEventPost.findUnique({
      where: { id: postId },
      include: {
        attachments: {
          orderBy: [{ createdAt: 'asc' }]
        }
      }
    });

    if (!existing) {
      res.status(404).json({ message: '게시글을 찾을 수 없습니다.' });
      return;
    }

    const files = Array.isArray(req.files) ? (req.files as Express.Multer.File[]) : [];

    const { title, bodyHtml } = req.body as {
      title?: string;
      bodyHtml?: string;
    };

    const normalizedTitle = sanitizeNullableString(title)?.trim() ?? '';
    const normalizedBody = String(bodyHtml ?? '').trim();

    if (!normalizedTitle) {
      res.status(400).json({ message: '제목을 입력해주세요.' });
      return;
    }

    if (!normalizedBody) {
      res.status(400).json({ message: '본문 내용을 입력해주세요.' });
      return;
    }

    const updateData: Prisma.ClubEventPostUpdateInput = {
      title: normalizedTitle,
      bodyHtml: normalizedBody
    };

    if (files.length > 0) {
      updateData.attachments = {
        create: files.map((file) => ({
          fileName: file.originalname,
          mimeType: file.mimetype || 'application/octet-stream',
          fileSize: file.size,
          data: new Uint8Array(file.buffer)
        }))
      };
    }

    const updated = await prisma.clubEventPost.update({
      where: { id: postId },
      data: updateData,
      include: {
        attachments: {
          orderBy: [{ createdAt: 'asc' }]
        }
      }
    });

    res.json(serializeEventDetail(updated));
  } catch (error) {
    next(error);
  }
});

router.post('/events/posts/pin', requireAuth, async (req, res, next) => {
  try {
    const context = await requireRosterManager(req.user!.id);
    if (!context.ok) {
      res.status(context.status).json({ message: context.message });
      return;
    }

    const postIds = Array.isArray(req.body?.postIds)
      ? req.body.postIds.map((item: unknown) => String(item)).filter(Boolean)
      : [];

    if (postIds.length === 0) {
      res.status(400).json({ message: '고정할 게시글을 선택해주세요.' });
      return;
    }

    await prisma.clubEventPost.updateMany({
      where: { id: { in: postIds } },
      data: { isPinned: true }
    });

    res.json({ ok: true });
  } catch (error) {
    next(error);
  }
});

router.post('/events/posts/unpin', requireAuth, async (req, res, next) => {
  try {
    const context = await requireRosterManager(req.user!.id);
    if (!context.ok) {
      res.status(context.status).json({ message: context.message });
      return;
    }

    const postIds = Array.isArray(req.body?.postIds)
      ? req.body.postIds.map((item: unknown) => String(item)).filter(Boolean)
      : [];

    if (postIds.length === 0) {
      res.status(400).json({ message: '고정 해제할 게시글을 선택해주세요.' });
      return;
    }

    await prisma.clubEventPost.updateMany({
      where: { id: { in: postIds } },
      data: { isPinned: false }
    });

    res.json({ ok: true });
  } catch (error) {
    next(error);
  }
});

router.get('/events/attachments/:attachmentId/download', requireAuth, async (req, res, next) => {
  try {
    const attachment = await prisma.clubEventAttachment.findUnique({
      where: { id: String(req.params.attachmentId) }
    });

    if (!attachment) {
      res.status(404).json({ message: '첨부파일을 찾을 수 없습니다.' });
      return;
    }

    res.setHeader('Content-Type', attachment.mimeType || 'application/octet-stream');
    res.setHeader('Content-Length', String(attachment.fileSize));
    res.setHeader(
      'Content-Disposition',
      `attachment; filename*=UTF-8''${encodeURIComponent(attachment.fileName)}`
    );

    res.send(Buffer.from(attachment.data));
  } catch (error) {
    next(error);
  }
});

router.delete('/events/posts/:postId', requireAuth, async (req, res, next) => {
  try {
    const context = await requireRosterManager(req.user!.id);
    if (!context.ok) {
      res.status(context.status).json({ message: context.message });
      return;
    }

    const postId = String(req.params.postId);

    const existing = await prisma.clubEventPost.findUnique({
      where: { id: postId }
    });

    if (!existing) {
      res.status(404).json({ message: '게시글을 찾을 수 없습니다.' });
      return;
    }

    await prisma.clubEventPost.delete({
      where: { id: postId }
    });

    res.json({ ok: true });
  } catch (error) {
    next(error);
  }
});

router.get('/contact/posts', requireAuth, async (req, res, next) => {
  try {
    const active = await buildActiveClubContext(req.user!.id);
    if (!active || !active.user) {
      res.status(403).json({ message: '권한이 없습니다.' });
      return;
    }

    const page = Math.max(1, Number(req.query.page) || 1);
    const pageSize = 10;
    const query = sanitizeNullableString(req.query.query)?.trim() ?? null;
    const field = normalizeContactSearchField(req.query.field);

    const where = buildContactWhere(query, field);

    const totalCount = await prisma.clubContactPost.count({ where });
    const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));

    const items = await prisma.clubContactPost.findMany({
      where,
      orderBy: [{ createdAt: 'desc' }, { updatedAt: 'desc' }],
      skip: (page - 1) * pageSize,
      take: pageSize
    });

    res.json({
      currentPage: page,
      totalPages,
      totalCount,
      items: items.map((item: (typeof items)[number]) => serializeContactSummary(active, item))
    });
  } catch (error) {
    next(error);
  }
});

router.get('/contact/posts/:postId', requireAuth, async (req, res, next) => {
  try {
    const active = await buildActiveClubContext(req.user!.id);
    if (!active || !active.user) {
      res.status(403).json({ message: '권한이 없습니다.' });
      return;
    }

    const post = await prisma.clubContactPost.findUnique({
      where: { id: String(req.params.postId) }
    });

    if (!post) {
      res.status(404).json({ message: '문의글을 찾을 수 없습니다.' });
      return;
    }

    if (!canOpenContactPost(active, post)) {
      res.status(403).json({ message: '비밀글은 작성자 본인과 운영진만 확인할 수 있습니다.' });
      return;
    }

    const updated = await prisma.clubContactPost.update({
      where: { id: post.id },
      data: {
        viewCount: {
          increment: 1
        }
      }
    });

    res.json(serializeContactDetail(active, updated));
  } catch (error) {
    next(error);
  }
});

router.post('/contact/posts', requireAuth, async (req, res, next) => {
  try {
    const active = await buildActiveClubContext(req.user!.id);
    if (!active || !active.user) {
      res.status(403).json({ message: '권한이 없습니다.' });
      return;
    }

    const { title, bodyHtml, isSecret, isAnonymous } = req.body as {
      title?: string;
      bodyHtml?: string;
      isSecret?: boolean;
      isAnonymous?: boolean;
    };

    const normalizedTitle = sanitizeNullableString(title)?.trim() ?? '';
    const normalizedBody = String(bodyHtml ?? '').trim();

    if (!normalizedTitle) {
      res.status(400).json({ message: '제목을 입력해주세요.' });
      return;
    }

    if (!normalizedBody) {
      res.status(400).json({ message: '본문 내용을 입력해주세요.' });
      return;
    }

    const authorName =
      active.user.systemRole === 'ROOT'
        ? 'Admin'
        : active.activeMember?.name ?? active.user.email ?? '사용자';

    const created = await prisma.clubContactPost.create({
      data: {
        title: normalizedTitle,
        bodyHtml: normalizedBody,
        isSecret: Boolean(isSecret),
        isAnonymous: Boolean(isAnonymous),
        authorUserId: req.user!.id,
        authorMemberId: active.activeMember?.id ?? null,
        authorName
      }
    });

    res.json(serializeContactDetail(active, created));
  } catch (error) {
    next(error);
  }
});

router.put('/contact/posts/:postId', requireAuth, async (req, res, next) => {
  try {
    const active = await buildActiveClubContext(req.user!.id);
    if (!active || !active.user) {
      res.status(403).json({ message: '권한이 없습니다.' });
      return;
    }
    const postId = String(req.params.postId);

    const existing = await prisma.clubContactPost.findUnique({
      where: { id: postId }
    });

    if (!existing) {
      res.status(404).json({ message: '문의글을 찾을 수 없습니다.' });
      return;
    }

    if (!canEditContactPost(active, existing)) {
      res.status(403).json({ message: '본인이 작성한 문의글만 수정할 수 있습니다.' });
      return;
    }

    const { title, bodyHtml, isSecret, isAnonymous } = req.body as {
      title?: string;
      bodyHtml?: string;
      isSecret?: boolean;
      isAnonymous?: boolean;
    };

    const normalizedTitle = sanitizeNullableString(title)?.trim() ?? '';
    const normalizedBody = String(bodyHtml ?? '').trim();

    if (!normalizedTitle) {
      res.status(400).json({ message: '제목을 입력해주세요.' });
      return;
    }

    if (!normalizedBody) {
      res.status(400).json({ message: '본문 내용을 입력해주세요.' });
      return;
    }

    const updated = await prisma.clubContactPost.update({
      where: { id: postId },
      data: {
        title: normalizedTitle,
        bodyHtml: normalizedBody,
        isSecret: Boolean(isSecret),
        isAnonymous: Boolean(isAnonymous)
      }
    });

    res.json(serializeContactDetail(active, updated));
  } catch (error) {
    next(error);
  }
});

router.delete('/contact/posts/:postId', requireAuth, async (req, res, next) => {
  try {
    const active = await buildActiveClubContext(req.user!.id);
    if (!active || !active.user) {
      res.status(403).json({ message: '권한이 없습니다.' });
      return;
    }
    const postId = String(req.params.postId);

    const existing = await prisma.clubContactPost.findUnique({
      where: { id: postId }
    });

    if (!existing) {
      res.status(404).json({ message: '문의글을 찾을 수 없습니다.' });
      return;
    }

    if (!canDeleteContactPost(active, existing)) {
      res.status(403).json({ message: '삭제 권한이 없습니다.' });
      return;
    }

    await prisma.clubContactPost.delete({
      where: { id: postId }
    });

    res.json({ ok: true });
  } catch (error) {
    next(error);
  }
});

export default router;
