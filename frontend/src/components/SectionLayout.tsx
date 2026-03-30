import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useMemo, useState } from 'react';
import PageQuickNav from './PageQuickNav';
import MobileBackButton from './MobileBackButton';
import MobileSearchDrawer from './MobileSearchDrawer';
import { useIsMobile } from '../hooks/useIsMobile';

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
  const [mobileSearchOpen, setMobileSearchOpen] = useState(false);

  const showFloatingSearch = useMemo(() => {
    if (!isMobile) return false;
    return MOBILE_SEARCH_PATHS.has(location.pathname);
  }, [isMobile, location.pathname]);

  return (
    <div className="section-layout-shell">
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

      {showFloatingSearch ? (
        <button
          type="button"
          className="mobile-floating-search-btn"
          onClick={() => setMobileSearchOpen(true)}
          aria-label="통합 검색"
          title="통합 검색"
        >
          ✎
        </button>
      ) : null}

      <MobileSearchDrawer
        open={mobileSearchOpen}
        onClose={() => setMobileSearchOpen(false)}
      />
    </div>
  );
}

export default SectionLayout;