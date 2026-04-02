import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useEffect, useMemo, useState } from 'react';
import PageQuickNav from './PageQuickNav';
import MobileBackButton from './MobileBackButton';
import MobileSearchDrawer from './MobileSearchDrawer';
import ApprovalQueuePanel from './ApprovalQueuePanel';
import { useIsMobile } from '../hooks/useIsMobile';
import { isApprovedMember, useAuth } from '../lib/auth';
import { fetchPendingApprovalApplicants } from '../lib/club';
import { useToast } from '../lib/toast';
import { isNativeApp } from '../lib/mobile';

const MOBILE_SEARCH_PATHS = new Set([
  '/notice',
  '/schedule',
  '/events',
  '/contact',
  '/gym',
  '/moneypaid',
  '/MT',
  '/members'
]);

function SectionLayout() {
  const navigate = useNavigate();
  const location = useLocation();
  const isMobile = useIsMobile();
  const { user, refreshMe } = useAuth();
  const { pushToast } = useToast();
  const [mobileSearchOpen, setMobileSearchOpen] = useState(false);
  const [approvalOpen, setApprovalOpen] = useState(false);
  const [pendingCount, setPendingCount] = useState(user?.approvalQueueCount ?? 0);

  const isWriteLikePage = location.pathname.endsWith('/write') || location.pathname.endsWith('/edit');
  const isNativeMobileApp = isMobile && isNativeApp();
  const canReviewApplicants = Boolean(user?.permissions.canReviewApplicants);

  const showFloatingSearch = useMemo(() => {
    if (!isMobile) return false;
    return MOBILE_SEARCH_PATHS.has(location.pathname);
  }, [isMobile, location.pathname]);

  const showApprovalFab = useMemo(() => {
    if (!isNativeMobileApp) return false;
    if (!canReviewApplicants) return false;
    if (!isApprovedMember(user)) return false;
    if (isWriteLikePage) return false;
    return pendingCount > 0;
  }, [isNativeMobileApp, canReviewApplicants, user, isWriteLikePage, pendingCount]);

  useEffect(() => {
    let cancelled = false;

    const loadPendingCount = async () => {
      if (!showApprovalFab && !canReviewApplicants) {
        if (!cancelled) setPendingCount(0);
        return;
      }

      try {
        const response = await fetchPendingApprovalApplicants();
        if (!cancelled) {
          setPendingCount(response.count);
        }
      } catch (error) {
        if (!cancelled) {
          pushToast(error instanceof Error ? error.message : '승인 대기 목록을 불러오지 못했습니다.', 'error');
        }
      }
    };

    void loadPendingCount();

    return () => {
      cancelled = true;
    };
  }, [location.pathname, canReviewApplicants, showApprovalFab, pushToast]);

  return (
    <div className="section-layout-shell">
      <div className="section-layout-scroll">
        <div className="page-top-actions">
          <MobileBackButton />

          <button
            type="button"
            className="ghost-btn page-top-action-btn"
            onClick={() => navigate('/main')}
          >
            메인화면
          </button>

          <button
            type="button"
            className="ghost-btn page-top-action-btn"
            onClick={() => navigate('/select')}
          >
            메뉴
          </button>
        </div>

        <PageQuickNav />

        <div className="section-layout-content">
          <Outlet />
        </div>
      </div>

      {showApprovalFab ? (
        <button
          type="button"
          className="mobile-approval-queue-btn"
          onClick={() => setApprovalOpen(true)}
          aria-label="가입 승인 대기 목록"
          title="가입 승인 대기 목록"
        >
          !
          {pendingCount > 0 ? <span className="mobile-approval-queue-btn__badge">{pendingCount}</span> : null}
        </button>
      ) : null}

      {showFloatingSearch ? (
        <button
          type="button"
          className="mobile-floating-search-btn"
          onClick={() => setMobileSearchOpen(true)}
          aria-label="통합 검색"
          title="통합 검색"
        >
          🔍
        </button>
      ) : null}

      <MobileSearchDrawer open={mobileSearchOpen} onClose={() => setMobileSearchOpen(false)} />

      {isNativeMobileApp && canReviewApplicants ? (
        <ApprovalQueuePanel
          open={approvalOpen}
          onClose={() => setApprovalOpen(false)}
          mode="sheet"
          title="승인 대기 중"
          onResolved={(nextCount) => {
            setPendingCount(nextCount);
            void refreshMe();
          }}
        />
      ) : null}
    </div>
  );
}

export default SectionLayout;