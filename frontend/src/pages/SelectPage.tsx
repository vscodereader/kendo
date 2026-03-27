import { useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../lib/auth';
import { useToast } from '../lib/toast';

const BASE_MENU = [
  { label: '동아리 공지', path: '/notice' },
  { label: '동아리 일정', path: '/schedule' },
  { label: '대회 및 심사 일정', path: '/events' },
  { label: '동아리 문의', path: '/contact' },
  { label: '도장 위치', path: '/gym' }
];

const MANAGER_MENU = [
  { label: '예산 등록', path: '/moneypaid' },
  { label: '엠티 장소 물색', path: '/MT' },
  { label: '동아리원 관리', path: '/members' }
];

function SelectPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, logout } = useAuth();
  const { pushToast } = useToast();

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    if (params.get('denied')) {
      pushToast('권한이 없습니다.', 'error');
      params.delete('denied');
      navigate({ pathname: '/select', search: params.toString() }, { replace: true });
    }
  }, [location.search, navigate, pushToast]);

  const menu = user?.permissions.canManageRoster ? [...BASE_MENU, ...MANAGER_MENU] : BASE_MENU;
  const displayRole = user?.isRoot ? 'Admin' : user?.clubRole ?? '일반';

  return (
    <div className="page-shell">
      <div className="dashboard-layout">
        <header className="dashboard-header">
          <div>
            <div className="simple-card-eyebrow">권한별 메뉴 선택</div>
            <h1>무엇을 하시겠어요?</h1>
            <p>
              현재 권한은 <strong>{displayRole}</strong>
              {!user?.isRoot && user?.clubRoleDetail ? ` · ${user.clubRoleDetail}` : ''} 입니다.
            </p>
          </div>
          <div className="dashboard-userbox">
            <div>{user?.isRoot ? 'Admin' : user?.displayName ?? user?.googleName ?? '사용자'}</div>
            <div className="dashboard-userbox-sub">{user?.isRoot ? 'root account' : user?.email}</div>
            <button
              className="ghost-btn"
              onClick={async () => {
                await logout();
                window.location.replace('/main');
              }}
            >
              로그아웃
            </button>
          </div>
        </header>

        <div className="menu-grid">
          {menu.map((item) => (
            <button key={item.path} className="menu-tile" onClick={() => navigate(item.path)}>
              <span>{item.label}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

export default SelectPage;