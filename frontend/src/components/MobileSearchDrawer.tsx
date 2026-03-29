import { useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { API_BASE, apiFetch } from '../lib/auth';
import { fetchContactPosts, fetchNoticePosts } from '../lib/club';
import { useIsMobile } from '../hooks/useIsMobile';
import { useToast } from '../lib/toast';

type Category = 'notice' | 'events' | 'contact';
type NoticeField = 'all' | 'title' | 'body' | 'author';
type EventField = 'all' | 'title' | 'body' | 'author';
type ContactField = 'all' | 'title' | 'content';
type SearchField = NoticeField | EventField | ContactField;

type SearchResult = {
  id: string;
  category: Category;
  path: string;
  title: string;
  subtext: string;
  canOpen?: boolean;
};

type EventSummary = {
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
  pinnedItems: EventSummary[];
  items: EventSummary[];
};

type Props = {
  open: boolean;
  onClose: () => void;
};

const CATEGORY_LABEL: Record<Category, string> = {
  notice: '동아리 공지',
  events: '대회 및 심사 일정',
  contact: '동아리 문의'
};

const FIELD_OPTIONS: Record<Category, Array<{ value: SearchField; label: string }>> = {
  notice: [
    { value: 'all', label: '제목+본문+작성자' },
    { value: 'title', label: '제목' },
    { value: 'body', label: '본문' },
    { value: 'author', label: '작성자' }
  ],
  events: [
    { value: 'all', label: '제목+본문+작성자' },
    { value: 'title', label: '제목' },
    { value: 'body', label: '본문' },
    { value: 'author', label: '작성자' }
  ],
  contact: [
    { value: 'all', label: '제목+내용' },
    { value: 'title', label: '제목' },
    { value: 'content', label: '내용' }
  ]
};

function guessCategory(pathname: string): Category {
  if (pathname.startsWith('/contact')) return 'contact';
  if (pathname.startsWith('/events')) return 'events';
  return 'notice';
}

function formatDate(value: string) {
  const date = new Date(value);
  return `${date.getFullYear()}.${String(date.getMonth() + 1).padStart(2, '0')}.${String(
    date.getDate()
  ).padStart(2, '0')}`;
}

function renderHighlightedTitle(title: string, query: string) {
  const trimmed = query.trim();
  if (!trimmed) return title;

  const lowerTitle = title.toLowerCase();
  const lowerQuery = trimmed.toLowerCase();
  const index = lowerTitle.indexOf(lowerQuery);

  if (index === -1) {
    return title;
  }

  const before = title.slice(0, index);
  const match = title.slice(index, index + trimmed.length);
  const after = title.slice(index + trimmed.length);

  return (
    <>
      {before}
      <mark>{match}</mark>
      {after}
    </>
  );
}

function MobileSearchDrawer({ open, onClose }: Props) {
  const navigate = useNavigate();
  const location = useLocation();
  const isMobile = useIsMobile();
  const { pushToast } = useToast();

  const guessedCategory = useMemo(() => guessCategory(location.pathname), [location.pathname]);

  const [category, setCategory] = useState<Category>(guessedCategory);
  const [field, setField] = useState<SearchField>('all');
  const [queryInput, setQueryInput] = useState('');
  const [appliedQuery, setAppliedQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<SearchResult[]>([]);

  useEffect(() => {
    if (!open) return;
    setCategory(guessedCategory);
    setField('all');
    setQueryInput('');
    setAppliedQuery('');
    setResults([]);
  }, [open, guessedCategory]);

  useEffect(() => {
    setField('all');
  }, [category]);

  const runSearch = async () => {
    const trimmed = queryInput.trim();

    if (!trimmed) {
      pushToast('검색어를 입력해주세요.', 'error');
      return;
    }

    setLoading(true);
    setAppliedQuery(trimmed);

    try {
      if (category === 'notice') {
        const data = await fetchNoticePosts({
          page: 1,
          query: trimmed,
          field: field as NoticeField
        });

        const nextResults: SearchResult[] = [...data.pinnedItems, ...data.items].map((item) => ({
          id: item.id,
          category: 'notice',
          path: `/notice/${item.id}`,
          title: item.title,
          subtext: `${item.authorDisplayName} · ${formatDate(item.createdAt)} · 조회 ${item.viewCount}`
        }));

        setResults(nextResults);
        return;
      }

      if (category === 'contact') {
        const data = await fetchContactPosts({
          page: 1,
          query: trimmed,
          field: field as ContactField
        });

        const nextResults: SearchResult[] = data.items.map((item) => ({
          id: item.id,
          category: 'contact',
          path: `/contact/${item.id}`,
          title: item.title,
          subtext: `${item.authorDisplayName} · ${formatDate(item.createdAt)} · 조회 ${item.viewCount}`,
          canOpen: item.canOpen
        }));

        setResults(nextResults);
        return;
      }

      const search = new URLSearchParams();
      search.set('page', '1');
      search.set('field', String(field));
      search.set('query', trimmed);

      const response = await apiFetch(`${API_BASE}/club/events/posts?${search.toString()}`);
      const payload = (await response.json()) as EventListResponse & { message?: string };

      if (!response.ok) {
        throw new Error(payload.message ?? '검색에 실패했습니다.');
      }

      const nextResults: SearchResult[] = [...payload.pinnedItems, ...payload.items].map((item) => ({
        id: item.id,
        category: 'events',
        path: `/events/${item.id}`,
        title: item.title,
        subtext: `${item.authorDisplayName} · ${formatDate(item.createdAt)} · 조회 ${item.viewCount}`
      }));

      setResults(nextResults);
    } catch (error) {
      pushToast(error instanceof Error ? error.message : '검색에 실패했습니다.', 'error');
      setResults([]);
    } finally {
      setLoading(false);
    }
  };

  if (!isMobile) return null;

  return (
    <>
      <button
        type="button"
        className={`mobile-search-drawer-backdrop ${open ? 'is-open' : ''}`}
        onClick={onClose}
        aria-hidden={!open}
      />

      <aside className={`mobile-search-drawer ${open ? 'is-open' : ''}`} aria-hidden={!open}>
        <div className="mobile-search-drawer__header">
          <button type="button" className="mobile-search-drawer__back" onClick={onClose}>
            ←
          </button>
          <h2>검색</h2>
          <button type="button" className="mobile-search-drawer__close" onClick={onClose}>
            닫기
          </button>
        </div>

        <div className="mobile-search-drawer__body">
          <label className="mobile-search-field">
            <span>말머리</span>
            <select value={category} onChange={(event) => setCategory(event.target.value as Category)}>
              <option value="notice">동아리 공지</option>
              <option value="events">대회 및 심사 일정</option>
              <option value="contact">동아리 문의</option>
            </select>
          </label>

          <label className="mobile-search-field">
            <span>검색 기준</span>
            <select value={field} onChange={(event) => setField(event.target.value as SearchField)}>
              {FIELD_OPTIONS[category].map((item) => (
                <option key={`${category}-${item.value}`} value={item.value}>
                  {item.label}
                </option>
              ))}
            </select>
          </label>

          <div className="mobile-search-input-row">
            <input
              value={queryInput}
              onChange={(event) => setQueryInput(event.target.value)}
              placeholder="검색어를 입력하세요"
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  void runSearch();
                }
              }}
            />
            <button type="button" className="primary-btn" onClick={() => void runSearch()} disabled={loading}>
              {loading ? '검색 중...' : '검색'}
            </button>
          </div>

          <div className="mobile-search-result-list">
            {!appliedQuery ? (
              <div className="mobile-search-empty">
                말머리를 고르고 검색어를 입력한 뒤 검색 버튼을 눌러주세요.
              </div>
            ) : loading ? (
              <div className="mobile-search-empty">검색 중입니다.</div>
            ) : results.length === 0 ? (
              <div className="mobile-search-empty">검색 결과가 없습니다.</div>
            ) : (
              results.map((item) => (
                <button
                  key={`${item.category}-${item.id}`}
                  type="button"
                  className="mobile-search-result"
                  onClick={() => {
                    if (item.category === 'contact' && item.canOpen === false) {
                      pushToast('비밀글은 작성자 본인과 운영진만 확인할 수 있습니다.', 'error');
                      return;
                    }

                    onClose();
                    navigate(item.path);
                  }}
                >
                  <div className="mobile-search-result__category">{CATEGORY_LABEL[item.category]}</div>
                  <div className="mobile-search-result__title">
                    {renderHighlightedTitle(item.title, appliedQuery)}
                  </div>
                  <div className="mobile-search-result__meta">{item.subtext}</div>
                </button>
              ))
            )}
          </div>
        </div>
      </aside>
    </>
  );
}

export default MobileSearchDrawer;