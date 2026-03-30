import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { fetchContactPosts, type ContactListResponse } from '../lib/club';
import { useToast } from '../lib/toast';
import { useIsMobile } from '../hooks/useIsMobile';

function formatDate(value: string) {
  const date = new Date(value);
  return `${date.getFullYear()}.${String(date.getMonth() + 1).padStart(2, '0')}.${String(
    date.getDate()
  ).padStart(2, '0')}`;
}

function ContactListPage() {
  const navigate = useNavigate();
  const { pushToast } = useToast();
  const isMobile = useIsMobile();

  const [page, setPage] = useState(1);
  const [field, setField] = useState<'all' | 'title' | 'content'>('title');
  const [queryInput, setQueryInput] = useState('');
  const [appliedQuery, setAppliedQuery] = useState('');
  const [data, setData] = useState<ContactListResponse | null>(null);
  const [loading, setLoading] = useState(true);

  const load = async (
    pageNumber: number,
    query: string,
    searchField: 'all' | 'title' | 'content'
  ) => {
    setLoading(true);
    try {
      const result = await fetchContactPosts({
        page: pageNumber,
        query,
        field: searchField
      });
      setData(result);
    } catch (error) {
      pushToast(error instanceof Error ? error.message : '문의 목록을 불러오지 못했습니다.', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load(page, appliedQuery, field);
  }, [page, appliedQuery, field]);

  const handleSearch = () => {
    setPage(1);
    setAppliedQuery(queryInput.trim());
  };

  return (
    <div className="page-shell themed-page-shell">
      <div className="contact-page-width">
        <div className="contact-list-card">
          <div className="contact-search-card">
            <div className="contact-search-title">검색하기</div>
            <div className="contact-search-row">
              <select
                value={field}
                onChange={(e) => setField(e.target.value as 'all' | 'title' | 'content')}
              >
                <option value="title">제목</option>
                <option value="content">내용</option>
                <option value="all">제목+내용</option>
              </select>

              <input
                value={queryInput}
                onChange={(e) => setQueryInput(e.target.value)}
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

          <div className="contact-count-row">
            총 {loading ? 0 : data?.totalCount ?? 0}건 · {loading ? page : data?.currentPage ?? 1}/
            {loading ? 1 : data?.totalPages ?? 1} 페이지
          </div>

          {isMobile ? (
            <div className="mobile-board-list">
              {loading ? (
                <div className="mobile-board-empty">불러오는 중입니다.</div>
              ) : !data || data.items.length === 0 ? (
                <div className="mobile-board-empty">등록된 문의글이 없습니다.</div>
              ) : (
                data.items.map((item, index) => {
                  const no =
                    (data.totalCount ?? 0) - ((data.currentPage ?? 1) - 1) * 10 - index;

                  return (
                    <div
                      key={item.id}
                      className={`mobile-board-card ${item.isSecret ? 'is-secret' : ''}`}
                    >
                      <div className="mobile-board-card__top">
                        <div className="mobile-board-card__badge">
                          {item.isSecret ? '🔒 비밀글' : no}
                        </div>
                      </div>

                      <button
                        type="button"
                        className="mobile-board-card__title"
                        onClick={() => {
                          if (!item.canOpen) {
                            pushToast(
                              '비밀글은 작성자 본인과 운영진만 확인할 수 있습니다.',
                              'error'
                            );
                            return;
                          }
                          navigate(`/contact/${item.id}`);
                        }}
                      >
                        {item.title}
                      </button>

                      <div className="mobile-board-card__meta">
                        <span>{item.authorDisplayName}</span>
                        <span>{formatDate(item.createdAt)}</span>
                        <span>조회 {item.viewCount}</span>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          ) : (
            <table className="contact-table">
              <thead>
                <tr>
                  <th className="contact-no-col">번호</th>
                  <th>제목</th>
                  <th className="contact-author-col">작성자</th>
                  <th className="contact-date-col">작성일</th>
                  <th className="contact-view-col">조회수</th>
                </tr>
              </thead>

              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={5} className="contact-empty">
                      불러오는 중입니다.
                    </td>
                  </tr>
                ) : !data || data.items.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="contact-empty">
                      등록된 문의글이 없습니다.
                    </td>
                  </tr>
                ) : (
                  data.items.map((item, index) => {
                    const no =
                      (data.totalCount ?? 0) - ((data.currentPage ?? 1) - 1) * 10 - index;

                    return (
                      <tr key={item.id}>
                        <td>{no}</td>
                        <td>
                          <button
                            className="contact-title-link"
                            onClick={() => {
                              if (!item.canOpen) {
                                pushToast(
                                  '비밀글은 작성자 본인과 운영진만 확인할 수 있습니다.',
                                  'error'
                                );
                                return;
                              }
                              navigate(`/contact/${item.id}`);
                            }}
                          >
                            {item.isSecret ? '🔒 ' : ''}
                            {item.title}
                          </button>
                        </td>
                        <td>{item.authorDisplayName}</td>
                        <td>{formatDate(item.createdAt)}</td>
                        <td>{item.viewCount}</td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          )}

          <div className="contact-list-bottom-row">
            <div />
            <div className="contact-pagination">
              <button
                className="page-btn"
                disabled={!data || page === 1}
                onClick={() => setPage(1)}
              >
                |&lt;
              </button>
              <button
                className="page-btn"
                disabled={!data || page === 1}
                onClick={() => setPage((current) => Math.max(1, current - 1))}
              >
                &lt;
              </button>

              {Array.from({ length: data?.totalPages ?? 1 }, (_, index) => index + 1)
                .slice(Math.max(0, page - 5), Math.max(0, page - 5) + 10)
                .map((pageNumber) => (
                  <button
                    key={pageNumber}
                    className={`page-btn ${pageNumber === page ? 'page-btn--active' : ''}`}
                    onClick={() => setPage(pageNumber)}
                  >
                    {pageNumber}
                  </button>
                ))}

              <button
                className="page-btn"
                disabled={!data || page === (data?.totalPages ?? 1)}
                onClick={() =>
                  setPage((current) => Math.min(data?.totalPages ?? 1, current + 1))
                }
              >
                &gt;
              </button>
              <button
                className="page-btn"
                disabled={!data || page === (data?.totalPages ?? 1)}
                onClick={() => setPage(data?.totalPages ?? 1)}
              >
                &gt;|
              </button>
            </div>

            <div className="contact-bottom-action">
              <button className="primary-btn" onClick={() => navigate('/contact/write')}>
                글쓰기
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default ContactListPage;