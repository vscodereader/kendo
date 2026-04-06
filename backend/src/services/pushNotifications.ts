import { cert, getApps, initializeApp } from 'firebase-admin/app';
import { getMessaging, type Messaging, type MulticastMessage } from 'firebase-admin/messaging';

import { prisma } from '../lib/prisma.js';

const APP_TITLE = '가천대 검도부';
const MANAGER_ROLES = ['임원', '부회장', '회장'] as const;

export type PushTargetPath =
  | '/main'
  | '/notice'
  | '/events'
  | '/contact'
  | '/moneypaid'
  | '/MT'
  | '/members';

export type PushAudience = 'all' | 'managers' | 'reviewers';

export type RegisterPushDeviceInput = {
  installationId: string;
  pushToken: string;
  platform: string;
  appVersion?: string | null;
  userId?: string | null;
};

export type SendPushInput = {
  audience: PushAudience;
  body: string;
  targetPath: PushTargetPath;
};

type FirebaseServiceAccount = {
  project_id: string;
  client_email: string;
  private_key: string;
};

function readFirebaseServiceAccount(): FirebaseServiceAccount | null {
  const rawJson = process.env.FIREBASE_SERVICE_ACCOUNT_JSON?.trim();
  const rawBase64 = process.env.FIREBASE_SERVICE_ACCOUNT_BASE64?.trim();

  try {
    if (rawJson) {
      return JSON.parse(rawJson) as FirebaseServiceAccount;
    }

    if (rawBase64) {
      return JSON.parse(Buffer.from(rawBase64, 'base64').toString('utf8')) as FirebaseServiceAccount;
    }
  } catch (error) {
    console.error('[push] Firebase 서비스 계정 파싱 실패', error);
  }

  return null;
}

function getMessagingOrNull(): Messaging | null {
  const serviceAccount = readFirebaseServiceAccount();

  if (!serviceAccount) return null;

  if (getApps().length === 0) {
    initializeApp({
      credential: cert({
        projectId: serviceAccount.project_id,
        clientEmail: serviceAccount.client_email,
        privateKey: serviceAccount.private_key.replace(/\\n/g, '\n'),
      }),
    });
  }

  return getMessaging();
}

function chunk<T>(items: T[], size: number) {
  const chunks: T[][] = [];

  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }

  return chunks;
}

async function getManagerUserIds() {
  const activeRoster = await prisma.memberRoster.findFirst({
    where: { isActive: true },
    orderBy: [{ savedAt: 'desc' }, { createdAt: 'desc' }],
    include: {
      members: {
        where: {
          linkedUserId: { not: null },
          OR: [{ isAdmin: true }, { role: { in: [...MANAGER_ROLES] } }],
        },
        select: { linkedUserId: true },
      },
    },
  });

  const ids = new Set<string>();

  for (const member of activeRoster?.members ?? []) {
    if (member.linkedUserId) {
      ids.add(member.linkedUserId);
    }
  }

  const roots = await prisma.user.findMany({
    where: { systemRole: 'ROOT' },
    select: { id: true },
  });

  for (const root of roots) {
    ids.add(root.id);
  }

  return [...ids];
}

export async function registerPushDevice(input: RegisterPushDeviceInput) {
  console.log('[registerPushDevice] raw input =', input);

  const installationId = String(input.installationId || '').trim();
  const pushToken = String(input.pushToken || '').trim();
  const platform = String(input.platform || '').trim();
  const appVersion = input.appVersion?.trim() || null;
  const userId = input.userId?.trim() || null;

  console.log('[registerPushDevice] normalized =', {
    installationId,
    pushTokenLength: pushToken.length,
    platform,
    appVersion,
    userId,
  });

  if (!installationId || !pushToken || !platform) {
    throw new Error('푸시 등록 정보가 올바르지 않습니다.');
  }

  await prisma.pushDevice.updateMany({
    where: {
      installationId,
      platform,
      pushToken: { not: pushToken },
    },
    data: { notificationsEnabled: false },
  });

  const saved = await prisma.pushDevice.upsert({
    where: { pushToken },
    update: {
      installationId,
      userId,
      platform,
      appVersion,
      notificationsEnabled: true,
      lastSeenAt: new Date(),
    },
    create: {
      installationId,
      userId,
      pushToken,
      platform,
      appVersion,
      notificationsEnabled: true,
    },
  });

  console.log('[registerPushDevice] saved =', saved);

  return saved;
}

