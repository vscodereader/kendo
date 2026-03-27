import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  fetchNoticePosts,
  pinNoticePosts,
  unpinNoticePosts,
  type NoticeSummary
} from '../lib/club';
import { useAuth } from '../lib/auth';
import { useToast } from '../lib/toast';

function formatDate(value: string) {
  const date = new Date(value);
  return `${date.getFullYear()}.${String(date.getMonth() + 1).padStart(2, '0')}.${String(date.getDate()).padStart(2, '0')}`;
}

function NoticeListPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { pushToast } = useToast();

  const [items, setItems] = useState<NoticeSummary[]>([]);
  const [pinnedItems, setPinnedItems] = useState<NoticeSummary[]>([]);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalCount, setTotalCount] = useState(0);

  const [searchField, setSearchField] = useState<'all' | 'title' | 'body' | 'author'>('title');
  const [searchInput, setSearchInput] = useState('');
  const [query, setQuery] = useState('');

  const [loading, setLoading] = useState(true);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [pinning, setPinning] = useState(false);

  const canWrite = useMemo(() => {
    if (!user) return false;
    if (user.isRoot) return true;
    return ['임원', '부회장', '회장'].includes(user.clubRole ?? '일반');
  }, [user]);

  const load = async (page: number, nextQuery: string, nextField: 'all' | 'title' | 'body' | 'author') => {
    setLoading(true);
    try {
      const result = await fetchNoticePosts({
        page,
        query: nextQuery,
        field: nextField
      });

      setPinnedItems(result.pinnedItems);
      setItems(result.items);
      setCurrentPage(result.currentPage);
      setTotalPages(result.totalPages);
      setTotalCount(result.totalCount);
      setSelectedIds([]);
    } catch (error) {
      pushToast(error instanceof Error ? error.message : '공지 목록을 불러오지 못했습니다.', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load(currentPage, query, searchField);
  }, [currentPage, query, searchField]);

  const handleSearch = () => {
    setCurrentPage(1);
    setQuery(searchInput.trim());
  };

  const toggleSelected = (id: string) => {
    setSelectedIds((current) =>
      current.includes(id) ? current.filter((item) => item !== id) : [...current, id]
    );
  };

  const handlePin = async () => {
    if (selectedIds.length === 0) {
      pushToast('고정할 공지를 선택해주세요.', 'error');
      return;
    }

    setPinning(true);
    try {
      await pinNoticePosts(selectedIds);
      pushToast('고정되었습니다.', 'success');
      await load(currentPage, query, searchField);
    } catch (error) {
      pushToast(error instanceof Error ? error.message : '고정 처리에 실패했습니다.', 'error');
    } finally {
      setPinning(false);
    }
  };

  const handleUnpin = async () => {
    if (selectedIds.length === 0) {
      pushToast('고정 해제할 공지를 선택해주세요.', 'error');
      return;
    }

    setPinning(true);
    try {
      await unpinNoticePosts(selectedIds);
      pushToast('고정이 해제되었습니다.', 'success');
      await load(currentPage, query, searchField);
    } catch (error) {
      pushToast(error instanceof Error ? error.message : '고정 해제에 실패했습니다.', 'error');
    } finally {
      setPinning(false);
    }
  };

  const visibleRows = currentPage === 1 ? [...pinnedItems, ...items] : items;

  return (
    <div className="page-shell themed-page-shell">
      <div className="notice-page-card">
        <div className="notice-search-card">
          <div className="notice-search-title">검색하기</div>
          <div className="notice-search-controls">
            <select value={searchField} onChange={(e) => setSearchField(e.target.value as 'all' | 'title' | 'body' | 'author')}>
              <option value="title">제목</option>
              <option value="body">본문</option>
              <option value="author">작성자</option>
              <option value="all">전체</option>
            </select>
            <input
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleSearch();
              }}
              placeholder="검색어를 입력해 주세요."
            />
            <button className="ghost-btn" onClick={handleSearch}>
              검색
            </button>
          </div>
        </div>

        <div className="notice-list-summary">
          <span>{totalCount}건</span>
          <span>현재페이지: {currentPage}/{totalPages}</span>
        </div>

        <div className="notice-table-wrap">
          <table className="notice-table">
            <thead>
              <tr>
                {canWrite ? <th className="notice-check-col"></th> : null}
                <th className="notice-no-col">NO</th>
                <th>제목</th>
                <th className="notice-author-col">작성자</th>
                <th className="notice-date-col">작성일</th>
                <th className="notice-view-col">조회수</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={canWrite ? 6 : 5} className="notice-empty-row">
                    불러오는 중입니다.
                  </td>
                </tr>
              ) : visibleRows.length === 0 ? (
                <tr>
                  <td colSpan={canWrite ? 6 : 5} className="notice-empty-row">
                    등록된 공지가 없습니다.
                  </td>
                </tr>
              ) : (
                visibleRows.map((item, index) => {
                  const number =
                    item.isPinned && currentPage === 1
                      ? '고정'
                      : totalCount - (currentPage - 1) * 10 - (index - pinnedItems.length);

                  return (
                    <tr key={item.id} className={item.isPinned ? 'notice-row notice-row--pinned' : 'notice-row'}>
                      {canWrite ? (
                        <td className="notice-check-col">
                          <input
                            type="checkbox"
                            checked={selectedIds.includes(item.id)}
                            onChange={() => toggleSelected(item.id)}
                          />
                        </td>
                      ) : null}
                      <td className="notice-no-col">{number}</td>
                      <td className="notice-title-cell">
                        <button className="notice-title-link" onClick={() => navigate(`/notice/${item.id}`)}>
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

        {canWrite ? (
          <div className="notice-bulk-actions">
            <button className="ghost-btn" onClick={handlePin} disabled={pinning}>
              고정하기
            </button>
            <button className="ghost-btn" onClick={handleUnpin} disabled={pinning}>
              고정해제
            </button>
            <button className="primary-btn" onClick={() => navigate('/notice/write')}>
              글쓰기
            </button>
          </div>
        ) : null}

        <div className="notice-pagination">
          <button className="notice-page-btn" disabled={currentPage === 1} onClick={() => setCurrentPage(1)}>
            {"<<"}
          </button>
          <button className="notice-page-btn" disabled={currentPage === 1} onClick={() => setCurrentPage((prev) => Math.max(1, prev - 1))}>
            {"<"}
          </button>

          {Array.from({ length: totalPages }, (_, index) => index + 1)
            .slice(Math.max(0, currentPage - 5), Math.max(0, currentPage - 5) + 10)
            .map((page) => (
              <button
                key={page}
                className={`notice-page-btn ${page === currentPage ? 'notice-page-btn--active' : ''}`}
                onClick={() => setCurrentPage(page)}
              >
                {page}
              </button>
            ))}

          <button className="notice-page-btn" disabled={currentPage === totalPages} onClick={() => setCurrentPage((prev) => Math.min(totalPages, prev + 1))}>
            {">"}
          </button>
          <button className="notice-page-btn" disabled={currentPage === totalPages} onClick={() => setCurrentPage(totalPages)}>
            {">>"}
          </button>
        </div>
      </div>
    </div>
  );
}

export default NoticeListPage;