import React, { useState, useMemo } from 'react';
import { useApp } from '../../context/AppContext';
import { Money } from '../../domain/money';
import { Lesson, UUID } from '../../domain/types';
import { findLessonConflicts } from '../../domain/series';
import { getWarsawDateStr } from '../../domain/dateUtils';
import { IconAlertTriangle, IconCheck, IconPlus, IconX } from '../common/Icons';

export const CalendarView: React.FC = () => {
  const {
    lessons,
    students,
    todayStr,
    createLesson,
    updateLessonStatus,
    rescheduleLesson,
    syncLessonCalendar
  } = useApp();
  const [viewMode, setViewMode] = useState<'day' | 'week' | 'month'>('week');

  // Selected date reference
  const [currentDate, setCurrentDate] = useState(() => new Date());
  const [selectedLesson, setSelectedLesson] = useState<Lesson | null>(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [showRescheduleModal, setShowRescheduleModal] = useState(false);
  const [newRescheduleTime, setNewRescheduleTime] = useState('');

  // New lesson form state
  const [newStudentId, setNewStudentId] = useState<UUID>(students[0]?.id || '');
  const [newDate, setNewDate] = useState(() => getWarsawDateStr());
  const [newTime, setNewTime] = useState('16:00');
  const [newDuration, setNewDuration] = useState(60);
  const [newSubject, setNewSubject] = useState('Matematyka');

  const formattedHeader = useMemo(() => {
    return currentDate.toLocaleDateString('pl-PL', { month: 'long', year: 'numeric' });
  }, [currentDate]);

  // Generate days for week view (Monday to Sunday)
  const weekDays = useMemo(() => {
    const d = new Date(currentDate);
    const day = d.getDay();
    const diff = d.getDate() - day + (day === 0 ? -6 : 1);
    const monday = new Date(d.setDate(diff));

    const days: Date[] = [];
    for (let i = 0; i < 7; i++) {
      const dayDate = new Date(monday);
      dayDate.setDate(monday.getDate() + i);
      days.push(dayDate);
    }
    return days;
  }, [currentDate]);

  const changeWeek = (offset: number) => {
    const next = new Date(currentDate);
    next.setDate(next.getDate() + offset * 7);
    setCurrentDate(next);
  };

  const openSlotToAdd = (dateStr: string, timeStr = '16:00') => {
    setNewDate(dateStr);
    setNewTime(timeStr);
    setShowAddModal(true);
  };

  const handleCreateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const student = students.find(s => s.id === newStudentId);
    const created = await createLesson({
      student_id: newStudentId,
      start_at: `${newDate}T${newTime}:00`,
      duration_min: Number(newDuration),
      subject: newSubject,
      price_snapshot: student?.default_rate || 7000,
      status: 'planned'
    });
    // Opcjonalnie zsynchronizuj z Kalendarzem Google jeśli skonfigurowano
    try {
      syncLessonCalendar(created, student ? `${student.first_name} ${student.last_name}` : undefined);
    } catch (err) {}
    setShowAddModal(false);
  };

  return (
    <div style={{ padding: '16px 16px 8px 16px', maxWidth: 640, margin: '0 auto' }}>
      {/* Calendar Header with View Switcher */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
        <div>
          <h1 style={{ fontSize: 24, fontWeight: 800, textTransform: 'capitalize' }}>Grafik</h1>
          <span style={{ fontSize: 14, color: 'var(--ios-text-secondary)', textTransform: 'capitalize' }}>
            {formattedHeader}
          </span>
        </div>

        {/* View Switcher: Dzień / Tydzień / Miesiąc */}
        <div
          style={{
            display: 'flex',
            backgroundColor: 'var(--ios-border)',
            padding: 2,
            borderRadius: 8
          }}
        >
          {(['day', 'week', 'month'] as const).map(mode => (
            <button
              key={mode}
              onClick={() => setViewMode(mode)}
              style={{
                border: 'none',
                padding: '6px 12px',
                borderRadius: 6,
                fontSize: 12,
                fontWeight: 600,
                cursor: 'pointer',
                backgroundColor: viewMode === mode ? 'var(--ios-card-bg)' : 'transparent',
                color: viewMode === mode ? 'var(--ios-text-primary)' : 'var(--ios-text-secondary)',
                boxShadow: viewMode === mode ? '0 1px 2px rgba(0,0,0,0.1)' : 'none'
              }}
            >
              {mode === 'day' ? 'Dzień' : mode === 'week' ? 'Tydzień' : 'Miesiąc'}
            </button>
          ))}
        </div>
      </div>

      {/* Week Navigation controls */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
        <button
          onClick={() => changeWeek(-1)}
          className="ios-btn ios-btn-secondary"
          style={{ padding: '6px 12px', fontSize: 13, minHeight: 32 }}
        >
          Poprzedni
        </button>

        <button
          onClick={() => setCurrentDate(new Date())}
          className="ios-btn ios-btn-secondary"
          style={{ padding: '6px 12px', fontSize: 13, minHeight: 32 }}
        >
          Dziś
        </button>

        <button
          onClick={() => changeWeek(1)}
          className="ios-btn ios-btn-secondary"
          style={{ padding: '6px 12px', fontSize: 13, minHeight: 32 }}
        >
          Następny
        </button>
      </div>

      {/* Week View Grid */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {weekDays.map(dayDate => {
          const dayDateStr = getWarsawDateStr(dayDate);
          const isToday = dayDateStr === todayStr;

          const dayLessons = lessons
            .filter(l => l.start_at.slice(0, 10) === dayDateStr)
            .sort((a, b) => a.start_at.localeCompare(b.start_at));

          const dayName = dayDate.toLocaleDateString('pl-PL', { weekday: 'short', day: 'numeric' });

          return (
            <div
              key={dayDateStr}
              style={{
                backgroundColor: 'var(--ios-card-bg)',
                borderRadius: 12,
                padding: '10px 14px',
                border: isToday ? '2px solid var(--ios-blue)' : '1px solid var(--ios-border)'
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                <span style={{ fontWeight: 700, fontSize: 14, textTransform: 'capitalize', color: isToday ? 'var(--ios-blue)' : 'inherit' }}>
                  {dayName} {isToday && '• DZIŚ'}
                </span>
                <button
                  onClick={() => openSlotToAdd(dayDateStr)}
                  style={{
                    background: 'none',
                    border: 'none',
                    color: 'var(--ios-blue)',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 4,
                    fontSize: 12,
                    fontWeight: 600
                  }}
                >
                  <IconPlus size={16} /> Dodaj
                </button>
              </div>

              {dayLessons.length === 0 ? (
                <div
                  onClick={() => openSlotToAdd(dayDateStr)}
                  style={{
                    fontSize: 12,
                    color: 'var(--ios-text-secondary)',
                    padding: '8px 0',
                    cursor: 'pointer',
                    fontStyle: 'italic'
                  }}
                >
                  Brak lekcji (stuknij, aby zaplanować)
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {dayLessons.map(l => {
                    const student = students.find(s => s.id === l.student_id);
                    const conflicts = findLessonConflicts(l, lessons);
                    const hasConflict = conflicts.hasConflict;

                    return (
                      <div
                        key={l.id}
                        onClick={() => {
                          setSelectedLesson(l);
                          setNewRescheduleTime(l.start_at.slice(0, 16));
                          setShowRescheduleModal(true);
                        }}
                        style={{
                          backgroundColor: hasConflict ? 'rgba(255, 59, 48, 0.12)' : 'var(--ios-system-bg)',
                          border: hasConflict ? '1.5px solid var(--ios-red)' : '1px solid var(--ios-border)',
                          borderRadius: 8,
                          padding: '8px 12px',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          cursor: 'pointer'
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          {hasConflict && <IconAlertTriangle size={18} color="var(--ios-red)" />}
                          <div>
                            <div style={{ fontSize: 14, fontWeight: 700 }}>
                              {l.start_at.slice(11, 16)} • {student ? `${student.first_name} ${student.last_name}` : 'Uczeń'}
                            </div>
                            <div style={{ fontSize: 12, color: 'var(--ios-text-secondary)' }}>
                              {l.subject} ({l.duration_min} min)
                            </div>
                          </div>
                        </div>

                        <div style={{ textAlign: 'right' }}>
                          <span style={{ fontSize: 13, fontWeight: 600 }}>{Money.format(l.price_snapshot)}</span>
                          <div>
                            <span
                              className={`ios-badge ${
                                l.status === 'completed'
                                  ? 'ios-badge-green'
                                  : l.status.startsWith('cancelled')
                                  ? 'ios-badge-red'
                                  : 'ios-badge-blue'
                              }`}
                              style={{ fontSize: 10, padding: '2px 6px' }}
                            >
                              {l.status === 'completed' ? 'Odbyta' : l.status.startsWith('cancelled') ? 'Odwołana' : 'Plan'}
                            </span>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Add Lesson Modal */}
      {showAddModal && (
        <div className="ios-modal-overlay" onClick={() => setShowAddModal(false)}>
          <div className="ios-modal-content" onClick={e => e.stopPropagation()}>
            <div className="ios-modal-grabber" />
            <h3 style={{ fontSize: 18, fontWeight: 700, marginBottom: 12 }}>Zaplanuj nową lekcję</h3>
            <form onSubmit={handleCreateSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div>
                <label style={{ fontSize: 13, fontWeight: 600, display: 'block', marginBottom: 4 }}>Uczeń</label>
                <select
                  className="ios-input"
                  value={newStudentId}
                  onChange={e => {
                    setNewStudentId(e.target.value);
                    const s = students.find(st => st.id === e.target.value);
                    if (s) setNewSubject(s.subject);
                  }}
                  required
                >
                  {students.map(s => (
                    <option key={s.id} value={s.id}>
                      {s.first_name} {s.last_name} ({Money.format(s.default_rate)})
                    </option>
                  ))}
                </select>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <div>
                  <label style={{ fontSize: 13, fontWeight: 600, display: 'block', marginBottom: 4 }}>Data</label>
                  <input
                    type="date"
                    className="ios-input"
                    value={newDate}
                    onChange={e => setNewDate(e.target.value)}
                    required
                  />
                </div>
                <div>
                  <label style={{ fontSize: 13, fontWeight: 600, display: 'block', marginBottom: 4 }}>Godzina</label>
                  <input
                    type="time"
                    className="ios-input"
                    value={newTime}
                    onChange={e => setNewTime(e.target.value)}
                    required
                  />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <div>
                  <label style={{ fontSize: 13, fontWeight: 600, display: 'block', marginBottom: 4 }}>Czas trwania</label>
                  <select
                    className="ios-input"
                    value={newDuration}
                    onChange={e => setNewDuration(Number(e.target.value))}
                  >
                    <option value={45}>45 min</option>
                    <option value={60}>60 min</option>
                    <option value={90}>90 min</option>
                    <option value={120}>120 min</option>
                  </select>
                </div>
                <div>
                  <label style={{ fontSize: 13, fontWeight: 600, display: 'block', marginBottom: 4 }}>Przedmiot</label>
                  <input
                    type="text"
                    className="ios-input"
                    value={newSubject}
                    onChange={e => setNewSubject(e.target.value)}
                  />
                </div>
              </div>

              <button type="submit" className="ios-btn ios-btn-primary" style={{ marginTop: 8 }}>
                Zapisz w grafiku
              </button>
            </form>
          </div>
        </div>
      )}

      {/* Reschedule / Manage Lesson Modal */}
      {showRescheduleModal && selectedLesson && (
        <div className="ios-modal-overlay" onClick={() => setShowRescheduleModal(false)}>
          <div className="ios-modal-content" onClick={e => e.stopPropagation()}>
            <div className="ios-modal-grabber" />
            <h3 style={{ fontSize: 18, fontWeight: 700, marginBottom: 8 }}>Edycja terminu lekcji</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div>
                <label style={{ fontSize: 13, fontWeight: 600, display: 'block', marginBottom: 4 }}>
                  Nowa data i godzina rozpoczęcia:
                </label>
                <input
                  type="datetime-local"
                  className="ios-input"
                  value={newRescheduleTime}
                  onChange={e => setNewRescheduleTime(e.target.value)}
                />
              </div>

              <button
                className="ios-btn ios-btn-primary"
                onClick={async () => {
                  if (newRescheduleTime) {
                    await rescheduleLesson(selectedLesson.id, `${newRescheduleTime}:00`);
                    setShowRescheduleModal(false);
                  }
                }}
              >
                Zatwierdź przesunięcie (zapisz w historii)
              </button>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginTop: 4 }}>
                <button
                  className="ios-btn ios-btn-success"
                  onClick={async () => {
                    await updateLessonStatus(selectedLesson.id, 'completed');
                    setShowRescheduleModal(false);
                  }}
                >
                  <IconCheck size={16} /> Oznacz jako odbytą
                </button>
                <button
                  className="ios-btn ios-btn-danger"
                  onClick={async () => {
                    await updateLessonStatus(selectedLesson.id, 'cancelled_student');
                    setShowRescheduleModal(false);
                  }}
                >
                  <IconX size={16} /> Odwołaj
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
