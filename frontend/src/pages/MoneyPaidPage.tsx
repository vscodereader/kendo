import { useEffect, useMemo, useRef, useState } from 'react';
import {
  fetchMoneyBootstrap,
  fetchMoneySnapshot,
  formatNumber,
  makeDraftMoneyRow,
  parseNullableInt,
  recalculateMoneyRows,
  saveMoneySnapshot,
  type LoadedMoneySnapshot,
  type MoneyRow,
  type MoneySnapshotSummary
} from '../lib/club';
import { useToast } from '../lib/toast';
import { useUnsavedChangesGuard } from '../hooks/useUnsavedChangesGuard';
import { useResizableColumns } from '../hooks/useResizableColumns';
import { useIsMobile } from '../hooks/useIsMobile';
import { focusClosestEditable } from '../lib/mobileFocus';
import MobileQuickMoneyEntry from '../components/MobileQuickMoneyEntry';

const INITIAL_WIDTHS = {
  category: 120,
  item: 260,
  note: 220,
  income: 150,
  expense: 150,
  remainingFee: 170,
  leftFee: 170,
  delete: 90
};

function MoneyPaidPage() {
  const { pushToast } = useToast();
  const saveButtonRef = useRef<HTMLButtonElement | null>(null);
  const [snapshotOptions, setSnapshotOptions] = useState<MoneySnapshotSummary[]>([]);
  const [selectedSnapshotId, setSelectedSnapshotId] = useState<string | null>(null);
  const [loadedSnapshot, setLoadedSnapshot] = useState<LoadedMoneySnapshot | null>(null);
  const [rows, setRows] = useState<MoneyRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [highlightSave, setHighlightSave] = useState(false);
  const { colStyles, startResize } = useResizableColumns(INITIAL_WIDTHS);
  const isMobile = useIsMobile();
  const [quickEntryOpen, setQuickEntryOpen] = useState(false);

  const hasUnsavedChanges = useMemo(() => {
    if (!loadedSnapshot) return false;
    return JSON.stringify(stripChecked(rows)) !== JSON.stringify(stripChecked(loadedSnapshot.entries));
  }, [loadedSnapshot, rows]);

  const pulseSaveButton = () => {
    setHighlightSave(true);
    window.setTimeout(() => setHighlightSave(false), 1800);
    saveButtonRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  };

  const { ensureCanLeave } = useUnsavedChangesGuard(hasUnsavedChanges, pulseSaveButton);

  useEffect(() => {
    void initialize();
  }, []);

  async function initialize(preferredId?: string | null) {
    setLoading(true);
    try {
      const bootstrap = await fetchMoneyBootstrap(preferredId);
      setSnapshotOptions(bootstrap.items);
      setSelectedSnapshotId(bootstrap.snapshot?.id ?? bootstrap.latestSnapshotId ?? null);
      setLoadedSnapshot(bootstrap.snapshot);
      setRows((bootstrap.snapshot?.entries ?? []).map((entry) => ({ ...entry, checked: false })));
    } catch (error) {
      pushToast(error instanceof Error ? error.message : '회비 내역을 불러오지 못했습니다.', 'error');
    } finally {
      setLoading(false);
    }
  }

  const filteredRows = useMemo(() => {
    if (!search.trim()) return rows;
    return rows.filter((row) => (row.item ?? '').includes(search.trim()));
  }, [rows, search]);

  const canDeleteChecked = rows.some((row) => row.checked);

  const handleLoadSnapshot = async (nextId: string) => {
    if (!ensureCanLeave()) return;
    setLoading(true);
    try {
      const snapshot = await fetchMoneySnapshot(nextId);
      setSelectedSnapshotId(snapshot.id);
      setLoadedSnapshot(snapshot);
      setRows(snapshot.entries.map((entry) => ({ ...entry, checked: false })));
    } catch (error) {
      pushToast(error instanceof Error ? error.message : '회비 내역을 불러오지 못했습니다.', 'error');
    } finally {
      setLoading(false);
    }
  };

  const updateRow = (id: string, patch: Partial<MoneyRow>) => {
    setRows((current) => recalculateMoneyRows(current.map((row) => (row.id === id ? { ...row, ...patch } : row))));
  };

  const handleAddRow = () => {
    setRows((current) => recalculateMoneyRows([...current, makeDraftMoneyRow()]));
  };

  const handleQuickSave = async (payload: {
    item: string;
    note: string;
    income: number;
    expense: number;
  }) => {
    setRows((current) =>
      recalculateMoneyRows([
        ...current,
        {
          ...makeDraftMoneyRow(),
          category: '회비',
          item: payload.item,
          note: payload.note || null,
          income: payload.income,
          expense: payload.expense,
          leftFee: 0,
          checked: false
        }
      ])
    );
  };

  const handleDeleteRows = () => {
    setRows((current) => recalculateMoneyRows(current.filter((row) => !row.checked)));
  };

  async function handleSave() {
    if (saving) return;
    setSaving(true);
    try {
      const response = await saveMoneySnapshot({
        baseSnapshotId: loadedSnapshot?.id ?? null,
        entries: stripChecked(rows)
      });
      const nextSnapshot = response.snapshot;
      setLoadedSnapshot(nextSnapshot);
      setRows(nextSnapshot.entries.map((entry) => ({ ...entry, checked: false })));
      setSelectedSnapshotId(nextSnapshot.id);
      setSnapshotOptions((current) => {
        const withoutNew = current.filter((item) => item.id !== response.summary.id);
        return [response.summary, ...withoutNew];
      });
      pushToast('저장되었습니다.', 'success');
    } catch (error) {
      pushToast(error instanceof Error ? error.message : '회비 저장에 실패했습니다.', 'error');
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="page-shell page-shell--center">
        <div className="simple-card simple-card--loading">
          <h1>회비 내역을 불러오는 중입니다.</h1>
        </div>
      </div>
    );
  }

  return (
    <div className="page-shell page-shell--table">
      <div className="table-page-card">
        <div className="table-page-header">
          <div>
            <h1>예산 등록</h1>
            <p className="muted-text">누적 잔여회비는 위에서부터 현재 행까지의 수입/지출 누적으로 자동 계산됩니다.</p>
          </div>

          <div className="table-page-header-actions">
            <select
              className="wide-select"
              value={selectedSnapshotId ?? ''}
              onChange={(event) => void handleLoadSnapshot(event.target.value)}
            >
              <option value="">회비 내역 불러오기</option>
              {snapshotOptions.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.title}
                </option>
              ))}
            </select>

            <button className="delete-row-btn" disabled={!canDeleteChecked} onClick={handleDeleteRows}>
              행 삭제
            </button>

            <button className="row-add-btn" onClick={handleAddRow}>
              행 추가
            </button>
            {isMobile ? (
              <button className="ghost-btn" onClick={() => setQuickEntryOpen(true)}>
                빠른 작성
              </button>
            ) : null}
          </div>
        </div>

        <div className="filter-card">
          <div className="filter-grid filter-grid--money">
            <label className="filter-field filter-field--search">
              <span>품목 검색</span>
              <input
                value={searchInput}
                onChange={(event) => setSearchInput(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    setSearch(searchInput.trim());
                  }
                }}
                placeholder="품목 입력 후 Enter"
              />
            </label>
          </div>
        </div>

        <div
          className={`table-scroll-shell ${isMobile ? 'table-scroll-shell--mobile-compact' : ''}`}
          onClickCapture={focusClosestEditable}
        >
          <table className="excel-table">
            <colgroup>
              <col style={colStyles.category} />
              <col style={colStyles.item} />
              <col style={colStyles.note} />
              <col style={colStyles.income} />
              <col style={colStyles.expense} />
              <col style={colStyles.remainingFee} />
              <col style={colStyles.leftFee} />
              <col style={colStyles.delete} />
            </colgroup>

            <thead>
              <tr>
                {[
                  ['category', '구분'],
                  ['item', '품목'],
                  ['note', '비고'],
                  ['income', '수입금액'],
                  ['expense', '지출금액'],
                  ['remainingFee', '잔여회비'],
                  ['leftFee', '남은회비'],
                  ['delete', '삭제']
                ].map(([key, label]) => (
                  <th key={key}>
                    <div className="th-content">
                      <span>{label}</span>
                      <span className="col-resizer" onMouseDown={(event) => startResize(key, event.clientX)} />
                    </div>
                  </th>
                ))}
              </tr>
            </thead>

            <tbody>
              {filteredRows.map((row) => (
                <tr key={row.id}>
                  <td>
                    <input
                      value={row.category ?? ''}
                      onChange={(event) => updateRow(row.id, { category: event.target.value || null })}
                    />
                  </td>

                  <td>
                    <input
                      value={row.item ?? ''}
                      onChange={(event) => updateRow(row.id, { item: event.target.value || null })}
                    />
                  </td>

                  <td>
                    <input
                      value={row.note ?? ''}
                      onChange={(event) => updateRow(row.id, { note: event.target.value || null })}
                    />
                  </td>

                  <td>
                    <input
                      value={formatNumber(row.income)}
                      onChange={(event) => updateRow(row.id, { income: parseNullableInt(event.target.value) })}
                    />
                  </td>

                  <td>
                    <input
                      value={formatNumber(row.expense)}
                      onChange={(event) => updateRow(row.id, { expense: parseNullableInt(event.target.value) })}
                    />
                  </td>

                  <td>
                    <input value={formatNumber(row.remainingFee)} readOnly className="readonly-like" />
                  </td>

                  <td>
                    <input
                      value={row.leftFee === null ? '' : formatNumber(row.leftFee)}
                      onChange={(event) => updateRow(row.id, { leftFee: parseNullableInt(event.target.value) })}
                    />
                  </td>

                  <td className="checkbox-cell">
                    <input
                      type="checkbox"
                      checked={Boolean(row.checked)}
                      onChange={(event) => updateRow(row.id, { checked: event.target.checked })}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

               <div className="bottom-save-row">
                  <button
                    ref={saveButtonRef}
                    className={`save-primary-btn ${highlightSave ? 'save-primary-btn--highlight' : ''}`}
                    onClick={() => void handleSave()}
                    disabled={saving}
                  >
                    {saving ? '저장 중...' : '회비 저장'}
                  </button>
                </div>
              </div>

              <MobileQuickMoneyEntry
                open={quickEntryOpen}
                onClose={() => setQuickEntryOpen(false)}
                onSave={handleQuickSave}
              />
            </div>
          );
        }

function stripChecked(rows: MoneyRow[]) {
  return rows.map(({ checked, ...rest }) => rest);
}

export default MoneyPaidPage;