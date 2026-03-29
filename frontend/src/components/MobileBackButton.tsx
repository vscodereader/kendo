import { useNavigate } from 'react-router-dom';
import { useIsMobile } from '../hooks/useIsMobile';

function isEditableActiveElement(element: Element | null) {
  if (!element) return false;

  if (element instanceof HTMLElement && element.isContentEditable) return true;
  if (element instanceof HTMLInputElement) return true;
  if (element instanceof HTMLTextAreaElement) return true;
  if (element instanceof HTMLSelectElement) return true;

  return false;
}

function MobileBackButton() {
  const navigate = useNavigate();
  const isMobile = useIsMobile();

  if (!isMobile) return null;

  return (
    <button
      type="button"
      className="mobile-back-btn"
      onClick={() => {
        const active = document.activeElement;

        if (isEditableActiveElement(active)) {
          (active as HTMLElement).blur();
          return;
        }

        if (window.history.length > 1) {
          navigate(-1);
          return;
        }

        navigate('/select', { replace: true });
      }}
      aria-label="뒤로가기"
    >
      ←
    </button>
  );
}

export default MobileBackButton;