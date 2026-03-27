import { useEffect } from 'react';
import { useToast } from '../lib/toast';

export function useUnsavedChangesGuard(hasChanges: boolean, onBlocked?: () => void) {
  const { pushToast } = useToast();

  useEffect(() => {
    if (!hasChanges) return;

    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [hasChanges]);

  const ensureCanLeave = () => {
    if (!hasChanges) return true;
    pushToast('변경사항을 저장해 주세요', 'error');
    onBlocked?.();
    return false;
  };

  return { ensureCanLeave };
}
