import { useEffect, useMemo, useState } from 'react';
import {
  decidePendingApprovalApplicants,
  fetchPendingApprovalApplicants,
  type AppointableClubRole,
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

const ROLE_OPTIONS: AppointableClubRole[] = ['일반', '임원', '부회장', '회장'];

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
    신청시각: 10,
    직책: 4
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
  const [selectedRoles, setSelectedRoles] = useState<Record<string, AppointableClubRole>>({});
  const [expandedCell, setExpandedCell] = useState<{ label: string; value: string } | null>(null);

  const selectedCount = selectedIds.length;

  const load = async () => {
    setLoading(true);

    try {
      const response = await fetchPendingApprovalApplicants();
      setItems(response.items);
      setSelectedIds((current) => current.filter((id) => response.items.some((item) => item.id === id)));

      setSelectedRoles((current) => {
        const next: Record<string, AppointableClubRole> = {};
        for (const item of response.items) {
          next[item.id] = current[item.id] ?? item.assignedRole ?? '일반';
        }
        return next;
      });

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

  const handleRoleChange = (userId: string, role: AppointableClubRole) => {
    setSelectedRoles((current) => ({
      ...current,
      [userId]: role
    }));
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
        action,
        roleByUserId:
          action === 'approve'
            ? Object.fromEntries(selectedIds.map((userId) => [userId, selectedRoles[userId] ?? '일반']))
            : undefined
      });

      setItems(response.items);
      setSelectedIds([]);
      setExpandedCell(null);

      setSelectedRoles((current) => {
        const next: Record<string, AppointableClubRole> = {};
        for (const item of response.items) {
          next[item.id] = current[item.id] ?? item.assignedRole ?? '일반';
        }
        return next;
      });

      onResolved?.(response.count);

      pushToast(
        action === 'approve' ? '선택한 유저를 승인했습니다.' : '선택한 유저를 거절했습니다.',
        'success'
      );

      if (response.count === 0) {
        onClose();
      }
    } catch (error) {
      pushToast(error instanceof Error ? error.message : '승인 처리에 실패했습니다.', 'error');
    } finally {
      setActing(false);
    }
  };

  const selectedLabel = useMemo(() => {
    if (selectedCount === 0) return '선택 0명';
    return `선택 ${selectedCount}명`;
  }, [selectedCount]);

  const body = (
    <>
      <div className="approval-summary-row">
        <span>대기 중 {items.length}명</span>
        <span>{selectedLabel}</span>
      </div>

      {loading ? (
        <div className="approval-empty-state">대기 목록을 불러오는 중입니다.</div>
      ) : items.length === 0 ? (
        <div className="approval-empty-state">현재 승인 대기 중인 유저가 없습니다.</div>
      ) : (
        <>
          <div className="approval-table-wrap">
            <table className="approval-table">
              <thead>
                <tr>
                  <th className="checkbox-cell">선택</th>
                  <th>학번</th>
                  <th>이름</th>
                  <th>학과</th>
                  <th>학년</th>
                  <th>나이</th>
                  <th>교육반</th>
                  <th>직책</th>
                  <th>이메일</th>
                  <th>신청시각</th>
                </tr>
              </thead>
              <tbody>
                {items.map((item) => {
                  const rowValues = [
                    { label: '학번', value: item.studentId || '-' },
                    { label: '이름', value: item.displayName || '-' },
                    { label: '학과', value: item.department || '-' },
                    { label: '학년', value: item.grade === null ? '-' : String(item.grade) },
                    { label: '나이', value: item.age === null ? '-' : String(item.age) },
                    { label: '교육반', value: item.trainingType || '-' },
                    { label: '이메일', value: item.email || '-' },
                    { label: '신청시각', value: formatDateTime(item.requestedAt) }
                  ];

                  return (
                    <tr key={item.id}>
                      <td className="checkbox-cell">
                        <input
                          type="checkbox"
                          checked={selectedIds.includes(item.id)}
                          onChange={() => handleToggle(item.id)}
                        />
                      </td>

                      {rowValues.slice(0, 6).map((cell) => (
                        <td
                          key={`${item.id}-${cell.label}`}
                          title={cell.value}
                          className={isMobile ? 'approval-cell-button' : undefined}
                          onClick={() => {
                            if (!isMobile) return;
                            setExpandedCell((current) =>
                              current && current.label === cell.label && current.value === cell.value
                                ? null
                                : { label: cell.label, value: cell.value }
                            );
                          }}
                        >
                          {previewCell(cell.label, cell.value, isMobile)}
                        </td>
                      ))}

                      <td
                        title={item.trainingType || '-'}
                        className={isMobile ? 'approval-cell-button' : undefined}
                        onClick={() => {
                          if (!isMobile) return;
                          const value = item.trainingType || '-';
                          setExpandedCell((current) =>
                            current && current.label === '교육반' && current.value === value
                              ? null
                              : { label: '교육반', value }
                          );
                        }}
                      >
                        {previewCell('교육반', item.trainingType || '-', isMobile)}
                      </td>

                      <td>
                        <select
                          className="approval-role-select"
                          value={selectedRoles[item.id] ?? '일반'}
                          onChange={(event) =>
                            handleRoleChange(item.id, event.target.value as AppointableClubRole)
                          }
                          disabled={acting}
                        >
                          {ROLE_OPTIONS.map((role) => (
                            <option key={role} value={role}>
                              {role}
                            </option>
                          ))}
                        </select>
                      </td>

                      {rowValues.slice(6).map((cell) => (
                        <td
                          key={`${item.id}-${cell.label}`}
                          title={cell.value}
                          className={isMobile ? 'approval-cell-button' : undefined}
                          onClick={() => {
                            if (!isMobile) return;
                            setExpandedCell((current) =>
                              current && current.label === cell.label && current.value === cell.value
                                ? null
                                : { label: cell.label, value: cell.value }
                            );
                          }}
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
            <>
              <div className="approval-mobile-hint">
                표 셀을 누르면 숨겨진 내용 전체를 아래에서 확인할 수 있어요.
              </div>

              {expandedCell ? (
                <div className="approval-mobile-detail-card">
                  <div className="approval-mobile-detail-label">{expandedCell.label}</div>
                  <div className="approval-mobile-detail-value">{expandedCell.value}</div>
                </div>
              ) : null}
            </>
          ) : null}
        </>
      )}

      <div className="approval-action-row">
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
          className="ghost-btn"
          onClick={() => void handleDecision('reject')}
          disabled={acting || selectedCount === 0}
        >
          거절
        </button>
      </div>
    </>
  );

  if (mode === 'sheet') {
    return !open ? null : (
      <div className="approval-sheet">
        <div className="approval-sheet-header">
          <button type="button" className="approval-sheet-back" onClick={onClose}>
            ←
          </button>
          <h2>{title}</h2>
          <button type="button" className="approval-sheet-close" onClick={onClose}>
            닫기
          </button>
        </div>

        <div className="approval-sheet-body">{body}</div>
      </div>
    );
  }

  return !open ? null : (
    <div className="approval-modal">
      <div className="approval-modal-card">
        <h3>{title}</h3>
        {body}
      </div>
    </div>
  );
}