import { API_BASE, apiFetch, type ApprovalStatus } from './auth';

export type ClubRole = '일반' | '임원' | '부회장' | '회장' | '관리자';
export type AppointableClubRole = '일반' | '임원' | '부회장' | '회장';
export type TrainingType = '기본' | '호구';

export type MemberRow = {
  id: string;
  linkedUserId: string | null;
  email: string | null;
  year: number | null;
  studentId: number | null;
  grade: number | null;
  age: number | null;
  name: string;
  trainingType: TrainingType | null;
  department: string | null;
  role: ClubRole;
  roleDetail: string | null;
  isAdmin: boolean;
};

export type RosterSummary = {
  id: string;
  title: string;
  rosterYear: number;
  savedAt: string;
  isActive: boolean;
  count: number;
};

export type LoadedRoster = {
  id: string;
  title: string;
  rosterYear: number;
  savedAt: string;
  isActive: boolean;
  stats: {
    total: number;
    general: number;
    executive: number;
  };
  members: MemberRow[];
};

export type RosterBootstrap = {
  latestRosterId: string | null;
  items: RosterSummary[];
  roster: LoadedRoster | null;
};

export type MoneyRow = {
  id: string;
  category: string | null;
  item: string | null;
  note: string | null;
  income: number | null;
  expense: number | null;
  remainingFee: number | null;
  leftFee: number | null;
  checked?: boolean;
};

export type MoneySnapshotSummary = {
  id: string;
  title: string;
  savedAt: string;
  isActive: boolean;
  count: number;
};

export type LoadedMoneySnapshot = {
  id: string;
  title: string;
  savedAt: string;
  isActive: boolean;
  entries: MoneyRow[];
};

export type MoneyBootstrap = {
  latestSnapshotId: string | null;
  items: MoneySnapshotSummary[];
  snapshot: LoadedMoneySnapshot | null;
};

export type PendingApprovalApplicant = {
  id: string;
  email: string;
  displayName: string;
  studentId: string;
  department: string;
  grade: number | null;
  age: number | null;
  trainingType: TrainingType;
  requestedAt: string | null;
  assignedRole?: AppointableClubRole | null;
};

export type PendingApprovalResponse = {
  count: number;
  items: PendingApprovalApplicant[];
};

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await apiFetch(`${API_BASE}${path}`, {
    headers: {
      'Content-Type': 'application/json',
      ...(init?.headers ?? {})
    },
    ...init
  });

  if (!response.ok) {
    const json = (await response.json().catch(() => ({}))) as { message?: string };
    throw new Error(json.message ?? '요청 처리 중 오류가 발생했습니다.');
  }

  return (await response.json()) as T;
}

export async function fetchRosterBootstrap(rosterId?: string | null) {
  const query = rosterId ? `?rosterId=${encodeURIComponent(rosterId)}` : '';
  return request<RosterBootstrap>(`/club/rosters/bootstrap${query}`);
}

export async function fetchRosterSummaries() {
  return request<{ latestRosterId: string | null; items: RosterSummary[] }>('/club/rosters');
}

export async function fetchRoster(id: string) {
  return request<LoadedRoster>(`/club/rosters/${id}`);
}

export async function saveRoster(payload: {
  baseRosterId: string | null;
  title: string | null;
  members: MemberRow[];
  mode: 'overwrite' | 'clone';
}) {
  return request<{ ok: true; roster: LoadedRoster; summary: RosterSummary }>('/club/rosters/save', {
    method: 'POST',
    body: JSON.stringify(payload)
  });
}

export async function fetchMoneyBootstrap(snapshotId?: string | null) {
  const query = snapshotId ? `?snapshotId=${encodeURIComponent(snapshotId)}` : '';
  return request<MoneyBootstrap>(`/club/money-snapshots/bootstrap${query}`);
}

export async function fetchMoneySnapshotSummaries() {
  return request<{ latestSnapshotId: string | null; items: MoneySnapshotSummary[] }>('/club/money-snapshots');
}

export async function fetchMoneySnapshot(id: string) {
  return request<LoadedMoneySnapshot>(`/club/money-snapshots/${id}`);
}

export async function saveMoneySnapshot(payload: { baseSnapshotId: string | null; entries: MoneyRow[] }) {
  return request<{ ok: true; snapshot: LoadedMoneySnapshot; summary: MoneySnapshotSummary }>('/club/money-snapshots/save', {
    method: 'POST',
    body: JSON.stringify(payload)
  });
}

export async function fetchPendingApprovalApplicants() {
  return request<PendingApprovalResponse>('/club/approval/pending');
}

export async function decidePendingApprovalApplicants(payload: {
  userIds: string[];
  action: 'approve' | 'reject';
  roleByUserId?: Record<string, AppointableClubRole>;
}) {
  return request<PendingApprovalResponse & { ok: true; processed: number }>('/club/approval/decide', {
    method: 'POST',
    body: JSON.stringify(payload)
  });
}

