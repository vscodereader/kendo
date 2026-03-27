import { useMemo } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../lib/auth';

type QuickNavItem = {
  label: string;
  path: string;
};

const BASE_ITEMS: QuickNavItem[] = [
  { label: '동아리 공지', path: '/notice' },
  { label: '동아리 일정', path: '/schedule' },
  { label: '대회 및 심사 일정', path: '/events' },
  { label: '동아리 문의', path: '/contact' },
  { label: '도장 위치', path: '/gym' }
];

const MANAGER_ITEMS: QuickNavItem[] = [
  { label: '예산 등록', path: '/moneypaid' },
  { label: '엠티 장소 물색', path: '/MT' },
  { label: '동아리원 관리', path: '/members' }
];

function isActivePath(pathname: string, targetPath: string) {
  if (pathname === targetPath) return true;
  if (pathname.startsWith(`${targetPath}/`)) return true;
  return false;
}

function PageQuickNav() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useAuth();

  const canManage = useMemo(() => {
    if (!user) return false;
    if (user.isRoot) return true;
    return Boolean(user.permissions?.canManageRoster || user.permissions?.canManageMoney);
  }, [user]);

  const items = useMemo(
    () => (canManage ? [...BASE_ITEMS, ...MANAGER_ITEMS] : BASE_ITEMS),
    [canManage]
  );

  return (
    <div className="page-quicknav-wrap">
      <div className="page-quicknav">
        {items.map((item) => {
          const active = isActivePath(location.pathname, item.path);

          return (
            <button
              key={item.path}
              type="button"
              className={`page-quicknav-item ${active ? 'is-active' : ''}`}
              onClick={() => navigate(item.path)}
            >
              <span>{item.label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

export default PageQuickNav;