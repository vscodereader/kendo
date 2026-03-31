import { useEffect, useMemo, useState } from 'react';
import {
  decidePendingApprovalApplicants,
  fetchPendingApprovalApplicants,
  type PendingApprovalApplicant
} from '../lib/club';
import { useToast } from '../lib/toast';
import { useIsMobile } from '../hooks/useIsMobile';

type ApprovalQueuePanelProps = {
  open: boolean;
  onClose: () => void;
  mode: 'modal' | 'sheet';
  title?: string;
  onResolved?: (nextCount: number) => void;
};

function formatDateTime(value: string | null) {
  if (!value) return '-';
  return new Intl.DateTimeFormat('ko-KR', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  }).format(new Date(value));
}

function previewCell(label: string, value: string, mobile: boolean) {
  if (!mobile) return value || '-';
  if (!value) return '-';

  const limits: Record<string, number> = {
    학번: 9,
    이름: 4,
    학과: 4,
    학년: 2,
    나이: 2,
    교육반: 4,
    이메일: 8,
    신청시각: 10
  };

  const limit = limits[label] ?? 4;
  return value.length > limit ? `${value.slice(0, limit)}…` : value;
}

export default function ApprovalQueuePanel({
  open,
  onClose,
  mode,
  title = '지금 가입을 신청한 유저들이에요',
  onResolved
}: ApprovalQueuePanelProps) {
  const { pushToast } = useToast();
  const isMobile = useIsMobile();
  const [loading, setLoading] = useState(false);
  const [acting, setActing] = useState(false);
  const [items, setItems] = useState<PendingApprovalApplicant[]>([]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [expandedCell, setExpandedCell] = useState<{ label: string; value: string } | null>(null);

  const selectedCount = selectedIds.length;

  const load = async () => {
    setLoading(true);
    try {
      const response = await fetchPendingApprovalApplicants();
      setItems(response.items);
      setSelectedIds((current) => current.filter((id) => response.items.some((item) => item.id === id)));
      if (response.count === 0) {
        onResolved?.(0);
      }
    } catch (error) {
      pushToast(error instanceof Error ? error.message : '승인 대기 목록을 불러오지 못했습니다.', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!open) return;
    void load();
  }, [open]);

  const handleToggle = (userId: string) => {
    setSelectedIds((current) =>
      current.includes(userId) ? current.filter((item) => item !== userId) : [...current, userId]
    );
  };

  const handleDecision = async (action: 'approve' | 'reject') => {
    if (selectedIds.length === 0) {
      pushToast(action === 'approve' ? '승인할 유저를 선택해주세요.' : '거절할 유저를 선택해주세요.', 'error');
      return;
    }

    setActing(true);
    try {
      const response = await decidePendingApprovalApplicants({
        userIds: selectedIds,
        action
      });

      setItems(response.items);
      setSelectedIds([]);
      setExpandedCell(null);
      onResolved?.(response.count);
      pushToast(action === 'approve' ? '선택한 유저를 승인했습니다.' : '선택한 유저를 거절했습니다.', 'success');

      if (response.count === 0) {
        onClose();
      }
    } catch (error) {
      pushToast(error instanceof Error ? error.message : '승인 처리에 실패했습니다.', 'error');
    } finally {
      setActing(false);
    }
  };

  const body = (
    <>
      <div className="approval-queue-panel__summary">
        <span>대기 중 {items.length}명</span>
        <span>선택 {selectedCount}명</span>
      </div>

      {loading ? (
        <div className="approval-queue-empty">대기 목록을 불러오는 중입니다.</div>
      ) : items.length === 0 ? (
        <div className="approval-queue-empty">현재 승인 대기 중인 유저가 없습니다.</div>
      ) : (
        <>
          <div className="approval-queue-table-shell table-scroll-shell table-scroll-shell--mobile-compact">
            <table className="approval-queue-table">
              <thead>
                <tr>
                  <th>선택</th>
                  <th>학번</th>
                  <th>이름</th>
                  <th>학과</th>
                  <th>학년</th>
                  <th>나이</th>
                  <th>교육반</th>
                  <th>이메일</th>
                  <th>신청시각</th>
                </tr>
              </thead>
              <tbody>
                {items.map((item) => {
                  const rowValues = [
                    { label: '학번', value: item.studentId },
                    { label: '이름', value: item.displayName },
                    { label: '학과', value: item.department },
                    { label: '학년', value: item.grade === null ? '-' : String(item.grade) },
                    { label: '나이', value: item.age === null ? '-' : String(item.age) },
                    { label: '교육반', value: item.trainingType },
                    { label: '이메일', value: item.email },
                    { label: '신청시각', value: formatDateTime(item.requestedAt) }
                  ];

                  return (
                    <tr key={item.id}>
                      <td>
                        <input
                          type="checkbox"
                          checked={selectedIds.includes(item.id)}
                          onChange={() => handleToggle(item.id)}
                        />
                      </td>
                      {rowValues.map((cell) => (
                        <td
                          key={`${item.id}:${cell.label}`}
                          className={isMobile ? 'approval-queue-cell approval-queue-cell--tap' : 'approval-queue-cell'}
                          onClick={() => {
                            if (!isMobile) return;
                            setExpandedCell((current) =>
                              current && current.label === cell.label && current.value === cell.value
                                ? null
                                : { label: cell.label, value: cell.value }
                            );
                          }}
                          title={cell.value}
                        >
                          {previewCell(cell.label, cell.value, isMobile)}
                        </td>
                      ))}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {isMobile ? (
            <div className="approval-queue-mobile-note">
              <div>표 셀을 누르면 숨겨진 내용 전체를 아래에서 확인할 수 있어요.</div>
              {expandedCell ? (
                <div className="approval-queue-cell-detail">
                  <strong>{expandedCell.label}</strong>
                  <div>{expandedCell.value}</div>
                </div>
              ) : null}
            </div>
          ) : null}
        </>
      )}

      <div className="approval-queue-actions">
        <button type="button" className="ghost-btn" onClick={onClose} disabled={acting}>
          닫기
        </button>
        <button
          type="button"
          className="primary-btn"
          onClick={() => void handleDecision('approve')}
          disabled={acting || selectedCount === 0}
        >
          승인
        </button>
        <button
          type="button"
          className="danger-outline-btn"
          onClick={() => void handleDecision('reject')}
          disabled={acting || selectedCount === 0}
        >
          거절
        </button>
      </div>
    </>
  );

  if (mode === 'sheet') {
    return (
      <>
        <button
          type="button"
          className={`mobile-side-sheet-backdrop ${open ? 'is-open' : ''}`}
          aria-hidden={!open}
          onClick={onClose}
        />
        <aside className={`mobile-side-sheet approval-side-sheet ${open ? 'is-open' : ''}`}>
          <div className="mobile-side-sheet__header">
            <button type="button" className="mobile-search-drawer__back" onClick={onClose}>
              ←
            </button>
            <h2>{title}</h2>
            <button type="button" className="mobile-search-drawer__close" onClick={onClose}>
              닫기
            </button>
          </div>
          <div className="mobile-side-sheet__body approval-side-sheet__body">{body}</div>
        </aside>
      </>
    );
  }

  return !open ? null : (
    <div className="modal-backdrop approval-queue-modal-backdrop">
      <div className="modal-card approval-queue-modal-card">
        <h3>{title}</h3>
        {body}
      </div>
    </div>
  );
}