export function makeDraftMember(year: number | null): MemberRow {
  return {
    id: `draft:${crypto.randomUUID()}`,
    linkedUserId: null,
    email: null,
    year,
    studentId: null,
    grade: null,
    age: null,
    name: '',
    trainingType: '기본',
    department: '',
    role: '일반',
    roleDetail: null,
    isAdmin: false
  };
}

export function makeDraftMoneyRow(): MoneyRow {
  return {
    id: `draft:${crypto.randomUUID()}`,
    category: '회비',
    item: '',
    note: '',
    income: null,
    expense: null,
    remainingFee: null,
    leftFee: null,
    checked: false
  };
}

export function formatNumber(value: number | null | undefined) {
  if (value === null || value === undefined || Number.isNaN(value)) return '';
  return new Intl.NumberFormat('ko-KR').format(value);
}

export function parseNullableInt(value: string) {
  const trimmed = value.trim().replace(/,/g, '');
  if (!trimmed) return null;
  const parsed = Number(trimmed);
  return Number.isInteger(parsed) ? parsed : null;
}

export function recalculateMoneyRows(rows: MoneyRow[]) {
  let running = 0;
  return rows.map((row) => {
    running += (row.income ?? 0) - (row.expense ?? 0);
    return {
      ...row,
      remainingFee: running
    };
  });
}

export function displayRoleLabel(row: Pick<MemberRow, 'isAdmin' | 'role'> | { isAdmin?: boolean; role?: string | null }) {
  if (row.isAdmin || row.role === '관리자') return 'Admin';
  return row.role ?? '일반';
}

export function sortAdminLast<T extends { isAdmin: boolean }>(rows: T[]) {
  return [...rows].sort((left, right) => {
    if (left.isAdmin === right.isAdmin) return 0;
    return left.isAdmin ? 1 : -1;
  });
}

export function insertBeforeAdmin<T extends { isAdmin: boolean }>(rows: T[], newRow: T) {
  const adminIndex = rows.findIndex((row) => row.isAdmin);
  if (adminIndex === -1) return [...rows, newRow];
  return [...rows.slice(0, adminIndex), newRow, ...rows.slice(adminIndex)];
}

export function roleOptionsForActor(actorRole: ClubRole, target: MemberRow, isSelf: boolean): AppointableClubRole[] {
  if (target.isAdmin) return [];

  if (actorRole === '관리자') {
    return ['일반', '임원', '부회장', '회장'];
  }

  if (actorRole === '회장') {
    if (target.role === '일반') return ['임원', '부회장', '회장'];
    if (target.role === '임원') return ['일반', '부회장', '회장'];
    if (target.role === '부회장') return ['일반', '임원', '회장'];
    if (target.role === '회장') return isSelf ? ['일반', '임원', '부회장'] : ['일반', '임원', '부회장'];
  }

  if (actorRole === '부회장') {
    if (target.role === '일반') return ['임원', '부회장'];
    if (target.role === '임원') return ['일반', '부회장'];
    if (target.role === '부회장' && isSelf) return ['일반', '임원'];
  }

  return [];
}

export type BoardPageSlug = 'gym' | 'mt';

export type BoardPageContent = {
  slug: BoardPageSlug;
  title: string;
  bodyHtml: string;
  placeName: string;
  address: string;
  mapLink: string;
  updatedAt: string;
  canEdit: boolean;
};

export async function fetchBoardPage(slug: BoardPageSlug) {
  return request<BoardPageContent>(`/club/pages/${slug}`);
}

export async function saveBoardPage(
  slug: BoardPageSlug,
  payload: { title: string; bodyHtml: string; placeName: string; address: string; mapLink: string }
) {
  return request<BoardPageContent>(`/club/pages/${slug}`, {
    method: 'PUT',
    body: JSON.stringify(payload)
  });
}

export type ScheduleEventRecord = {
  id: string;
  title: string;
  displayNote: string | null;
  startDate: string;
  endDate: string;
  colorHex: string;
  sortOrder: number;
};

export async function fetchScheduleEvents() {
  return request<ScheduleEventRecord[]>('/club/schedule/events');
}

export async function saveScheduleEvents(
  events: Array<{
    title: string;
    displayNote: string | null;
    startDate: string;
    endDate: string;
    colorHex: string;
    sortOrder: number;
  }>
) {
  return request<ScheduleEventRecord[]>('/club/schedule/events/save', {
    method: 'POST',
    body: JSON.stringify({ events })
  });
}

export type NoticeSummary = {
  id: string;
  title: string;
  authorDisplayName: string;
  createdAt: string;
  updatedAt: string;
  viewCount: number;
  isPinned: boolean;
};

