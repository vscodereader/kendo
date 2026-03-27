import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '../lib/auth';
import { useToast } from '../lib/toast';

const API_BASE = import.meta.env.VITE_API_BASE ?? '/api';
const API_ORIGIN = API_BASE.replace(/\/api$/, '');

type EventAttachment = {
  id: string;
  fileName: string;
  fileSize: number;
  downloadUrl: string;
};

type EventPostDetail = {
  id: string;
  title: string;
  bodyHtml: string;
  authorDisplayName: string;
  createdAt: string;
  updatedAt: string;
  viewCount: number;
  isPinned: boolean;
  attachments: EventAttachment[];
};

type MoneySnapshotEmbedPayload = {
  title: string;
  entries: Array<{
    category: string | null;
    item: string | null;
    note: string | null;
    income: number | null;
    expense: number | null;
    remainingFee: number | null;
    leftFee: number | null;
  }>;
};

async function apiRequest<T>(path: string, init?: RequestInit) {
  const response = await fetch(`${API_BASE}${path}`, {
    credentials: 'include',
    ...init
  });

  const contentType = response.headers.get('content-type') ?? '';
  const payload = contentType.includes('application/json') ? await response.json() : null;

  if (!response.ok) {
    throw new Error(payload?.message ?? '요청에 실패했습니다.');
  }

  return payload as T;
}

