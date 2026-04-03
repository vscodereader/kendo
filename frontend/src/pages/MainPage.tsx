import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { App as CapacitorApp } from '@capacitor/app';
import { Capacitor } from '@capacitor/core';

import { isApprovedMember, useAuth } from '../lib/auth';
import { useToast } from '../lib/toast';
import { useIsMobile } from '../hooks/useIsMobile';
import ApprovalQueuePanel from '../components/ApprovalQueuePanel';
import MainExitDialog from '../components/MainExitDialog';

import hero1 from '../assets/main-hero-1.png';
import hero2 from '../assets/main-hero-2.png';
import hero3 from '../assets/main-hero-3.png';

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
  const { user, authenticated, loading, logout, refreshMe } = useAuth();
  const { pushToast } = useToast();
  const isMobile = useIsMobile();

  useEffect(() => {
    if (loading) return;
    if (authenticated && user && !user.profileCompleted) {
      navigate('/profile-setup', { replace: true });
    }
  }, [loading, authenticated, user, navigate]);

  useEffect(() => {
    const refreshMain = () => {
      void refreshMe();
    };

    window.addEventListener('kendo:refresh-main', refreshMain as EventListener);
    return () => {
      window.removeEventListener('kendo:refresh-main', refreshMain as EventListener);
    };
  }, [refreshMe]);

  const [sectionIndex, setSectionIndex] = useState(0);
  const [menuOpen, setMenuOpen] = useState(false);
  const [showLoginConfirm, setShowLoginConfirm] = useState(false);
  const [showRejectedModal, setShowRejectedModal] = useState(false);
  const [approvalModalOpen, setApprovalModalOpen] = useState(false);
  const [showExitConfirm, setShowExitConfirm] = useState(false);
  const [approvalQueueCount, setApprovalQueueCount] = useState(user?.approvalQueueCount ?? 0);

  const sectionIndexRef = useRef(0);
  const wheelAccumRef = useRef(0);
  const isAnimatingRef = useRef(false);
  const queuedDirectionRef = useRef<-1 | 0 | 1>(0);
  const unlockTimerRef = useRef<number | null>(null);
  const touchStartYRef = useRef<number | null>(null);
  const touchDeltaYRef = useRef(0);
  const TOUCH_THRESHOLD = 48;

  const canManageExtra = useMemo(() => {
    if (!user) return false;
    if (user.isRoot) return true;
    return Boolean(user.permissions?.canManageRoster);
  }, [user]);

  const approvalGranted = isApprovedMember(user);
  const approvalPending = Boolean(authenticated && user?.profileCompleted && user.approvalStatus === 'PENDING');
  const approvalRejected = Boolean(authenticated && user?.approvalStatus === 'REJECTED');
  const canReviewApplicants = Boolean(authenticated && user?.permissions.canReviewApplicants);

  const menuItems = useMemo(() => {
    return authenticated && canManageExtra ? [...BASE_MENU, ...MANAGER_MENU] : BASE_MENU;
  }, [authenticated, canManageExtra]);

  const displayName = useMemo(() => {
    if (!user) return '';
    if (user.isRoot) return 'Admin';
    return user.displayName ?? user.googleName ?? '사용자';
  }, [user]);

  useEffect(() => {
    setApprovalQueueCount(user?.approvalQueueCount ?? 0);
  }, [user?.approvalQueueCount]);

  useEffect(() => {
    if (!authenticated || !user) return;
    if (approvalRejected) {
      setShowRejectedModal(true);
      return;
    }

    if (!isMobile && canReviewApplicants && (user.approvalQueueCount ?? 0) > 0) {
      setApprovalModalOpen(true);
    }
  }, [authenticated, user, approvalRejected, canReviewApplicants, isMobile]);

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
    const next = clamp(current + queued, 0, sections.length - 1);

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
    const safeIndex = clamp(nextIndex, 0, sections.length - 1);
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
    const next = clamp(current + direction, 0, sections.length - 1);

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
    if (menuOpen || showLoginConfirm || approvalModalOpen || showRejectedModal) return;

    event.preventDefault();

    const deltaY = event.deltaY;
    if (Math.abs(deltaY) < 2) return;

    if (isAnimatingRef.current) {
      queuedDirectionRef.current = deltaY > 0 ? 1 : -1;
      return;
    }

    wheelAccumRef.current += deltaY;
    if (Math.abs(wheelAccumRef.current) < WHEEL_THRESHOLD) return;

    const direction: -1 | 1 = wheelAccumRef.current > 0 ? 1 : -1;
    wheelAccumRef.current = 0;
    queueOrMoveByDirection(direction);
  };

  const handleTouchStart = (event: React.TouchEvent<HTMLDivElement>) => {
    if (menuOpen || showLoginConfirm || approvalModalOpen || showRejectedModal) return;
    touchStartYRef.current = event.touches[0]?.clientY ?? null;
    touchDeltaYRef.current = 0;
  };

  const handleTouchMove = (event: React.TouchEvent<HTMLDivElement>) => {
    if (menuOpen || showLoginConfirm || approvalModalOpen || showRejectedModal) return;
    if (touchStartYRef.current === null) return;
    touchDeltaYRef.current = (event.touches[0]?.clientY ?? 0) - touchStartYRef.current;
  };

  const handleTouchEnd = () => {
    if (menuOpen || showLoginConfirm || approvalModalOpen || showRejectedModal) return;
    if (touchStartYRef.current === null) return;

    const delta = touchDeltaYRef.current;
    touchStartYRef.current = null;
    touchDeltaYRef.current = 0;

    if (Math.abs(delta) < TOUCH_THRESHOLD) return;
    queueOrMoveByDirection(delta < 0 ? 1 : -1);
  };

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (menuOpen || showLoginConfirm || approvalModalOpen || showRejectedModal) return;

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
  }, [menuOpen, showLoginConfirm, approvalModalOpen, showRejectedModal]);

  useEffect(() => {
    if (Capacitor.getPlatform() !== 'android') return;

    let listener: { remove: () => Promise<void> } | null = null;

    const register = async () => {
      listener = await CapacitorApp.addListener('backButton', () => {
        if (menuOpen) {
          setMenuOpen(false);
          return;
        }

        if (showLoginConfirm) {
          setShowLoginConfirm(false);
          return;
        }

        if (showRejectedModal) {
          setShowRejectedModal(false);
          return;
        }

        if (approvalModalOpen) {
          setApprovalModalOpen(false);
          return;
        }

        if (showExitConfirm) {
          setShowExitConfirm(false);
          return;
        }

        setShowExitConfirm(true);
      });
    };

    void register();

    return () => {
      if (listener) {
        void listener.remove();
      }
    };
  }, [menuOpen, showLoginConfirm, showRejectedModal, approvalModalOpen, showExitConfirm]);

  const handleLoginClick = () => {
    navigate('/login');
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

  const handleConfirmExit = async () => {
    await CapacitorApp.exitApp();
  };

  const handleProtectedMenuClick = (path: string) => {
    setMenuOpen(false);

    if (!authenticated) {
      setShowLoginConfirm(true);
      return;
    }

    if (approvalRejected) {
      setShowRejectedModal(true);
      return;
    }

    if (!user?.profileCompleted) {
      navigate('/profile-setup');
      return;
    }

    if (!approvalGranted) {
      pushToast('승인된 동아리원만 확인할 수 있습니다!', 'error');
      return;
    }

    navigate(path);
  };

  const pendingBannerText = approvalPending
    ? '승인 대기 중입니다. 승인 전에는 동아리 내부 내용을 확인할 수 없습니다.'
    : '';

  return (
    <div
      className="main-fullpage"
      onWheel={handleWheel}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
    >
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

      {approvalPending ? <div className="main-pending-banner">{pendingBannerText}</div> : null}

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

      {showRejectedModal ? (
        <div className="modal-backdrop">
          <div className="modal-card">
            <h3>거절되었습니다!</h3>
            <p>프로필을 다시 입력한 뒤 승인을 기다려주세요.</p>
            <div className="modal-actions">
              <button
                type="button"
                className="ghost-btn"
                onClick={async () => {
                  setShowRejectedModal(false);
                  await logout();
                  navigate('/login', { replace: true });
                }}
              >
                다시 로그인
              </button>
              <button
                type="button"
                className="primary-btn"
                onClick={() => {
                  setShowRejectedModal(false);
                  navigate('/profile-setup', { replace: true });
                }}
              >
                프로필 다시 입력
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {!isMobile && canReviewApplicants ? (
        <ApprovalQueuePanel
          open={approvalModalOpen}
          onClose={() => setApprovalModalOpen(false)}
          mode="modal"
          onResolved={(nextCount) => {
            setApprovalQueueCount(nextCount);
            void refreshMe();
          }}
        />
      ) : null}

      <MainExitDialog
        open={showExitConfirm}
        onCancel={() => setShowExitConfirm(false)}
        onConfirm={() => {
          void handleConfirmExit();
        }}
      />

      <div className="main-footer-links">
        <button
          type="button"
          className="main-footer-link-btn"
          onClick={() => navigate('/privacy')}
        >
          개인정보처리방침 · 계정 삭제 안내
        </button>
      </div>


    </div>
  );
}

export default MainPage;