import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../lib/auth';
import {
  displayRoleLabel,
  fetchRoster,
  fetchRosterBootstrap,
  insertBeforeAdmin,
  makeDraftMember,
  roleOptionsForActor,
  saveRoster,
  sortAdminLast,
  type AppointableClubRole,
  type ClubRole,
  type LoadedRoster,
  type MemberRow,
  type RosterSummary,
  type TrainingType
} from '../lib/club';
import { useToast } from '../lib/toast';
import { useUnsavedChangesGuard } from '../hooks/useUnsavedChangesGuard';
import { useResizableColumns } from '../hooks/useResizableColumns';

type AppointmentState = {
  targetId: string;
  nextRole: AppointableClubRole;
};

type RemovalState = {
  targetId: string;
};

const INITIAL_WIDTHS = {
  year: 90,
  studentId: 110,
  department: 170,
  grade: 90,
  age: 90,
  name: 130,
  trainingType: 110,
  role: 110,
  roleDetail: 170,
  appoint: 110,
  expel: 110
};

function MembersPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { pushToast } = useToast();
  const saveButtonRef = useRef<HTMLButtonElement | null>(null);

  const [rosterOptions, setRosterOptions] = useState<RosterSummary[]>([]);
  const [selectedRosterId, setSelectedRosterId] = useState<string | null>(null);
  const [loadedRoster, setLoadedRoster] = useState<LoadedRoster | null>(null);
  const [rows, setRows] = useState<MemberRow[]>([]);
  const [rosterTitleInput, setRosterTitleInput] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [menuRowId, setMenuRowId] = useState<string | null>(null);
  const [appointment, setAppointment] = useState<AppointmentState | null>(null);
  const [removal, setRemoval] = useState<RemovalState | null>(null);
  const [highlightSave, setHighlightSave] = useState(false);

  const [studentIdFilter, setStudentIdFilter] = useState('');
  const [gradeFilter, setGradeFilter] = useState('');
  const [ageFilter, setAgeFilter] = useState('');
  const [trainingFilter, setTrainingFilter] = useState<'전체' | TrainingType>('전체');
  const [roleFilter, setRoleFilter] = useState<'전체' | ClubRole>('전체');
  const [detailFilter, setDetailFilter] = useState('');
  const [nameSearchInput, setNameSearchInput] = useState('');
  const [nameSearch, setNameSearch] = useState('');

  const { colStyles, startResize } = useResizableColumns(INITIAL_WIDTHS);

  const hasUnsavedChanges = useMemo(() => {
    if (!loadedRoster) return false;
    return JSON.stringify(rows) !== JSON.stringify(loadedRoster.members) || rosterTitleInput.trim() !== loadedRoster.title;
  }, [loadedRoster, rows, rosterTitleInput]);

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
      const bootstrap = await fetchRosterBootstrap(preferredId);
      setRosterOptions(bootstrap.items);
      setSelectedRosterId(bootstrap.roster?.id ?? bootstrap.latestRosterId ?? null);
      setLoadedRoster(bootstrap.roster);
      setRows(sortAdminLast(bootstrap.roster?.members ?? []));
      setRosterTitleInput(bootstrap.roster?.title ?? '');
    } catch (error) {
      pushToast(error instanceof Error ? error.message : '명단을 불러오지 못했습니다.', 'error');
    } finally {
      setLoading(false);
    }
  }

  const stats = useMemo(
    () => ({
      total: rows.filter((row) => !row.isAdmin).length,
      general: rows.filter((row) => !row.isAdmin && row.role === '일반').length,
      executive: rows.filter((row) => !row.isAdmin && ['임원', '부회장', '회장'].includes(row.role)).length
    }),
    [rows]
  );

  const displayedRows = useMemo(() => {
    return rows.filter((row) => {
      if (row.isAdmin) return true;

      const byStudentId = !studentIdFilter || String(row.studentId ?? '').includes(studentIdFilter.trim());
      const byGrade = !gradeFilter || String(row.grade ?? '').includes(gradeFilter.trim());
      const byAge = !ageFilter || String(row.age ?? '').includes(ageFilter.trim());
      const byTraining = trainingFilter === '전체' || row.trainingType === trainingFilter;
      const byRole = roleFilter === '전체' || row.role === roleFilter;
      const byDetail = !detailFilter || (row.roleDetail ?? '').includes(detailFilter.trim());
      const byName = !nameSearch || row.name.includes(nameSearch.trim());

      return byStudentId && byGrade && byAge && byTraining && byRole && byDetail && byName;
    });
  }, [rows, studentIdFilter, gradeFilter, ageFilter, trainingFilter, roleFilter, detailFilter, nameSearch]);

  const actorRole = user?.clubRole ?? '일반';
  const actorDisplayRole = user?.isRoot ? 'Admin' : actorRole;

  const handleLoadRoster = async (nextId: string) => {
    if (!ensureCanLeave()) return;
    setLoading(true);
    try {
      const roster = await fetchRoster(nextId);
      setSelectedRosterId(roster.id);
      setLoadedRoster(roster);
      setRows(sortAdminLast(roster.members));
      setRosterTitleInput(roster.title);
      setMenuRowId(null);
      setAppointment(null);
      setRemoval(null);
    } catch (error) {
      pushToast(error instanceof Error ? error.message : '명단을 불러오지 못했습니다.', 'error');
    } finally {
      setLoading(false);
    }
  };

  const updateRow = (id: string, patch: Partial<MemberRow>) => {
    setRows((current) => sortAdminLast(current.map((row) => (row.id === id ? { ...row, ...patch } : row))));
  };

  const handleAddRow = () => {
    setRows((current) => insertBeforeAdmin(current, makeDraftMember(loadedRoster?.rosterYear ?? new Date().getFullYear())));
  };

  const handleAppointmentClick = (row: MemberRow) => {
    if (row.isAdmin) return;

    if (actorRole === '임원') {
      pushToast('이 버튼은 회/부회장만 사용할 수 있습니다.', 'error');
      return;
    }

    const isSelf = row.id === user?.memberId || row.linkedUserId === user?.id || row.email === user?.email;
    const options = roleOptionsForActor(actorRole, row, isSelf);

    if (options.length === 0) {
      pushToast('이 버튼은 회/부회장만 사용할 수 있습니다.', 'error');
      return;
    }

    setMenuRowId((current) => (current === row.id ? null : row.id));
  };

  const selectAppointment = (row: MemberRow, nextRole: AppointableClubRole) => {
    const isSelf = row.id === user?.memberId || row.linkedUserId === user?.id || row.email === user?.email;

    if (actorRole === '회장' && isSelf && nextRole !== '회장') {
      const hasOtherPresident = rows.some((item) => item.id !== row.id && !item.isAdmin && item.role === '회장');
      if (!hasOtherPresident) {
        pushToast('후임자를 회장으로 임명하지 않고 본인의 직책을 바꿀 순 없습니다. 후임자를 회장으로 먼저 임명하세요', 'error');
        setMenuRowId(null);
        return;
      }
    }

    setAppointment({ targetId: row.id, nextRole });
    setMenuRowId(null);
  };

  const confirmAppointment = async () => {
    if (!appointment) return;
    const target = rows.find((row) => row.id === appointment.targetId);
    if (!target || target.isAdmin) return;

    const isSelf = target.id === user?.memberId || target.linkedUserId === user?.id || target.email === user?.email;

    let nextRows = rows.map((row) => {
      if (row.id !== target.id) return row;
      return {
        ...row,
        role: appointment.nextRole,
        roleDetail: appointment.nextRole === '임원' ? row.roleDetail : null
      };
    });

    const shouldAutoSavePresidentSuccession = actorRole === '회장' && !isSelf && appointment.nextRole === '회장';
    const shouldAutoSaveViceSelfDemotion = actorRole === '부회장' && isSelf && appointment.nextRole === '일반';

    if (shouldAutoSavePresidentSuccession) {
      nextRows = nextRows.map((row) => {
        const actorSelf = row.id === user?.memberId || row.linkedUserId === user?.id || row.email === user?.email;
        if (!actorSelf || row.isAdmin) return row;
        return { ...row, role: '임원', roleDetail: row.roleDetail };
      });
    }

    nextRows = sortAdminLast(nextRows);
    setRows(nextRows);
    setAppointment(null);

    if (shouldAutoSavePresidentSuccession) {
      pushToast('회장 승계 내용을 바로 저장합니다.', 'info');
      await handleSave('overwrite', nextRows, '/members');
      return;
    }

    if (shouldAutoSaveViceSelfDemotion) {
      pushToast('부회장 권한이 해제되어 메뉴로 이동합니다.', 'info');
      await handleSave('overwrite', nextRows, '/select');
    }
  };

  const handleExpelClick = (row: MemberRow) => {
    if (row.isAdmin) return;

    if (actorRole === '임원') {
      pushToast('이 버튼은 회/부회장만 사용할 수 있습니다.', 'error');
      return;
    }

    setRemoval({ targetId: row.id });
  };

  const confirmExpel = () => {
    if (!removal) return;
    setRows((current) => sortAdminLast(current.filter((row) => row.id !== removal.targetId)));
    setRemoval(null);
  };

  async function handleSave(mode: 'overwrite' | 'clone', nextRowsOverride?: MemberRow[], navigateAfterSave?: string) {
    if (saving) return;

    const payloadRows = sortAdminLast(nextRowsOverride ?? rows);
    const rawTitle = rosterTitleInput.trim();

    if (mode === 'clone' && !rawTitle) {
      pushToast('새 명단 이름을 먼저 입력해주세요.', 'error');
      return;
    }

    if (mode === 'overwrite' && !loadedRoster?.id) {
      pushToast('현재 불러온 명단이 없습니다.', 'error');
      return;
    }

    setSaving(true);

    try {
      const response = await saveRoster({
        baseRosterId: loadedRoster?.id ?? null,
        title: mode === 'overwrite' ? ((loadedRoster?.title ?? rawTitle) || null) : rawTitle,
        members: payloadRows,
        mode
      });

      const nextRoster = response.roster;

      setLoadedRoster(nextRoster);
      setRows(sortAdminLast(nextRoster.members));
      setSelectedRosterId(nextRoster.id);
      setRosterTitleInput(nextRoster.title);

      setRosterOptions((current) => {
        const filtered = current.filter((item) => item.id !== response.summary.id);
        return [response.summary, ...filtered];
      });

      setMenuRowId(null);
      setAppointment(null);
      setRemoval(null);

      pushToast('저장되었습니다.', 'success');

      if (navigateAfterSave) {
        navigate(navigateAfterSave, { replace: true });
      }
    } catch (error) {
      pushToast(error instanceof Error ? error.message : '명단 저장에 실패했습니다.', 'error');
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="page-shell page-shell--center">
        <div className="simple-card simple-card--loading">
          <h1>명단을 불러오는 중입니다.</h1>
        </div>
      </div>
    );
  }

  const appointmentTarget = appointment ? rows.find((row) => row.id === appointment.targetId) ?? null : null;
  const removalTarget = removal ? rows.find((row) => row.id === removal.targetId) ?? null : null;

  return (
    <div className="page-shell page-shell--table">
      <div className="table-page-card">
        <div className="table-page-header">
          <div>
            <h1>동아리원</h1>
            <div className="members-summary-row">
              <span>총원 : {stats.total}명</span>
              <span>일반 : {stats.general}명</span>
              <span>임원진 : {stats.executive}명</span>
            </div>
          </div>

          <div className="table-page-header-actions">
            <select
              className="wide-select"
              value={selectedRosterId ?? ''}
              onChange={(event) => void handleLoadRoster(event.target.value)}
            >
              <option value="">명단 불러오기</option>
              {rosterOptions.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.title}
                </option>
              ))}
            </select>

            <div className="counter-text">현재 권한 : {actorDisplayRole}</div>

            <button className="row-add-btn" onClick={handleAddRow}>
              동아리원 추가
            </button>
          </div>
        </div>

        <div className="filter-card">
          <div className="filter-grid filter-grid--members">
            <label className="filter-field">
              <span>학번</span>
              <input value={studentIdFilter} onChange={(event) => setStudentIdFilter(event.target.value)} />
            </label>

            <label className="filter-field">
              <span>학년</span>
              <input value={gradeFilter} onChange={(event) => setGradeFilter(event.target.value)} />
            </label>

            <label className="filter-field">
              <span>나이</span>
              <input value={ageFilter} onChange={(event) => setAgeFilter(event.target.value)} />
            </label>

            <label className="filter-field">
              <span>교육반</span>
              <select value={trainingFilter} onChange={(event) => setTrainingFilter(event.target.value as '전체' | TrainingType)}>
                <option value="전체">전체</option>
                <option value="기본">기본</option>
                <option value="호구">호구</option>
              </select>
            </label>

            <label className="filter-field">
              <span>직책</span>
              <select value={roleFilter} onChange={(event) => setRoleFilter(event.target.value as '전체' | ClubRole)}>
                <option value="전체">전체</option>
                <option value="일반">일반</option>
                <option value="임원">임원</option>
                <option value="부회장">부회장</option>
                <option value="회장">회장</option>
                <option value="관리자">Admin</option>
              </select>
            </label>

            <label className="filter-field">
              <span>세부</span>
              <input value={detailFilter} onChange={(event) => setDetailFilter(event.target.value)} />
            </label>

            <label className="filter-field filter-field--search">
              <span>이름 검색</span>
              <input
                value={nameSearchInput}
                onChange={(event) => setNameSearchInput(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    setNameSearch(nameSearchInput.trim());
                  }
                }}
                placeholder="이름 입력 후 Enter"
              />
            </label>
          </div>
        </div>

        <div className="table-scroll-shell">
          <table className="excel-table">
            <colgroup>
              <col style={colStyles.year} />
              <col style={colStyles.studentId} />
              <col style={colStyles.department} />
              <col style={colStyles.grade} />
              <col style={colStyles.age} />
              <col style={colStyles.name} />
              <col style={colStyles.trainingType} />
              <col style={colStyles.role} />
              <col style={colStyles.roleDetail} />
              <col style={colStyles.appoint} />
              <col style={colStyles.expel} />
            </colgroup>

            <thead>
              <tr>
                {[
                  ['year', '연도'],
                  ['studentId', '학번'],
                  ['department', '학과'],
                  ['grade', '학년'],
                  ['age', '나이'],
                  ['name', '이름'],
                  ['trainingType', '교육반'],
                  ['role', '직책'],
                  ['roleDetail', '세부'],
                  ['appoint', '임명'],
                  ['expel', '퇴출']
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
              {displayedRows.map((row) => {
                const isSelf = row.id === user?.memberId || row.linkedUserId === user?.id || row.email === user?.email;
                const menuOptions = roleOptionsForActor(actorRole, row, isSelf);
                const hideAdminActions = row.isAdmin && !user?.isRoot;

                return (
                  <tr key={row.id} className={row.isAdmin ? 'admin-row' : ''}>
                    <td>
                      <input
                        value={row.year ?? ''}
                        readOnly={row.isAdmin}
                        className={row.isAdmin ? 'readonly-like' : ''}
                        onChange={(event) => updateRow(row.id, { year: Number(event.target.value) || null })}
                      />
                    </td>

                    <td>
                      <input
                        value={row.studentId ?? ''}
                        readOnly={row.isAdmin}
                        className={row.isAdmin ? 'readonly-like' : ''}
                        onChange={(event) => updateRow(row.id, { studentId: Number(event.target.value) || null })}
                      />
                    </td>

                    <td>
                      <input
                        value={row.department ?? ''}
                        readOnly={row.isAdmin}
                        className={row.isAdmin ? 'readonly-like' : ''}
                        onChange={(event) => updateRow(row.id, { department: event.target.value || null })}
                      />
                    </td>

                    <td>
                      <input
                        value={row.grade ?? ''}
                        readOnly={row.isAdmin}
                        className={row.isAdmin ? 'readonly-like' : ''}
                        onChange={(event) => updateRow(row.id, { grade: Number(event.target.value) || null })}
                      />
                    </td>

                    <td>
                      <input
                        value={row.age ?? ''}
                        readOnly={row.isAdmin}
                        className={row.isAdmin ? 'readonly-like' : ''}
                        onChange={(event) => updateRow(row.id, { age: Number(event.target.value) || null })}
                      />
                    </td>

                    <td>
                      <input
                        value={row.name}
                        readOnly={row.isAdmin}
                        className={row.isAdmin ? 'readonly-like' : ''}
                        onChange={(event) => updateRow(row.id, { name: event.target.value })}
                      />
                    </td>

                    <td>
                      {row.isAdmin ? (
                        <input value="" readOnly className="readonly-like" />
                      ) : (
                        <select
                          value={row.trainingType ?? '기본'}
                          onChange={(event) => updateRow(row.id, { trainingType: event.target.value as TrainingType })}
                        >
                          <option value="기본">기본</option>
                          <option value="호구">호구</option>
                        </select>
                      )}
                    </td>

                    <td>
                      <input value={displayRoleLabel(row)} readOnly className="readonly-like" />
                    </td>

                    <td>
                      <input
                        value={row.isAdmin ? '' : row.roleDetail ?? ''}
                        readOnly={row.isAdmin}
                        className={row.isAdmin ? 'readonly-like' : ''}
                        onChange={(event) => updateRow(row.id, { roleDetail: event.target.value || null })}
                      />
                    </td>

                    <td className="action-cell">
                      {hideAdminActions || row.isAdmin ? null : (
                        <>
                          <button
                            className={`table-action-btn table-action-btn--appoint ${actorRole === '임원' ? 'table-action-btn--disabled' : ''}`}
                            onClick={() => handleAppointmentClick(row)}
                          >
                            임명
                          </button>

                          {menuRowId === row.id && menuOptions.length > 0 ? (
                            <div className="inline-role-menu">
                              {menuOptions.map((option) => (
                                <button key={option} onClick={() => selectAppointment(row, option)}>
                                  {option}
                                </button>
                              ))}
                            </div>
                          ) : null}
                        </>
                      )}
                    </td>

                    <td>
                      {hideAdminActions || row.isAdmin ? null : (
                        <button
                          className={`table-action-btn table-action-btn--expel ${actorRole === '임원' ? 'table-action-btn--disabled' : ''}`}
                          onClick={() => handleExpelClick(row)}
                        >
                          퇴출
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <div className="bottom-save-row bottom-save-row--inline">
          <input
            className="save-title-input"
            value={rosterTitleInput}
            onChange={(event) => setRosterTitleInput(event.target.value)}
            placeholder="명단 이름을 입력하세요"
          />

          <button
            type="button"
            className={`save-secondary-btn ${highlightSave ? 'save-primary-btn--highlight' : ''}`}
            onClick={() => void handleSave('overwrite')}
            disabled={saving || !loadedRoster?.id}
          >
            {saving ? '저장 중...' : '저장'}
          </button>

          <button
            ref={saveButtonRef}
            type="button"
            className={`save-primary-btn ${highlightSave ? 'save-primary-btn--highlight' : ''}`}
            onClick={() => void handleSave('clone')}
            disabled={saving}
          >
            {saving ? '저장 중...' : '새 명단 저장'}
          </button>
        </div>
      </div>

      {appointmentTarget && appointment ? (
        <ConfirmModal
          title={`${appointmentTarget.name} 님을 ${appointment.nextRole} 직책으로 임명하시겠습니까?`}
          confirmText="확인"
          cancelText="취소"
          onCancel={() => setAppointment(null)}
          onConfirm={() => void confirmAppointment()}
        />
      ) : null}

      {removalTarget ? (
        <ConfirmModal
          title={`정말 ${removalTarget.name} 님을 퇴출하시겠습니까?`}
          confirmText="확인"
          cancelText="취소"
          danger
          onCancel={() => setRemoval(null)}
          onConfirm={confirmExpel}
        />
      ) : null}
    </div>
  );
}

function ConfirmModal({
  title,
  onConfirm,
  onCancel,
  confirmText,
  cancelText,
  danger
}: {
  title: string;
  onConfirm: () => void;
  onCancel: () => void;
  confirmText: string;
  cancelText: string;
  danger?: boolean;
}) {
  return (
    <div className="modal-backdrop">
      <div className="modal-card">
        <p>{title}</p>
        <div className="modal-actions">
          <button className="primary-btn" onClick={onConfirm}>
            {confirmText}
          </button>
          <button className={danger ? 'danger-btn' : 'ghost-btn'} onClick={onCancel}>
            {cancelText}
          </button>
        </div>
      </div>
    </div>
  );
}

export default MembersPage;