export type NoticeAttachmentSummary = {
  id: string;
  fileName: string;
  mimeType: string;
  fileSize: number;
  downloadUrl: string;
};

export type NoticeDetail = NoticeSummary & {
  bodyHtml: string;
  canEdit: boolean;
  attachments: NoticeAttachmentSummary[];
};

export async function fetchNoticePosts(params: {
  page?: number;
  query?: string;
  field?: 'all' | 'title' | 'body' | 'author';
}) {
  const search = new URLSearchParams();
  search.set('page', String(params.page ?? 1));
  search.set('field', params.field ?? 'all');
  if (params.query?.trim()) search.set('query', params.query.trim());
  return request<{
    currentPage: number;
    totalPages: number;
    totalCount: number;
    pinnedItems: NoticeSummary[];
    items: NoticeSummary[];
  }>(`/club/notice/posts?${search.toString()}`);
}

export async function fetchNoticePost(postId: string) {
  return request<NoticeDetail>(`/club/notice/posts/${postId}`);
}

export async function createNoticePost(formData: FormData) {
  const response = await apiFetch(`${API_BASE}/club/notice/posts`, {
    method: 'POST',
    body: formData
  });

  if (!response.ok) {
    const json = (await response.json().catch(() => ({}))) as { message?: string };
    throw new Error(json.message ?? '공지 등록에 실패했습니다.');
  }

  return (await response.json()) as NoticeDetail;
}

export async function updateNoticePost(postId: string, formData: FormData) {
  const response = await apiFetch(`${API_BASE}/club/notice/posts/${postId}`, {
    method: 'PUT',
    body: formData
  });

  if (!response.ok) {
    const json = (await response.json().catch(() => ({}))) as { message?: string };
    throw new Error(json.message ?? '공지 수정에 실패했습니다.');
  }

  return (await response.json()) as NoticeDetail;
}

export async function deleteNoticePost(postId: string) {
  return request<{ ok: true }>(`/club/notice/posts/${postId}`, {
    method: 'DELETE'
  });
}

export async function pinNoticePosts(postIds: string[]) {
  return request<{ ok: true }>('/club/notice/posts/pin', {
    method: 'POST',
    body: JSON.stringify({ postIds })
  });
}

export async function unpinNoticePosts(postIds: string[]) {
  return request<{ ok: true }>('/club/notice/posts/unpin', {
    method: 'POST',
    body: JSON.stringify({ postIds })
  });
}

export type ContactPostSummary = {
  id: string;
  title: string;
  isSecret: boolean;
  isAnonymous: boolean;
  authorDisplayName: string;
  createdAt: string;
  viewCount: number;
  canOpen: boolean;
};

export type ContactPostDetail = {
  id: string;
  title: string;
  bodyHtml: string;
  isSecret: boolean;
  isAnonymous: boolean;
  authorDisplayName: string;
  realAuthorName: string;
  canRevealAuthor: boolean;
  isAuthor?: boolean;
  canEdit?: boolean;
  canDelete?: boolean;
  createdAt: string;
  updatedAt: string;
  viewCount: number;
};

export type ContactListResponse = {
  currentPage: number;
  totalPages: number;
  totalCount: number;
  items: ContactPostSummary[];
};

export async function fetchContactPosts(params: {
  page?: number;
  query?: string;
  field?: 'all' | 'title' | 'content';
}) {
  const search = new URLSearchParams();
  search.set('page', String(params.page ?? 1));
  search.set('field', params.field ?? 'all');
  if (params.query?.trim()) search.set('query', params.query.trim());
  return request<ContactListResponse>(`/club/contact/posts?${search.toString()}`);
}

export async function fetchContactPost(postId: string) {
  return request<ContactPostDetail>(`/club/contact/posts/${postId}`);
}

export async function createContactPost(payload: {
  title: string;
  bodyHtml: string;
  isSecret: boolean;
  isAnonymous: boolean;
}) {
  return request<ContactPostDetail>('/club/contact/posts', {
    method: 'POST',
    body: JSON.stringify(payload)
  });
}

export async function updateContactPost(
  postId: string,
  payload: {
    title: string;
    bodyHtml: string;
    isSecret: boolean;
    isAnonymous: boolean;
  }
) {
  return request<ContactPostDetail>(`/club/contact/posts/${postId}`, {
    method: 'PUT',
    body: JSON.stringify(payload)
  });
}

export async function deleteContactPost(postId: string) {
  return request<{ ok: true }>(`/club/contact/posts/${postId}`, {
    method: 'DELETE'
  });
}

export function approvalStatusLabel(status: ApprovalStatus) {
  switch (status) {
    case 'PENDING':
      return '승인 대기 중';
    case 'APPROVED':
      return '승인됨';
    case 'REJECTED':
      return '거절됨';
    default:
      return '프로필 입력 필요';
  }
}