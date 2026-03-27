import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../lib/auth';
import { fetchScheduleEvents, saveScheduleEvents, type ScheduleEventRecord } from '../lib/club';
import { useToast } from '../lib/toast';

type EditableScheduleEvent = ScheduleEventRecord & {
  localId: string;
};

type EventFormState = {
  localId: string;
  title: string;
  startDate: string;
  endDate: string;
  colorHex: string;
};

type CalendarSegment = {
  event: EditableScheduleEvent;
  startCol: number;
  endCol: number;
};

const WEEKDAY_LABELS = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];
const DEFAULT_COLOR = '#4f6df5';

function createLocalId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `draft:${crypto.randomUUID()}`;
  }
  return `draft:${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function parseDateKey(value: string) {
  const [year, month, day] = value.split('-').map(Number);
  return new Date(year, month - 1, day, 12, 0, 0, 0);
}

function toDateKey(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function addDays(date: Date, amount: number) {
  const next = new Date(date);
  next.setDate(next.getDate() + amount);
  return next;
}

function startOfMonth(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), 1, 12, 0, 0, 0);
}

function endOfMonth(date: Date) {
  return new Date(date.getFullYear(), date.getMonth() + 1, 0, 12, 0, 0, 0);
}

function startOfCalendarGrid(date: Date) {
  const first = startOfMonth(date);
  return addDays(first, -first.getDay());
}

function endOfCalendarGrid(date: Date) {
  const last = endOfMonth(date);
  return addDays(last, 6 - last.getDay());
}

function dayDiff(start: Date, end: Date) {
  const ms = parseDateKey(toDateKey(end)).getTime() - parseDateKey(toDateKey(start)).getTime();
  return Math.round(ms / (1000 * 60 * 60 * 24));
}

function rangesOverlap(aStart: Date, aEnd: Date, bStart: Date, bEnd: Date) {
  return aStart <= bEnd && aEnd >= bStart;
}

function intersectsMonth(event: EditableScheduleEvent, viewDate: Date) {
  return rangesOverlap(
    parseDateKey(event.startDate),
    parseDateKey(event.endDate),
    startOfMonth(viewDate),
    endOfMonth(viewDate)
  );
}

function formatMonthTitle(date: Date) {
  return `${date.getFullYear()}년 ${date.getMonth() + 1}월`;
}

function formatDateRange(startDate: string, endDate: string) {
  if (startDate === endDate) return startDate.replaceAll('-', '.');
  return `${startDate.replaceAll('-', '.')} ~ ${endDate.replaceAll('-', '.')}`;
}

function toEditable(events: ScheduleEventRecord[]) {
  return events.map((event) => ({
    ...event,
    localId: event.id
  }));
}

function buildCalendarWeeks(viewDate: Date, events: EditableScheduleEvent[]) {
  const gridStart = startOfCalendarGrid(viewDate);
  const gridEnd = endOfCalendarGrid(viewDate);
  const weeks: Array<{
    weekStart: Date;
    days: Date[];
    lanes: CalendarSegment[][];
  }> = [];

  let cursor = new Date(gridStart);

  while (cursor <= gridEnd) {
    const weekStart = new Date(cursor);
    const weekEnd = addDays(weekStart, 6);
    const days = Array.from({ length: 7 }, (_, index) => addDays(weekStart, index));

    const segments = events
      .filter((event) =>
        rangesOverlap(parseDateKey(event.startDate), parseDateKey(event.endDate), weekStart, weekEnd)
      )
      .map((event) => {
        const eventStart = parseDateKey(event.startDate);
        const eventEnd = parseDateKey(event.endDate);
        const clippedStart = eventStart < weekStart ? weekStart : eventStart;
        const clippedEnd = eventEnd > weekEnd ? weekEnd : eventEnd;

        return {
          event,
          startCol: dayDiff(weekStart, clippedStart) + 1,
          endCol: dayDiff(weekStart, clippedEnd) + 2
        };
      })
      .sort((a, b) => a.event.sortOrder - b.event.sortOrder);

    const lanes: CalendarSegment[][] = [];

    segments.forEach((segment) => {
      let placed = false;

      for (const lane of lanes) {
        const overlapsExisting = lane.some(
          (existing) => !(segment.endCol <= existing.startCol || segment.startCol >= existing.endCol)
        );

        if (!overlapsExisting) {
          lane.push(segment);
          placed = true;
          break;
        }
      }

      if (!placed) {
        lanes.push([segment]);
      }
    });

    weeks.push({ weekStart, days, lanes });
    cursor = addDays(cursor, 7);
  }

  return weeks;
}

function SchedulePage() {
  const navigate = useNavigate();
  const { user, loading, authenticated } = useAuth();
  const { pushToast } = useToast();

  const [viewDate, setViewDate] = useState(() => new Date());
  const [events, setEvents] = useState<EditableScheduleEvent[]>([]);
  const [draftEvents, setDraftEvents] = useState<EditableScheduleEvent[]>([]);
  const [pageLoading, setPageLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [eventForm, setEventForm] = useState<EventFormState | null>(null);
  const [activeNoteId, setActiveNoteId] = useState<string | null>(null);

  const canManage = useMemo(() => {
    if (!user) return false;
    if (user.isRoot) return true;
    return ['임원', '부회장', '회장'].includes(user.clubRole ?? '일반');
  }, [user]);

  useEffect(() => {
    if (loading) return;
    if (!authenticated) {
      navigate('/login', { replace: true });
      return;
    }
    if (!user?.profileCompleted && !user?.isRoot) {
      navigate('/profile-setup', { replace: true });
      return;
    }

    const run = async () => {
      setPageLoading(true);
      try {
        const result = await fetchScheduleEvents();
        setEvents(toEditable(result));
      } catch (error) {
        pushToast(error instanceof Error ? error.message : '일정을 불러오지 못했습니다.', 'error');
      } finally {
        setPageLoading(false);
      }
    };

    void run();
  }, [loading, authenticated, user, navigate, pushToast]);

  const sourceEvents = editing ? draftEvents : events;

  const visibleMonthEvents = useMemo(() => {
    return sourceEvents
      .filter((event) => intersectsMonth(event, viewDate))
      .sort((a, b) => {
        if (a.startDate !== b.startDate) return a.startDate.localeCompare(b.startDate);
        return a.sortOrder - b.sortOrder;
      });
  }, [sourceEvents, viewDate]);

  const weeks = useMemo(() => buildCalendarWeeks(viewDate, sourceEvents), [viewDate, sourceEvents]);

  const beginEdit = () => {
    setDraftEvents(events.map((event) => ({ ...event })));
    setEditing(true);
    setActiveNoteId(null);
  };

  const cancelEdit = () => {
    setDraftEvents([]);
    setEditing(false);
    setEventForm(null);
    setActiveNoteId(null);
  };

  const openCreateModal = () => {
    const baseDate = toDateKey(startOfMonth(viewDate));
    setEventForm({
      localId: createLocalId(),
      title: '',
      startDate: baseDate,
      endDate: baseDate,
      colorHex: DEFAULT_COLOR
    });
  };

  const openEditModal = (event: EditableScheduleEvent) => {
    setEventForm({
      localId: event.localId,
      title: event.title,
      startDate: event.startDate,
      endDate: event.endDate,
      colorHex: event.colorHex
    });
  };

  const saveEventForm = () => {
    if (!eventForm) return;
    if (!eventForm.title.trim()) {
      pushToast('일정 내용을 입력해주세요.', 'error');
      return;
    }

    const startDate = eventForm.startDate <= eventForm.endDate ? eventForm.startDate : eventForm.endDate;
    const endDate = eventForm.startDate <= eventForm.endDate ? eventForm.endDate : eventForm.startDate;

    setDraftEvents((current) => {
      const exists = current.some((item) => item.localId === eventForm.localId);

      if (exists) {
        return current.map((item) =>
          item.localId === eventForm.localId
            ? {
                ...item,
                title: eventForm.title.trim(),
                startDate,
                endDate,
                colorHex: eventForm.colorHex || DEFAULT_COLOR
              }
            : item
        );
      }

      return [
        ...current,
        {
          id: eventForm.localId,
          localId: eventForm.localId,
          title: eventForm.title.trim(),
          displayNote: null,
          startDate,
          endDate,
          colorHex: eventForm.colorHex || DEFAULT_COLOR,
          sortOrder: current.length
        }
      ];
    });

    setEventForm(null);
  };

  const removeEvent = (localId: string) => {
    setDraftEvents((current) =>
      current
        .filter((item) => item.localId !== localId)
        .map((item, index) => ({ ...item, sortOrder: index }))
    );
    setActiveNoteId((current) => (current === localId ? null : current));
  };

  const updateDraftDisplayNote = (localId: string, value: string) => {
    setDraftEvents((current) =>
      current.map((item) =>
        item.localId === localId
          ? {
              ...item,
              displayNote: value
            }
          : item
      )
    );
  };

  const saveAllChanges = async () => {
    setSaving(true);
    try {
      const payload = draftEvents.map((item, index) => ({
        title: item.title,
        displayNote: item.displayNote?.trim() ? item.displayNote.trim() : null,
        startDate: item.startDate,
        endDate: item.endDate,
        colorHex: item.colorHex,
        sortOrder: index
      }));

      const result = await saveScheduleEvents(payload);
      const nextEvents = toEditable(result);
      setEvents(nextEvents);
      setDraftEvents([]);
      setEditing(false);
      setEventForm(null);
      setActiveNoteId(null);
      pushToast('저장되었습니다.', 'success');
    } catch (error) {
      pushToast(error instanceof Error ? error.message : '일정 저장에 실패했습니다.', 'error');
    } finally {
      setSaving(false);
    }
  };

  if (pageLoading) {
    return (
      <div className="page-shell page-shell--center">
        <div className="simple-card simple-card--loading">
          <h1>일정을 불러오는 중입니다.</h1>
        </div>
      </div>
    );
  }

  return (
    <div className="page-shell themed-page-shell">
      <div className="schedule-page-card">
        <div className="schedule-nav">
          <div className="schedule-nav-side">
            <button className="schedule-nav-button" onClick={() => setViewDate(new Date(viewDate.getFullYear() - 1, viewDate.getMonth(), 1))}>
              « {viewDate.getFullYear() - 1}년
            </button>
            <button className="schedule-nav-button" onClick={() => setViewDate(new Date(viewDate.getFullYear(), viewDate.getMonth() - 1, 1))}>
              ‹ 이전달
            </button>
          </div>

          <div className="schedule-nav-title">{formatMonthTitle(viewDate)}</div>

          <div className="schedule-nav-side schedule-nav-side--right">
            <button className="schedule-nav-button" onClick={() => setViewDate(new Date(viewDate.getFullYear(), viewDate.getMonth() + 1, 1))}>
              다음달 ›
            </button>
            <button className="schedule-nav-button" onClick={() => setViewDate(new Date(viewDate.getFullYear() + 1, viewDate.getMonth(), 1))}>
              {viewDate.getFullYear() + 1}년 »
            </button>
          </div>
        </div>

        <div className="schedule-calendar-card">
          <div className="schedule-weekday-row">
            {WEEKDAY_LABELS.map((label) => (
              <div key={label} className="schedule-weekday-cell">
                {label}
              </div>
            ))}
          </div>

          {weeks.map((week) => (
            <div key={toDateKey(week.weekStart)} className="schedule-week">
              <div className="schedule-day-grid">
                {week.days.map((day) => {
                  const isOutside = day.getMonth() !== viewDate.getMonth();
                  return (
                    <div key={toDateKey(day)} className={`schedule-day-cell ${isOutside ? 'schedule-day-cell--outside' : ''}`}>
                      <div className="schedule-day-number">{day.getDate()}</div>
                    </div>
                  );
                })}
              </div>

              <div className="schedule-lanes">
                {week.lanes.length === 0 ? (
                  <div className="schedule-lane-grid schedule-lane-grid--empty" />
                ) : (
                  week.lanes.map((lane, laneIndex) => (
                    <div key={laneIndex} className="schedule-lane-grid">
                      {lane.map((segment) => (
                        <div
                          key={`${segment.event.localId}-${segment.startCol}-${segment.endCol}`}
                          className="schedule-event-bar"
                          style={{
                            gridColumn: `${segment.startCol} / ${segment.endCol}`,
                            backgroundColor: segment.event.colorHex
                          }}
                        >
                          <span>{segment.event.title}</span>
                        </div>
                      ))}
                    </div>
                  ))
                )}
              </div>
            </div>
          ))}
        </div>

        <div className="schedule-guide-card">
          <div className="schedule-guide-header">
            <h2>이번 달 일정 안내</h2>
            {canManage ? (
              <div className="schedule-guide-actions">
                {!editing ? (
                  <button className="ghost-btn" onClick={beginEdit}>
                    수정 ✏️
                  </button>
                ) : (
                  <>
                    <button className="ghost-btn" onClick={openCreateModal}>
                      일정 추가
                    </button>
                    <button className="primary-btn" onClick={saveAllChanges} disabled={saving}>
                      {saving ? '저장 중...' : '저장'}
                    </button>
                    <button className="ghost-btn" onClick={cancelEdit} disabled={saving}>
                      취소
                    </button>
                  </>
                )}
              </div>
            ) : null}
          </div>

          <table className="schedule-table">
            <thead>
              <tr>
                <th>색</th>
                <th>날짜</th>
                <th>일정내용</th>
                {editing ? <th>관리</th> : null}
              </tr>
            </thead>
            <tbody>
              {visibleMonthEvents.length === 0 ? (
                <tr>
                  <td colSpan={editing ? 4 : 3} className="schedule-empty">
                    이번 달 일정이 없습니다.
                  </td>
                </tr>
              ) : (
                visibleMonthEvents.map((event) => {
                  const displayText = event.displayNote?.trim() ? event.displayNote : event.title;
                  const isActiveNote = activeNoteId === event.localId;

                  return (
                    <tr key={event.localId}>
                      <td>
                        <span className="schedule-color-chip" style={{ backgroundColor: event.colorHex }} />
                      </td>
                      <td>{formatDateRange(event.startDate, event.endDate)}</td>
                      <td
                        className={editing ? 'schedule-note-cell schedule-note-cell--editable' : 'schedule-note-cell'}
                        onClick={() => {
                          if (editing) setActiveNoteId(event.localId);
                        }}
                      >
                        {editing && isActiveNote ? (
                          <textarea
                            className="schedule-inline-note"
                            value={event.displayNote ?? ''}
                            autoFocus
                            onChange={(e) => updateDraftDisplayNote(event.localId, e.target.value)}
                            onBlur={() => setActiveNoteId(null)}
                            placeholder="비워두면 달력 제목이 그대로 표시됩니다."
                          />
                        ) : (
                          <span className={!event.displayNote?.trim() ? 'schedule-click-note' : ''}>{displayText}</span>
                        )}
                      </td>
                      {editing ? (
                        <td>
                          <div className="schedule-row-actions">
                            <button className="ghost-btn" onClick={() => openEditModal(event)}>
                              수정
                            </button>
                            <button className="danger-btn" onClick={() => removeEvent(event.localId)}>
                              삭제
                            </button>
                          </div>
                        </td>
                      ) : null}
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {eventForm ? (
        <div className="modal-backdrop">
          <div className="schedule-event-modal">
            <h3>일정 입력</h3>

            <div className="schedule-event-form-grid">
              <label className="form-field">
                <span>일정 내용</span>
                <input
                  value={eventForm.title}
                  onChange={(e) => setEventForm((current) => (current ? { ...current, title: e.target.value } : current))}
                  placeholder="예: 동아리 활동"
                />
              </label>

              <label className="form-field">
                <span>시작일</span>
                <input
                  type="date"
                  value={eventForm.startDate}
                  onChange={(e) => setEventForm((current) => (current ? { ...current, startDate: e.target.value } : current))}
                />
              </label>

              <label className="form-field">
                <span>끝일</span>
                <input
                  type="date"
                  value={eventForm.endDate}
                  onChange={(e) => setEventForm((current) => (current ? { ...current, endDate: e.target.value } : current))}
                />
              </label>

              <label className="form-field">
                <span>일정 색</span>
                <input
                  type="color"
                  value={eventForm.colorHex}
                  onChange={(e) => setEventForm((current) => (current ? { ...current, colorHex: e.target.value } : current))}
                />
              </label>
            </div>

            <div className="modal-actions">
              <button className="primary-btn" onClick={saveEventForm}>
                저장
              </button>
              <button className="ghost-btn" onClick={() => setEventForm(null)}>
                취소
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

export default SchedulePage;