function formatDateTime(value: string) {
  const date = new Date(value);
  return `${date.getFullYear()}.${String(date.getMonth() + 1).padStart(2, '0')}.${String(date.getDate()).padStart(2, '0')} ${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}

function formatBytes(value: number) {
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
  return `${(value / 1024 / 1024).toFixed(2)} MB`;
}

function escapeHtml(value: string) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function formatMoney(value: number | null | undefined) {
  if (value === null || value === undefined) return '';
  return Number(value).toLocaleString('ko-KR');
}

function buildMoneyTableHtml(payload: MoneySnapshotEmbedPayload) {
  const rows = payload.entries
    .map(
      (entry) => `
        <tr>
          <td>${escapeHtml(entry.category ?? '')}</td>
          <td>${escapeHtml(entry.item ?? '')}</td>
          <td>${escapeHtml(entry.note ?? '')}</td>
          <td class="money-number-cell">${formatMoney(entry.income)}</td>
          <td class="money-number-cell">${formatMoney(entry.expense)}</td>
          <td class="money-number-cell">${formatMoney(entry.remainingFee)}</td>
        </tr>
      `
    )
    .join('');

  return `
    <div class="notice-money-embed">
      <div class="notice-money-embed__table-wrap">
        <table class="notice-money-table">
          <thead>
            <tr>
              <th>구분</th>
              <th>품목</th>
              <th>비고</th>
              <th>수입금액</th>
              <th>지출금액</th>
              <th>잔여회비</th>
            </tr>
          </thead>
          <tbody>
            ${rows || '<tr><td colspan="6">데이터가 없습니다.</td></tr>'}
          </tbody>
        </table>
      </div>
    </div>
  `.trim();
}

function resolveNoticeBodyHtml(bodyHtml: string) {
  const parser = new DOMParser();
  const doc = parser.parseFromString(`<div id="notice-body-root">${bodyHtml}</div>`, 'text/html');
  const root = doc.getElementById('notice-body-root');

  if (!root) return bodyHtml;

  root.querySelectorAll<HTMLElement>('.notice-money-placeholder').forEach((node) => {
    const raw = node.getAttribute('data-payload');
    if (!raw) return;

    try {
      const payload = JSON.parse(decodeURIComponent(raw)) as MoneySnapshotEmbedPayload;
      const wrapper = doc.createElement('div');
      wrapper.innerHTML = buildMoneyTableHtml(payload);
      const tableNode = wrapper.firstElementChild;
      if (tableNode) {
        node.replaceWith(tableNode);
      } else {
        node.remove();
      }
    } catch {
      node.remove();
    }
  });

  root.querySelectorAll('p').forEach((node) => {
    const text = (node.textContent ?? '').trim();
    if (/^\[[^\]]+첨부\]$/.test(text)) {
      node.remove();
    }
  });

  return root.innerHTML;
}

function EventsDetailPage() {
  const navigate = useNavigate();
  const { pushToast } = useToast();
  const { user } = useAuth();
  const { postId } = useParams();

  const [deleting, setDeleting] = useState(false);
  const [post, setPost] = useState<EventPostDetail | null>(null);
  const [loading, setLoading] = useState(true);

  const canManage = useMemo(() => {
    if (!user) return false;
    if (user.isRoot) return true;
    return ['임원', '부회장', '회장'].includes(user.clubRole ?? '일반');
  }, [user]);

  useEffect(() => {
    if (!postId) return;

    const run = async () => {
      setLoading(true);
      try {
        const result = await apiRequest<EventPostDetail>(`/club/events/posts/${postId}`);
        setPost(result);
      } catch (error) {
        pushToast(error instanceof Error ? error.message : '게시글을 불러오지 못했습니다.', 'error');
        navigate('/events', { replace: true });
      } finally {
        setLoading(false);
      }
    };

    void run();
  }, [postId, pushToast, navigate]);

  const renderedBodyHtml = useMemo(() => {
    if (!post) return '';
    return resolveNoticeBodyHtml(post.bodyHtml);
  }, [post]);

  const handleDelete = async () => {
    if (!postId) return;

    const confirmed = window.confirm('정말 이 게시글을 삭제하시겠습니까?');
    if (!confirmed) return;

    setDeleting(true);
    try {
      await apiRequest(`/club/events/posts/${postId}`, {
        method: 'DELETE'
      });
      pushToast('게시글이 삭제되었습니다.', 'success');
      navigate('/events', { replace: true });
    } catch (error) {
      pushToast(error instanceof Error ? error.message : '게시글 삭제에 실패했습니다.', 'error');
    } finally {
      setDeleting(false);
    }
  };

  if (loading) {
    return (
      <div className="page-shell page-shell--center">
        <div className="simple-card simple-card--loading">
          <h1>게시글을 불러오는 중입니다.</h1>
        </div>
      </div>
    );
  }

  if (!post) return null;

  return (
    <div className="page-shell themed-page-shell">
      <div className="notice-detail-topbar notice-detail-topbar--outside">
        <button className="danger-outline-btn" onClick={() => navigate('/events')}>
          목록으로
        </button>
      </div>

      <div className="notice-detail-card">
        <article className="notice-article">
          <header className="notice-article-header">
            <h1>
              {post.isPinned ? <span className="notice-pin-icon">📌</span> : null}
              {post.title}
            </h1>
            <div className="notice-meta">
              <span>작성자 {post.authorDisplayName}</span>
              <span>작성일 {formatDateTime(post.createdAt)}</span>
              <span>조회수 {post.viewCount}</span>
            </div>
          </header>

          <div className="notice-article-body" dangerouslySetInnerHTML={{ __html: renderedBodyHtml }} />

          {post.attachments?.length ? (
            <section className="notice-attachment-section">
              <div className="notice-attachment-section__title">첨부파일</div>
              <div className="notice-attachment-list">
                {post.attachments.map((attachment) => (
                  <a
                    key={attachment.id}
                    className="notice-attachment-link"
                    href={`${API_ORIGIN}${attachment.downloadUrl}`}
                    target="_blank"
                    rel="noreferrer"
                  >
                    <span>📎 {attachment.fileName}</span>
                    <span>{formatBytes(attachment.fileSize)}</span>
                  </a>
                ))}
              </div>
            </section>
          ) : null}
        </article>
      </div>

      {canManage ? (
        <div className="notice-detail-card-actions">
          <button className="primary-btn" onClick={() => navigate(`/events/${post.id}/edit`)}>
            수정
          </button>
          <button className="danger-btn" onClick={() => void handleDelete()} disabled={deleting}>
            {deleting ? '삭제 중...' : '삭제'}
          </button>
        </div>
      ) : null}
    </div>
  );
}

export default EventsDetailPage;