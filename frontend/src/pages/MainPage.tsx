import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../lib/auth';
import { useToast } from '../lib/toast';
import hero1 from '../assets/main-hero-1.png';
import hero2 from '../assets/main-hero-2.png';
import hero3 from '../assets/main-hero-3.png';

const API_BASE = import.meta.env.VITE_API_BASE ?? 'http://localhost:4000/api';
const GOOGLE_LOGIN_URL = `${API_BASE.replace(/\/api$/, '')}/api/auth/google`;

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

const sections = [
  {
    image: hero1,
    eyebrow: '',
    title: '',
    description: ''
  },
  {
    image: hero2,
    eyebrow: ' ',
    title: 'Gachon Kendo Club',
    description: 'Since 1985'
  },
  {
    image: hero3,
    eyebrow: ' ',
    title: '劍道',
    description: '검으로 맺어진 인연, 대를 잇는 우정'
  }
];

const TRANSITION_MS = 900;
const WHEEL_THRESHOLD = 60;

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function MainPage() {
  const navigate = useNavigate();
  const { user, authenticated, loading, logout } = useAuth();
  const { pushToast } = useToast();

  const [sectionIndex, setSectionIndex] = useState(0);
  const [menuOpen, setMenuOpen] = useState(false);
  const [showLoginConfirm, setShowLoginConfirm] = useState(false);

  const sectionIndexRef = useRef(0);
  const wheelAccumRef = useRef(0);
  const isAnimatingRef = useRef(false);
  const queuedDirectionRef = useRef<-1 | 0 | 1>(0);
  const unlockTimerRef = useRef<number | null>(null);

  const canManageExtra = useMemo(() => {
    if (!user) return false;
    if (user.isRoot) return true;
    return Boolean(user.permissions?.canManageRoster);
  }, [user]);

  const menuItems = useMemo(() => {
    return authenticated && canManageExtra ? [...BASE_MENU, ...MANAGER_MENU] : BASE_MENU;
  }, [authenticated, canManageExtra]);

  const displayName = useMemo(() => {
    if (!user) return '';
    if (user.isRoot) return 'Admin';
    return user.displayName ?? user.googleName ?? '사용자';
  }, [user]);

  const totalSections = sections.length;

  useEffect(() => {
    sectionIndexRef.current = sectionIndex;
  }, [sectionIndex]);

  useEffect(() => {
    return () => {
      if (unlockTimerRef.current) {
        window.clearTimeout(unlockTimerRef.current);
      }
    };
  }, []);

  const flushQueuedDirection = () => {
    const queued = queuedDirectionRef.current;
    queuedDirectionRef.current = 0;

    if (queued === 0) return;

    const current = sectionIndexRef.current;
    const next = clamp(current + queued, 0, totalSections - 1);

    if (next !== current) {
      moveToSection(next);
    }
  };

  const finishAnimationLater = () => {
    if (unlockTimerRef.current) {
      window.clearTimeout(unlockTimerRef.current);
    }

    unlockTimerRef.current = window.setTimeout(() => {
      isAnimatingRef.current = false;
      flushQueuedDirection();
    }, TRANSITION_MS);
  };

  const moveToSection = (nextIndex: number) => {
    const safeIndex = clamp(nextIndex, 0, totalSections - 1);
    const current = sectionIndexRef.current;

    if (safeIndex === current) {
      return;
    }

    isAnimatingRef.current = true;
    wheelAccumRef.current = 0;
    sectionIndexRef.current = safeIndex;
    setSectionIndex(safeIndex);
    finishAnimationLater();
  };

  const queueOrMoveByDirection = (direction: -1 | 1) => {
    const current = sectionIndexRef.current;
    const next = clamp(current + direction, 0, totalSections - 1);

    if (next === current) {
      wheelAccumRef.current = 0;
      queuedDirectionRef.current = 0;
      return;
    }

    if (isAnimatingRef.current) {
      queuedDirectionRef.current = direction;
      return;
    }

    moveToSection(next);
  };

  const handleWheel = (event: React.WheelEvent<HTMLDivElement>) => {
    if (menuOpen || showLoginConfirm) return;

    event.preventDefault();

    const deltaY = event.deltaY;

    if (Math.abs(deltaY) < 2) return;

    if (isAnimatingRef.current) {
      queuedDirectionRef.current = deltaY > 0 ? 1 : -1;
      return;
    }

    wheelAccumRef.current += deltaY;

    if (Math.abs(wheelAccumRef.current) < WHEEL_THRESHOLD) {
      return;
    }

    const direction: -1 | 1 = wheelAccumRef.current > 0 ? 1 : -1;
    wheelAccumRef.current = 0;
    queueOrMoveByDirection(direction);
  };

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (menuOpen || showLoginConfirm) return;

      if (event.key === 'ArrowDown' || event.key === 'PageDown') {
        event.preventDefault();
        queueOrMoveByDirection(1);
      }

      if (event.key === 'ArrowUp' || event.key === 'PageUp') {
        event.preventDefault();
        queueOrMoveByDirection(-1);
      }
    };

    window.addEventListener('keydown', handleKeyDown, { passive: false });
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [menuOpen, showLoginConfirm]);

  const handleLoginClick = () => {
    window.location.href = GOOGLE_LOGIN_URL;
  };

  const handleLogoutClick = async () => {
    try {
      await logout();
      pushToast('로그아웃되었습니다.', 'success');
      setMenuOpen(false);
      navigate('/main', { replace: true });
    } catch (error) {
      pushToast(error instanceof Error ? error.message : '로그아웃에 실패했습니다.', 'error');
    }
  };

  const handleProtectedMenuClick = (path: string) => {
    setMenuOpen(false);

    if (!authenticated) {
      setShowLoginConfirm(true);
      return;
    }

    navigate(path);
  };

  return (
    <div className="main-fullpage" onWheel={handleWheel}>
      <div className="main-fixed-topbar">
        {authenticated ? <div className="main-user-chip">{displayName}</div> : null}

        <button
          type="button"
          className="main-topbar-btn"
          onClick={authenticated ? handleLogoutClick : handleLoginClick}
          disabled={loading}
        >
          {authenticated ? '로그아웃' : '로그인'}
        </button>

        <button
          type="button"
          className={`main-topbar-btn main-topbar-btn--icon ${menuOpen ? 'is-open' : ''}`}
          onClick={() => setMenuOpen((prev) => !prev)}
          aria-label="메뉴 열기"
        >
          <span />
          <span />
          <span />
        </button>
      </div>

      <div className="main-side-dots">
        {sections.map((_, index) => (
          <button
            key={index}
            type="button"
            className={`main-side-dot ${sectionIndex === index ? 'is-active' : ''}`}
            onClick={() => moveToSection(index)}
            aria-label={`${index + 1}번 화면으로 이동`}
          />
        ))}
      </div>

      <div
        className="main-sections-track"
        style={{ transform: `translate3d(0, -${sectionIndex * 100}vh, 0)` }}
      >
        {sections.map((section, index) => (
          <section
            key={index}
            className={`main-section ${index === 0 ? 'main-section--hero' : 'main-section--content'}`}
          >
            <div className="main-section-media">
              <img
                src={section.image}
                alt={`메인 섹션 ${index + 1}`}
                className={index === 0 ? 'main-hero-image' : 'main-section-bg-image'}
                draggable={false}
              />
            </div>

            {index !== 0 ? (
              <div className={`main-content-panel ${sectionIndex === index ? 'is-visible' : ''}`}>
                {section.eyebrow ? <div className="main-content-eyebrow">{section.eyebrow}</div> : null}
                {section.title ? <h2>{section.title}</h2> : null}
                {section.description ? <p>{section.description}</p> : null}
              </div>
            ) : null}
          </section>
        ))}
      </div>

      {menuOpen ? (
        <>
          <button
            type="button"
            className="main-landing-backdrop"
            onClick={() => setMenuOpen(false)}
            aria-label="메뉴 닫기"
          />
          <div className="main-menu-overlay">
            <div className="main-menu-panel">
              {menuItems.map((item) => (
                <button
                  key={item.path}
                  type="button"
                  className="main-menu-item"
                  onClick={() => handleProtectedMenuClick(item.path)}
                >
                  {item.label}
                </button>
              ))}
            </div>
          </div>
        </>
      ) : null}

      {showLoginConfirm ? (
        <div className="modal-backdrop">
          <div className="modal-card">
            <p>로그인을 먼저 진행해주세요.</p>
            <div className="modal-actions">
              <button
                type="button"
                className="danger-outline-btn"
                onClick={() => setShowLoginConfirm(false)}
              >
                취소
              </button>
              <button
                type="button"
                className="primary-btn"
                onClick={() => {
                  setShowLoginConfirm(false);
                  handleLoginClick();
                }}
              >
                확인
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

export default MainPage;