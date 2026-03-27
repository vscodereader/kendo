import { Outlet, useNavigate } from 'react-router-dom';
import PageQuickNav from './PageQuickNav';

function SectionLayout() {
  const navigate = useNavigate();

  return (
    <div className="section-layout-shell">
      <div className="page-top-actions">
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
      <Outlet />
    </div>
  );
}

export default SectionLayout;