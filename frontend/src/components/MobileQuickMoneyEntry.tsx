import { useEffect, useRef, useState } from 'react';
import { useToast } from '../lib/toast';

type Props = {
  open: boolean;
  onClose: () => void;
  onSave: (payload: {
    item: string;
    note: string;
    income: number;
    expense: number;
  }) => Promise<void> | void;
};

function parseAmount(value: string) {
  const normalized = value.replace(/,/g, '').trim();
  if (!normalized) return 0;
  const num = Number(normalized);
  return Number.isFinite(num) ? num : 0;
}

function MobileQuickMoneyEntry({ open, onClose, onSave }: Props) {
  const { pushToast } = useToast();
  const itemRef = useRef<HTMLInputElement | null>(null);

  const [item, setItem] = useState('');
  const [note, setNote] = useState('');
  const [income, setIncome] = useState('');
  const [expense, setExpense] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;

    window.setTimeout(() => {
      itemRef.current?.focus();
    }, 30);
  }, [open]);

  const reset = () => {
    setItem('');
    setNote('');
    setIncome('');
    setExpense('');
  };

  const handleSave = async () => {
    if (!item.trim()) {
      pushToast('품목을 입력하세요.', 'error');
      itemRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      itemRef.current?.focus();
      return;
    }

    setSaving(true);
    try {
      await onSave({
        item: item.trim(),
        note: note.trim(),
        income: parseAmount(income),
        expense: parseAmount(expense)
      });

      pushToast('저장되었습니다.', 'success');
      reset();
      onClose();
    } catch (error) {
      pushToast(error instanceof Error ? error.message : '저장에 실패했습니다.', 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <button
        type="button"
        className={`mobile-side-sheet-backdrop ${open ? 'is-open' : ''}`}
        onClick={onClose}
        aria-hidden={!open}
      />

      <aside className={`mobile-side-sheet ${open ? 'is-open' : ''}`} aria-hidden={!open}>
        <div className="mobile-side-sheet__header">
          <h2>빠른 작성</h2>
          <button type="button" className="ghost-btn" onClick={onClose} disabled={saving}>
            닫기
          </button>
        </div>

        <div className="mobile-side-sheet__body">
          <label className="form-field">
            <span>품목</span>
            <input
              ref={itemRef}
              value={item}
              onChange={(event) => setItem(event.target.value)}
              placeholder="품목을 입력하세요"
            />
          </label>

          <label className="form-field">
            <span>비고</span>
            <input
              value={note}
              onChange={(event) => setNote(event.target.value)}
              placeholder="비고는 비워도 됩니다"
            />
          </label>

          <label className="form-field">
            <span>수입금액</span>
            <input
              value={income}
              onChange={(event) => setIncome(event.target.value)}
              placeholder="비워두면 0원"
              inputMode="numeric"
            />
          </label>

          <label className="form-field">
            <span>지출금액</span>
            <input
              value={expense}
              onChange={(event) => setExpense(event.target.value)}
              placeholder="비워두면 0원"
              inputMode="numeric"
            />
          </label>
        </div>

        <div className="mobile-side-sheet__footer">
          <button type="button" className="primary-btn primary-btn--large" onClick={() => void handleSave()} disabled={saving}>
            {saving ? '저장 중...' : '저장'}
          </button>
        </div>
      </aside>
    </>
  );
}

export default MobileQuickMoneyEntry;