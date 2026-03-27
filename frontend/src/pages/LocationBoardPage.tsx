import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../lib/auth';
import { fetchBoardPage, saveBoardPage, type BoardPageContent, type BoardPageSlug } from '../lib/club';
import { useToast } from '../lib/toast';
import BoardContentRenderer from '../components/BoardContentRenderer';
import RichBoardEditor from '../components/RichBoardEditor';

type Props = {
  slug: BoardPageSlug;
  requireManagerView?: boolean;
};

const PAGE_TITLE: Record<BoardPageSlug, string> = {
  gym: '도장 위치',
  mt: '엠티 장소 물색'
};

const GYM_MAP_TOKEN = `[[NAVER_MAP::${encodeURIComponent('문정검도관')}::${encodeURIComponent(
  '서울 송파구 문정로 11 지하 1층 문정검도관'
)}::${encodeURIComponent(
  'https://map.naver.com/p/entry/place/31510503?c=15.00,0,0,0,dh&placePath=/home?from=map&fromPanelNum=1&additionalHeight=76&timestamp=202603241644&locale=ko&svcName=map_pcv5'
)}]]`;

const DEFAULT_BODY: Record<BoardPageSlug, string> = {
  gym: `
    <p>우리 가천대학교 검도부는 정기 운동과 친목 활동을 함께 운영하는 동아리입니다.</p>
    <p>검도관 위치는 <strong>문정검도관</strong>입니다.</p>
    <p>아래 지도를 드래그해서 위치를 확인하고, 지도를 더블클릭하면 네이버 지도가 새 창에서 열립니다.</p>
    <p>${GYM_MAP_TOKEN}</p>
  `.trim(),
  mt: `
    <p>엠티 후보 장소를 이곳에 이야기하세요.</p>
    <p>장소 설명, 장단점, 예상 비용, 예약 링크 등을 자유롭게 작성할 수 있습니다.</p>
    <p>지도를 추가하고 싶으시면 추가하고 싶은 위치에 마우스를 클릭, 커서가 깜빡이고 있어야합니다!</p>
    <p>지도 버튼을 누르시고 이름 주소 링크를 추가하고 삽입 버튼을 누르면 커서가 깜빡이고 있는 위치에 추가됩니다!</p>
    <p>다 작성 후 반드시 저장 눌러주세요~</p>
  `.trim()
};

function normalizeBoardHtml(slug: BoardPageSlug, html: string) {
  const trimmed = (html || '').trim();

  if (!trimmed) {
    return DEFAULT_BODY[slug];
  }

  if (slug === 'gym' && !trimmed.includes('[[NAVER_MAP::')) {
    return `${trimmed}<p>${GYM_MAP_TOKEN}</p>`;
  }

  return trimmed;
}

function LocationBoardPage({ slug, requireManagerView = false }: Props) {
  const navigate = useNavigate();
  const { user, loading, authenticated } = useAuth();
  const { pushToast } = useToast();

  const [page, setPage] = useState<BoardPageContent | null>(null);
  const [pageLoading, setPageLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [bodyHtml, setBodyHtml] = useState('');

  const canManage = useMemo(() => {
    if (!user) return false;
    if (user.isRoot) return true;
    return ['임원', '부회장', '회장'].includes(user.clubRole ?? '일반');
  }, [user]);

  useEffect(() => {
    if (loading) return;

    if (!authenticated) {
      navigate('/login', { replace: true });
      return;
    }

    if (requireManagerView && !canManage) {
      pushToast('권한이 없습니다.', 'error');
      navigate('/select', { replace: true });
      return;
    }

    const run = async () => {
      setPageLoading(true);
      try {
        const result = await fetchBoardPage(slug);
        const normalizedBody = normalizeBoardHtml(slug, result.bodyHtml);

        setPage({
          ...result,
          title: PAGE_TITLE[slug],
          bodyHtml: normalizedBody
        });
        setBodyHtml(normalizedBody);
      } catch (error) {
        pushToast(error instanceof Error ? error.message : '페이지를 불러오지 못했습니다.', 'error');
        navigate('/select', { replace: true });
      } finally {
        setPageLoading(false);
      }
    };

    void run();
  }, [slug, loading, authenticated, requireManagerView, canManage, navigate, pushToast]);

  const beginEdit = () => {
    if (!page) return;
    setBodyHtml(normalizeBoardHtml(slug, page.bodyHtml));
    setEditing(true);
  };

  const cancelEdit = () => {
    if (!page) {
      setEditing(false);
      return;
    }
    setBodyHtml(page.bodyHtml);
    setEditing(false);
  };

  const handleSave = async () => {
    const normalized = normalizeBoardHtml(slug, bodyHtml);

    if (!normalized.trim()) {
      pushToast('본문 내용을 입력해주세요.', 'error');
      return;
    }

    setSaving(true);
    try {
      const result = await saveBoardPage(slug, {
        title: PAGE_TITLE[slug],
        bodyHtml: normalized,
        placeName: '',
        address: '',
        mapLink: ''
      });

      const normalizedBody = normalizeBoardHtml(slug, result.bodyHtml);

      setPage({
        ...result,
        title: PAGE_TITLE[slug],
        bodyHtml: normalizedBody
      });
      setBodyHtml(normalizedBody);
      setEditing(false);
      pushToast('저장되었습니다.', 'success');
    } catch (error) {
      pushToast(error instanceof Error ? error.message : '저장에 실패했습니다.', 'error');
    } finally {
      setSaving(false);
    }
  };

  if (pageLoading) {
    return (
      <div className="page-shell page-shell--center">
        <div className="simple-card simple-card--loading">
          <h1>페이지를 불러오는 중입니다.</h1>
        </div>
      </div>
    );
  }

  if (!page) return null;

  return (
    <div className="page-shell themed-page-shell">
      <div className="board-page-wrap">
        {!editing ? (
          <article className="board-article board-article--split">
            <header className="board-article-header">
              <h1>{PAGE_TITLE[slug]}</h1>
            </header>

            <div className="board-article-body">
              <BoardContentRenderer html={page.bodyHtml} />
            </div>

            {page.canEdit ? (
              <div className="board-bottom-actions">
                <button className="ghost-btn" onClick={beginEdit}>
                  수정 ✏️
                </button>
              </div>
            ) : null}
          </article>
        ) : (
          <div className="board-editor-page">
            <div className="board-editor-header">
              <h1>{PAGE_TITLE[slug]} 수정</h1>
            </div>

            <div className="board-editor-body">
              <RichBoardEditor value={bodyHtml} onChange={setBodyHtml} />
            </div>

            <div className="board-bottom-actions board-bottom-actions--edit">
              <button className="primary-btn" onClick={handleSave} disabled={saving}>
                {saving ? '저장 중...' : '저장'}
              </button>
              <button className="ghost-btn" onClick={cancelEdit} disabled={saving}>
                취소
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default LocationBoardPage;