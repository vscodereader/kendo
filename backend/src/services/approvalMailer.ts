import nodemailer from 'nodemailer';
import { prisma } from '../lib/prisma.js';
import {
  canManageRoster,
  getLatestRoster,
  getRootAdminUser,
  normalizeApprovalStatus,
  normalizeClubRole,
  normalizeTrainingType,
  type TrainingType
} from '../lib/club.js';

const SMTP_USER = process.env.SMTP_USER?.trim();
const SMTP_APP_PASSWORD = process.env.SMTP_APP_PASSWORD?.trim();
const CLIENT_URL = (process.env.CLIENT_URL ?? 'http://localhost:5173').replace(/\/$/, '');
const PORTAL_URL = `${CLIENT_URL}/main`;

type PendingApplicant = {
  id: string;
  email: string;
  displayName: string;
  studentId: string;
  department: string;
  grade: number | null;
  age: number | null;
  trainingType: TrainingType;
  requestedAt: Date | null;
};

function createTransporter() {
  if (!SMTP_USER || !SMTP_APP_PASSWORD) {
    return null;
  }

  return nodemailer.createTransport({
    host: 'smtp.gmail.com',
    port: 465,
    secure: true,
    auth: {
      user: SMTP_USER,
      pass: SMTP_APP_PASSWORD
    }
  });
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function formatDateTime(value: Date | null) {
  if (!value) return '-';

  return new Intl.DateTimeFormat('ko-KR', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  }).format(value);
}

export async function listPendingApprovalApplicants() {
  const items = await prisma.user.findMany({
    where: {
      approvalStatus: 'PENDING',
      studentId: { not: null },
      displayName: { not: null },
      department: { not: null },
      agreedPersonalPolicyAt: { not: null }
    },
    orderBy: [{ approvalRequestedAt: 'asc' }, { createdAt: 'asc' }]
  });

  return items.map<PendingApplicant>((item) => ({
    id: item.id,
    email: item.email,
    displayName: item.displayName ?? item.googleName ?? item.email,
    studentId: item.studentId ?? '',
    department: item.department ?? '',
    grade: item.grade ?? null,
    age: item.age ?? null,
    trainingType: normalizeTrainingType(item.trainingType),
    requestedAt: item.approvalRequestedAt ?? null
  }));
}

export async function countPendingApprovalApplicants() {
  return prisma.user.count({
    where: {
      approvalStatus: 'PENDING',
      studentId: { not: null },
      displayName: { not: null },
      department: { not: null },
      agreedPersonalPolicyAt: { not: null }
    }
  });
}

export async function listApprovalRecipientEmails() {
  const recipients = new Set<string>();
  const latestRoster = await getLatestRoster();

  if (latestRoster) {
    const approvers = await prisma.clubMember.findMany({
      where: {
        rosterId: latestRoster.id,
        OR: [{ isAdmin: true }, { role: { in: ['임원', '부회장', '회장', '관리자'] } }]
      },
      include: {
        linkedUser: {
          select: {
            email: true,
            approvalStatus: true
          }
        }
      }
    });

    for (const item of approvers) {
      const role = item.isAdmin ? '관리자' : normalizeClubRole(item.role);
      if (!item.isAdmin && !canManageRoster(role)) continue;

      const linkedEmail = item.linkedUser?.email?.trim().toLowerCase() ?? '';
      const linkedApproved = normalizeApprovalStatus(item.linkedUser?.approvalStatus) === 'APPROVED';
      if (linkedEmail && linkedApproved) {
        recipients.add(linkedEmail);
        continue;
      }

      const directEmail = item.email?.trim().toLowerCase() ?? '';
      if (directEmail) {
        recipients.add(directEmail);
      }
    }
  }

  const rootAdmin = await getRootAdminUser();
  const rootEmail = rootAdmin?.email?.trim().toLowerCase() ?? '';
  if (rootEmail) recipients.add(rootEmail);

  return [...recipients];
}

