import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../lib/auth';
import { useToast } from '../lib/toast';
import { apiFetch } from '../lib/auth';

const API_BASE = import.meta.env.VITE_API_BASE ?? '/api';

type EventPostSummary = {
  id: string;
  title: string;
  authorDisplayName: string;
  createdAt: string;
  updatedAt: string;
  viewCount: number;
  isPinned: boolean;
};

type EventListResponse = {
  currentPage: number;
  totalPages: number;
  totalCount: number;
  pinnedItems: EventPostSummary[];
  items: EventPostSummary[];
};

type SearchField = 'all' | 'title' | 'body' | 'author';

async function apiRequest<T>(path: string, init?: RequestInit) {
  const response = await apiFetch(`${API_BASE}${path}`, init);

  const contentType = response.headers.get('content-type') ?? '';
  const payload = contentType.includes('application/json') ? await response.json() : null;

  if (!response.ok) {
    throw new Error((payload as { message?: string } | null)?.message ?? '요청에 실패했습니다.');
  }

  return payload as T;
}

function formatDate(value: string) {
  const date = new Date(value);
  return `${date.getFullYear()}.${String(date.getMonth() + 1).padStart(2, '0')}.${String(
    date.getDate()
  ).padStart(2, '0')}`;
}

function EventsListPage() {
  const navigate = useNavigate();
  const { pushToast } = useToast();
  const { user } = useAuth();

  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [field, setField] = useState<SearchField>('title');
  const [queryInput, setQueryInput] = useState('');
  const [query, setQuery] = useState('');
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [items, setItems] = useState<EventPostSummary[]>([]);
  const [pinnedItems, setPinnedItems] = useState<EventPostSummary[]>([]);
  const [totalPages, setTotalPages] = useState(1);
  const [totalCount, setTotalCount] = useState(0);

  const canManage = useMemo(() => {
    if (!user) return false;
    if (user.isRoot) return true;
    return ['임원', '부회장', '회장'].includes(user.clubRole ?? '일반');
  }, [user]);

  const load = async () => {
    setLoading(true);
    try {
      const search = new URLSearchParams();
      search.set('page', String(page));
      search.set('field', field);
      if (query.trim()) search.set('query', query.trim());

      const result = await apiRequest<EventListResponse>(`/club/events/posts?${search.toString()}`);

      setItems(result.items ?? []);
      setPinnedItems(result.pinnedItems ?? []);
      setTotalPages(result.totalPages ?? 1);
      setTotalCount(result.totalCount ?? 0);
      setSelectedIds([]);
    } catch (error) {
      pushToast(
        error instanceof Error ? error.message : '대회 및 심사 일정 목록을 불러오지 못했습니다.',
        'error'
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, [page, field, query]);

  const toggleSelected = (postId: string) => {
    setSelectedIds((current) =>
      current.includes(postId) ? current.filter((id) => id !== postId) : [...current, postId]
    );
  };

  const handlePin = async () => {
    if (selectedIds.length === 0) {
      pushToast('고정할 게시글을 선택해주세요.', 'error');
      return;
    }

    try {
      await apiRequest('/club/events/posts/pin', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ postIds: selectedIds })
      });

      pushToast('고정되었습니다.', 'success');
      void load();
    } catch (error) {
      pushToast(error instanceof Error ? error.message : '고정에 실패했습니다.', 'error');
    }
  };

  const handleUnpin = async () => {
    if (selectedIds.length === 0) {
      pushToast('고정 해제할 게시글을 선택해주세요.', 'error');
      return;
    }

    try {
      await apiRequest('/club/events/posts/unpin', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ postIds: selectedIds })
      });

      pushToast('고정 해제되었습니다.', 'success');
      void load();
    } catch (error) {
      pushToast(error instanceof Error ? error.message : '고정 해제에 실패했습니다.', 'error');
    }
  };

  const visibleItems = page === 1 ? [...pinnedItems, ...items] : items;

  return (
    <div className="page-shell themed-page-shell">
      <div className="notice-page-card">
        <div className="notice-search-card">
          <div className="notice-search-title">검색하기</div>

          <div className="notice-search-controls">
            <select value={field} onChange={(event) => setField(event.target.value as SearchField)}>
              <option value="title">제목</option>
              <option value="body">본문</option>
              <option value="author">작성자</option>
              <option value="all">전체</option>
            </select>

            <input
              value={queryInput}
              onChange={(event) => setQueryInput(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  setPage(1);
                  setQuery(queryInput.trim());
                }
              }}
              placeholder="검색어를 입력해 주세요."
            />

            <button
              className="ghost-btn"
              onClick={() => {
                setPage(1);
                setQuery(queryInput.trim());
              }}
            >
              검색
            </button>
          </div>
        </div>

        <div className="notice-list-summary">
          <span>{totalCount}건</span>
          <span>
            현재페이지: {page}/{totalPages}
          </span>
        </div>

        <div className="notice-table-wrap">
          <table className="notice-table">
            <thead>
              <tr>
                {canManage ? <th className="notice-check-col"></th> : null}
                <th className="notice-no-col">NO</th>
                <th className="notice-title-cell">제목</th>
                <th className="notice-author-col">작성자</th>
                <th className="notice-date-col">작성일</th>
                <th className="notice-view-col">조회수</th>
              </tr>
            </thead>

            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={canManage ? 6 : 5} className="notice-empty-row">
                    불러오는 중입니다.
                  </td>
                </tr>
              ) : visibleItems.length === 0 ? (
                <tr>
                  <td colSpan={canManage ? 6 : 5} className="notice-empty-row">
                    등록된 게시글이 없습니다.
                  </td>
                </tr>
              ) : (
                visibleItems.map((item, index) => {
                  const isPinnedRow = page === 1 && index < pinnedItems.length;
                  const regularIndex = index - pinnedItems.length;
                  const rowNumber = totalCount - ((page - 1) * 10 + regularIndex);

                  return (
                    <tr key={item.id} className={item.isPinned ? 'notice-row--pinned' : ''}>
                      {canManage ? (
                        <td className="notice-check-col">
                          <input
                            type="checkbox"
                            checked={selectedIds.includes(item.id)}
                            onChange={() => toggleSelected(item.id)}
                          />
                        </td>
                      ) : null}

                      <td className="notice-no-col">{isPinnedRow ? '📌' : rowNumber}</td>

                      <td className="notice-title-cell">
                        <button
                          className="notice-title-link"
                          onClick={() => navigate(`/events/${item.id}`)}
                        >
                          {item.isPinned ? <span className="notice-pin-icon">📌</span> : null}
                          <span>{item.title}</span>
                        </button>
                      </td>

                      <td className="notice-author-col">{item.authorDisplayName}</td>
                      <td className="notice-date-col">{formatDate(item.createdAt)}</td>
                      <td className="notice-view-col">{item.viewCount}</td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {canManage ? (
          <div className="notice-bulk-actions">
            <button className="ghost-btn" onClick={() => void handlePin()}>
              고정하기
            </button>
            <button className="ghost-btn" onClick={() => void handleUnpin()}>
              고정해제
            </button>
            <button className="primary-btn" onClick={() => navigate('/events/write')}>
              글쓰기
            </button>
          </div>
        ) : null}

        <div className="notice-pagination">
          <button className="notice-page-btn" disabled={page <= 1} onClick={() => setPage(1)}>
            {'<<'}
          </button>
          <button
            className="notice-page-btn"
            disabled={page <= 1}
            onClick={() => setPage((current) => Math.max(1, current - 1))}
          >
            {'<'}
          </button>
          <button className="notice-page-btn notice-page-btn--active" disabled>
            {page}
          </button>
          <button
            className="notice-page-btn"
            disabled={page >= totalPages}
            onClick={() => setPage((current) => Math.min(totalPages, current + 1))}
          >
            {'>'}
          </button>
          <button
            className="notice-page-btn"
            disabled={page >= totalPages}
            onClick={() => setPage(totalPages)}
          >
            {'>>'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default EventsListPage;