async function getAudienceDevices(audience: PushAudience) {
  if (audience === 'all') {
    return prisma.pushDevice.findMany({
      where: { notificationsEnabled: true },
      orderBy: [{ updatedAt: 'desc' }],
    });
  }

  const managerUserIds = await getManagerUserIds();

  if (managerUserIds.length === 0) {
    return [];
  }

  return prisma.pushDevice.findMany({
    where: {
      notificationsEnabled: true,
      userId: { in: managerUserIds },
    },
    orderBy: [{ updatedAt: 'desc' }],
  });
}

async function disableInvalidTokens(tokens: string[]) {
  if (tokens.length === 0) return;

  await prisma.pushDevice.updateMany({
    where: {
      pushToken: { in: tokens },
    },
    data: {
      notificationsEnabled: false,
    },
  });
}

async function sendInChunks(
  messaging: Messaging,
  tokens: string[],
  payloadBase: Omit<MulticastMessage, 'tokens'>,
  invalidTokens: Set<string>
) {
  let delivered = 0;
  let failed = 0;

  for (const tokenChunk of chunk(tokens, 500)) {
    const response = await messaging.sendEachForMulticast({
      ...payloadBase,
      tokens: tokenChunk,
    });

    delivered += response.successCount;
    failed += response.failureCount;

    response.responses.forEach((item, index) => {
      const code = item.error?.code;

      if (
        code === 'messaging/registration-token-not-registered' ||
        code === 'messaging/invalid-registration-token'
      ) {
        invalidTokens.add(tokenChunk[index]);
      }
    });
  }

  return { delivered, failed };
}

export async function sendPushNotification(input: SendPushInput) {
  const messaging = getMessagingOrNull();

  if (!messaging) {
    return { ok: false as const, skipped: 'firebase-not-configured' as const };
  }

  const devices = await getAudienceDevices(input.audience);

  const nativeTokens = [
    ...new Set(
      devices
        .filter((item) => item.platform !== 'web')
        .map((item) => item.pushToken)
        .filter(Boolean)
    ),
  ];

  const webTokens = [
    ...new Set(
      devices
        .filter((item) => item.platform === 'web')
        .map((item) => item.pushToken)
        .filter(Boolean)
    ),
  ];

  if (nativeTokens.length === 0 && webTokens.length === 0) {
    return { ok: true as const, delivered: 0, failed: 0 };
  }

  const invalidTokens = new Set<string>();
  let delivered = 0;
  let failed = 0;

  if (nativeTokens.length > 0) {
    const nativeResult = await sendInChunks(
      messaging,
      nativeTokens,
      {
        notification: {
          title: APP_TITLE,
          body: input.body,
        },
        data: {
          title: APP_TITLE,
          body: input.body,
          targetPath: input.targetPath,
        },
        android: {
          priority: 'high',
          notification: {
            channelId: 'club-updates',
          },
        },
      },
      invalidTokens
    );

    delivered += nativeResult.delivered;
    failed += nativeResult.failed;
  }

  if (webTokens.length > 0) {
    const webResult = await sendInChunks(
      messaging,
      webTokens,
      {
        data: {
          title: APP_TITLE,
          body: input.body,
          targetPath: input.targetPath,
        },
        webpush: {
          headers: {
            Urgency: 'high',
          },
        },
      },
      invalidTokens
    );

    delivered += webResult.delivered;
    failed += webResult.failed;
  }

  await disableInvalidTokens([...invalidTokens]);

  return {
    ok: true as const,
    delivered,
    failed,
  };
}