function buildApplicantsTableRows(applicants: PendingApplicant[]) {
  return applicants
    .map(
      (applicant) => `
        <tr>
          <td style="padding:10px;border:1px solid #d6d6d6;">${escapeHtml(applicant.studentId)}</td>
          <td style="padding:10px;border:1px solid #d6d6d6;">${escapeHtml(applicant.displayName)}</td>
          <td style="padding:10px;border:1px solid #d6d6d6;">${escapeHtml(applicant.department)}</td>
          <td style="padding:10px;border:1px solid #d6d6d6;">${applicant.grade ?? '-'}</td>
          <td style="padding:10px;border:1px solid #d6d6d6;">${applicant.age ?? '-'}</td>
          <td style="padding:10px;border:1px solid #d6d6d6;">${escapeHtml(applicant.trainingType)}</td>
          <td style="padding:10px;border:1px solid #d6d6d6;">${escapeHtml(applicant.email)}</td>
          <td style="padding:10px;border:1px solid #d6d6d6;">${escapeHtml(formatDateTime(applicant.requestedAt))}</td>
        </tr>
      `
    )
    .join('');
}

export async function sendPendingApprovalDigestMail(reason: 'immediate' | 'daily-reminder') {
  const transporter = createTransporter();
  if (!transporter) {
    console.warn('[approval-mail] SMTP 설정이 없어 승인 알림 메일을 보내지 않습니다.');
    return { ok: false as const, sent: false, reason: 'smtp-not-configured', recipientCount: 0, pendingCount: 0 };
  }

  const [pendingApplicants, recipientEmails] = await Promise.all([
    listPendingApprovalApplicants(),
    listApprovalRecipientEmails()
  ]);

  if (pendingApplicants.length === 0) {
    return { ok: true as const, sent: false, reason: 'no-pending-applicants', recipientCount: 0, pendingCount: 0 };
  }

  if (recipientEmails.length === 0) {
    return { ok: false as const, sent: false, reason: 'no-approver-email', recipientCount: 0, pendingCount: pendingApplicants.length };
  }

  const subject = reason === 'immediate'
    ? '[가천대학교 검도부] 새로운 가입자가 기다리고 있어요!'
    : '[가천대학교 검도부] 아직 승인 대기 중인 가입자가 있어요!';

  const intro = reason === 'immediate'
    ? '새로운 가입자가 프로필 입력을 완료하고 승인을 기다리고 있습니다.'
    : '아직 승인 또는 거절되지 않은 가입자가 남아 있습니다.';

  const html = `
    <div style="font-family:Arial,'Apple SD Gothic Neo','Malgun Gothic',sans-serif;line-height:1.6;color:#111;">
      <h2 style="margin:0 0 16px;">새로운 가입자가 기다리고 있어요!</h2>
      <p style="margin:0 0 12px;">${escapeHtml(intro)}</p>
      <table style="border-collapse:collapse;width:100%;margin:16px 0;background:#fff;">
        <thead>
          <tr style="background:#f5f6fb;">
            <th style="padding:10px;border:1px solid #d6d6d6;">학번</th>
            <th style="padding:10px;border:1px solid #d6d6d6;">이름</th>
            <th style="padding:10px;border:1px solid #d6d6d6;">학과</th>
            <th style="padding:10px;border:1px solid #d6d6d6;">학년</th>
            <th style="padding:10px;border:1px solid #d6d6d6;">나이</th>
            <th style="padding:10px;border:1px solid #d6d6d6;">교육반</th>
            <th style="padding:10px;border:1px solid #d6d6d6;">이메일</th>
            <th style="padding:10px;border:1px solid #d6d6d6;">신청 시각</th>
          </tr>
        </thead>
        <tbody>
          ${buildApplicantsTableRows(pendingApplicants)}
        </tbody>
      </table>
      <div style="margin-top:20px;">
        <a href="${PORTAL_URL}" style="display:inline-block;padding:12px 20px;border-radius:12px;background:#5f6cf5;color:#fff;text-decoration:none;font-weight:700;">지금 가요!</a>
      </div>
    </div>
  `;

  const text = [
    '새로운 가입자가 기다리고 있어요!',
    intro,
    '',
    ...pendingApplicants.map((applicant) =>
      `- ${applicant.displayName} / ${applicant.studentId} / ${applicant.department} / ${applicant.grade ?? '-'}학년 / ${applicant.age ?? '-'}세 / ${applicant.trainingType} / ${applicant.email}`
    ),
    '',
    `검토하러 가기: ${PORTAL_URL}`
  ].join('\n');

  await transporter.sendMail({
    from: SMTP_USER,
    to: SMTP_USER,
    bcc: recipientEmails.join(','),
    subject,
    text,
    html
  });

  return {
    ok: true as const,
    sent: true,
    reason,
    recipientCount: recipientEmails.length,
    pendingCount: pendingApplicants.length
  };
}