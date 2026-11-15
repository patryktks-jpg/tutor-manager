import React, { useState, useMemo } from 'react';
import { useApp } from '../../context/AppContext';
import { Money } from '../../domain/money';
import { Lesson, PaymentMethod } from '../../domain/types';
import { SwipeableCard } from '../common/SwipeableCard';
import { NotificationBanner } from '../common/NotificationBanner';
import { IconGear, IconCheck, IconX, IconCalendar, IconStudents } from '../common/Icons';

interface StartViewProps {
  onOpenSettings: () => void;
  onOpenCalendar: () => void;
  onOpenStudents: () => void;
}

export const StartView: React.FC<StartViewProps> = ({ onOpenSettings, onOpenCalendar }) => {
  const {
    lessons,
    students,
    charges,
    payments,
    limitStatus,
    quickCompleteLessonAndPay,
    updateLessonStatus,
    rescheduleLesson
  } = useApp();

  const [selectedLesson, setSelectedLesson] = useState<Lesson | null>(null);
  const [showActionModal, setShowActionModal] = useState(false);
  const [rescheduleDate, setRescheduleDate] = useState('');

  // Format today's date in Polish
  const today = useMemo(() => new Date(), []);
  const todayStr = useMemo(() => {
    return `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
  }, [today]);

  const formattedTodayDate = useMemo(() => {
    return today.toLocaleDateString('pl-PL', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: 'numeric'
    });
  }, [today]);

  // Lessons today
  const todaysLessons = useMemo(() => {
    return lessons
      .filter(l => l.start_at.slice(0, 10) === todayStr)
      .sort((a, b) => a.start_at.localeCompare(b.start_at));
  }, [lessons, todayStr]);

  // Weekly stats
  const weeklyStats = useMemo(() => {
    // Current week Monday to Sunday
    const d = new Date(today);
    const day = d.getDay();
    const diff = d.getDate() - day + (day === 0 ? -6 : 1);
    const monday = new Date(d.setDate(diff));
    monday.setHours(0, 0, 0, 0);
    const sunday = new Date(monday);
    sunday.setDate(monday.getDate() + 6);
    sunday.setHours(23, 59, 59, 999);

    const monStr = monday.toISOString().slice(0, 10);
    const sunStr = sunday.toISOString().slice(0, 10);

    const weekLessons = lessons.filter(l => {
      const lDate = l.start_at.slice(0, 10);
      return lDate >= monStr && lDate <= sunStr;
    });

    let hoursPlanned = 0;
    let hoursCompleted = 0;
    let hoursCancelled = 0;

    for (const l of weekLessons) {
      if (l.status === 'completed') hoursCompleted += l.duration_min;
      else if (l.status.startsWith('cancelled') || l.status === 'no_show') hoursCancelled += l.duration_min;
      else hoursPlanned += l.duration_min;
    }

    const weekCharges = charges.filter(c => c.accrual_date >= monStr && c.accrual_date <= sunStr);
    const weekPayments = payments.filter(p => p.received_date >= monStr && p.received_date <= sunStr);

    const accruedGrosze = weekCharges.reduce((sum, c) => sum + c.amount, 0);
    const receivedGrosze = weekPayments.reduce((sum, p) => p.payment_type === 'wplata' ? sum + p.amount : sum - p.amount, 0);

    return {
      hoursPlanned: Math.round(hoursPlanned / 60 * 10) / 10,
      hoursCompleted: Math.round(hoursCompleted / 60 * 10) / 10,
      hoursCancelled: Math.round(hoursCancelled / 60 * 10) / 10,
      accruedGrosze,
      receivedGrosze,
      toPayGrosze: Math.max(0, accruedGrosze - receivedGrosze),
      activeStudentsCount: students.filter(s => s.status === 'active').length
    };
  }, [today, lessons, charges, payments, students]);

  // Limit progress bar color
  const limitBarColor = useMemo(() => {
    switch (limitStatus.alertLevel) {
      case 'critical': return 'var(--ios-red)';
      case 'warn95': return 'var(--ios-red)';
      case 'warn85': return 'var(--ios-amber)';
      case 'warn70': return 'var(--ios-amber)';
      default: return 'var(--ios-green)';
    }
  }, [limitStatus.alertLevel]);

  const handleQuickPay = async (lesson: Lesson, method: PaymentMethod = 'blik') => {
    await quickCompleteLessonAndPay(lesson.id, method);
  };

  const handleCancel = async (lesson: Lesson) => {
    await updateLessonStatus(lesson.id, 'cancelled_student');
  };

  const openActionMenu = (lesson: Lesson) => {
    setSelectedLesson(lesson);
    setRescheduleDate(lesson.start_at.slice(0, 16));
    setShowActionModal(true);
  };

  return (
    <div style={{ padding: '16px 16px 8px 16px', maxWidth: 600, margin: '0 auto' }}>
      {/* Top Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
        <div>
          <span style={{ fontSize: 13, textTransform: 'capitalize', color: 'var(--ios-text-secondary)', fontWeight: 600 }}>
            {formattedTodayDate}
          </span>
          <h1 style={{ fontSize: 26, fontWeight: 800, letterSpacing: -0.5 }}>
            Dziś: {todaysLessons.length} {todaysLessons.length === 1 ? 'lekcja' : 'lekcje'}
          </h1>
        </div>
        <button
          onClick={onOpenSettings}
          aria-label="Ustawienia"
          style={{
            background: 'var(--ios-card-bg)',
            border: '1px solid var(--ios-border)',
            borderRadius: 22,
            width: 44,
            height: 44,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer',
            color: 'var(--ios-text-primary)'
          }}
        >
          <IconGear size={22} />
        </button>
      </div>

      {/* Notifications / Alerts banner */}
      <NotificationBanner />

      {/* Section: Today's lessons card list with swipe */}
      <div style={{ marginBottom: 20 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
          <h2 style={{ fontSize: 18, fontWeight: 700 }}>Plan na dziś</h2>
          <span style={{ fontSize: 12, color: 'var(--ios-text-secondary)' }}>Swipe ➔ Zrealizuj + BLIK</span>
        </div>

        {todaysLessons.length === 0 ? (
          <div className="ios-card" style={{ textAlign: 'center', padding: '24px 16px' }}>
            <IconCalendar size={36} color="var(--ios-text-secondary)" style={{ margin: '0 auto 8px auto' }} />
            <div style={{ fontWeight: 600, marginBottom: 4 }}>Brak zaplanowanych lekcji na dziś</div>
            <div style={{ fontSize: 13, color: 'var(--ios-text-secondary)' }}>Odpocznij lub zaplanuj termin w grafiku.</div>
          </div>
        ) : (
          todaysLessons.map(lesson => {
            const student = students.find(s => s.id === lesson.student_id);
            const isCompleted = lesson.status === 'completed';
            const isCancelled = lesson.status.startsWith('cancelled');
            const timeStr = lesson.start_at.slice(11, 16);

            return (
              <SwipeableCard
                key={lesson.id}
                onSwipeRight={() => !isCompleted && handleQuickPay(lesson, 'blik')}
                onSwipeLeft={() => !isCompleted && !isCancelled && handleCancel(lesson)}
              >
                <div
                  className="ios-card"
                  onClick={() => openActionMenu(lesson)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    cursor: 'pointer',
                    marginBottom: 0,
                    opacity: isCancelled ? 0.6 : 1,
                    borderLeft: `4px solid ${
                      isCompleted ? 'var(--ios-green)' : isCancelled ? 'var(--ios-red)' : 'var(--ios-blue)'
                    }`
                  }}
                >
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
                      <span style={{ fontSize: 16, fontWeight: 700 }}>{timeStr}</span>
                      <span style={{ fontSize: 12, color: 'var(--ios-text-secondary)' }}>({lesson.duration_min} min)</span>
                      {isCompleted && <span className="ios-badge ios-badge-green">Opłacono</span>}
                      {isCancelled && <span className="ios-badge ios-badge-red">Odwołana</span>}
                    </div>
                    <div style={{ fontSize: 16, fontWeight: 600 }}>
                      {student ? `${student.first_name} ${student.last_name}` : 'Uczeń'}
                    </div>
                    <div style={{ fontSize: 13, color: 'var(--ios-text-secondary)' }}>
                      {lesson.subject} • {lesson.location === 'online' ? 'Online' : 'Stacjonarnie'}
                    </div>
                  </div>

                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontSize: 17, fontWeight: 700 }}>
                      {Money.format(lesson.price_snapshot)}
                    </div>
                    {!isCompleted && !isCancelled && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleQuickPay(lesson, 'blik');
                        }}
                        className="ios-btn ios-btn-success"
                        style={{ padding: '4px 10px', fontSize: 12, minHeight: 32, marginTop: 4 }}
                      >
                        <IconCheck size={14} /> BLIK
                      </button>
                    )}
                  </div>
                </div>
              </SwipeableCard>
            );
          })
        )}
      </div>

      {/* Section: Quarterly Limit Card */}
      <div className="ios-card" style={{ marginBottom: 20 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
          <div>
            <div style={{ fontSize: 12, textTransform: 'uppercase', color: 'var(--ios-text-secondary)', fontWeight: 700 }}>
              Limit działalności nierejestrowanej (Q{limitStatus.quarter.quarter} {limitStatus.quarter.year})
            </div>
            <div style={{ fontSize: 24, fontWeight: 800, letterSpacing: -0.5, marginTop: 2 }}>
              {Money.format(limitStatus.usedGrosze)}
              <span style={{ fontSize: 15, fontWeight: 500, color: 'var(--ios-text-secondary)' }}>
                {' '}/ {Money.format(limitStatus.limitGrosze)}
              </span>
            </div>
          </div>
          <span
            className="ios-badge"
            style={{
              backgroundColor: limitBarColor,
              color: '#FFFFFF'
            }}
          >
            {limitStatus.usedPercentage}%
          </span>
        </div>

        {/* Progress bar */}
        <div
          style={{
            width: '100%',
            height: 12,
            backgroundColor: 'var(--ios-system-bg)',
            borderRadius: 6,
            overflow: 'hidden',
            marginBottom: 10
          }}
        >
          <div
            style={{
              width: `${Math.min(100, limitStatus.usedPercentage)}%`,
              height: '100%',
              backgroundColor: limitBarColor,
              borderRadius: 6,
              transition: 'width 0.4s ease'
            }}
          />
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, color: 'var(--ios-text-secondary)' }}>
          <div>
            Pozostało do limitu: <strong style={{ color: 'var(--ios-text-primary)' }}>{Money.format(limitStatus.remainingGrosze)}</strong>
          </div>
          <div>
            Prognoza z grafiku: <strong style={{ color: 'var(--ios-text-primary)' }}>{limitStatus.forecastPercentage}%</strong>
          </div>
        </div>
      </div>

      {/* Section: Weekly Tiles */}
      <div style={{ marginBottom: 20 }}>
        <h2 style={{ fontSize: 18, fontWeight: 700, marginBottom: 10 }}>Podsumowanie tygodnia</h2>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <div className="ios-card" style={{ marginBottom: 0, padding: 12 }}>
            <div style={{ fontSize: 12, color: 'var(--ios-text-secondary)', marginBottom: 4 }}>Godziny lekcji</div>
            <div style={{ fontSize: 20, fontWeight: 800 }}>{weeklyStats.hoursCompleted} h</div>
            <div style={{ fontSize: 12, color: 'var(--ios-text-secondary)', marginTop: 2 }}>
              Zaplanowane: {weeklyStats.hoursPlanned} h
            </div>
          </div>

          <div className="ios-card" style={{ marginBottom: 0, padding: 12 }}>
            <div style={{ fontSize: 12, color: 'var(--ios-text-secondary)', marginBottom: 4 }}>Przychód otrzymany</div>
            <div style={{ fontSize: 20, fontWeight: 800, color: 'var(--ios-green)' }}>
              {Money.format(weeklyStats.receivedGrosze)}
            </div>
            <div style={{ fontSize: 12, color: 'var(--ios-text-secondary)', marginTop: 2 }}>
              Należny: {Money.format(weeklyStats.accruedGrosze)}
            </div>
          </div>

          <div className="ios-card" style={{ marginBottom: 0, padding: 12 }}>
            <div style={{ fontSize: 12, color: 'var(--ios-text-secondary)', marginBottom: 4 }}>Zaległości do zapłaty</div>
            <div style={{ fontSize: 20, fontWeight: 800, color: weeklyStats.toPayGrosze > 0 ? 'var(--ios-red)' : 'var(--ios-text-primary)' }}>
              {Money.format(weeklyStats.toPayGrosze)}
            </div>
          </div>

          <div className="ios-card" style={{ marginBottom: 0, padding: 12, cursor: 'pointer' }} onClick={onOpenCalendar}>
            <div style={{ fontSize: 12, color: 'var(--ios-text-secondary)', marginBottom: 4 }}>Aktywni uczniowie</div>
            <div style={{ fontSize: 20, fontWeight: 800, display: 'flex', alignItems: 'center', gap: 6 }}>
              <IconStudents size={20} color="var(--ios-blue)" />
              {weeklyStats.activeStudentsCount}
            </div>
          </div>
        </div>
      </div>

      {/* Monthly visual trend comparison (SVG bar chart) */}
      <div className="ios-card" style={{ marginBottom: 20 }}>
        <h3 style={{ fontSize: 15, fontWeight: 700, marginBottom: 12 }}>Trendy przychodów (Październik vs Listopad 2026)</h3>
        <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-around', height: 110, paddingTop: 10 }}>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 11, fontWeight: 600, marginBottom: 4 }}>7 200 zł</div>
            <div style={{ width: 48, height: 70, backgroundColor: 'var(--ios-text-tertiary)', borderRadius: 6, margin: '0 auto' }} />
            <div style={{ fontSize: 12, color: 'var(--ios-text-secondary)', marginTop: 6 }}>Październik</div>
          </div>

          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--ios-blue)', marginBottom: 4 }}>
              {Money.format(limitStatus.usedGrosze - 720000)}
            </div>
            <div
              style={{
                width: 48,
                height: Math.max(20, Math.min(85, Math.round(((limitStatus.usedGrosze - 720000) / 720000) * 70))),
                backgroundColor: 'var(--ios-blue)',
                borderRadius: 6,
                margin: '0 auto'
              }}
            />
            <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--ios-blue)', marginTop: 6 }}>Listopad</div>
          </div>
        </div>
      </div>

      {/* Action modal for selected lesson (Reschedule, No-show, etc.) */}
      {showActionModal && selectedLesson && (
        <div className="ios-modal-overlay" onClick={() => setShowActionModal(false)}>
          <div className="ios-modal-content" onClick={e => e.stopPropagation()}>
            <div className="ios-modal-grabber" />
            <h3 style={{ fontSize: 18, fontWeight: 700, marginBottom: 4 }}>
              Zarządzaj lekcją
            </h3>
            <p style={{ fontSize: 14, color: 'var(--ios-text-secondary)', marginBottom: 16 }}>
              {selectedLesson.subject} • {selectedLesson.start_at.slice(11, 16)} ({Money.format(selectedLesson.price_snapshot)})
            </p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <button
                className="ios-btn ios-btn-success"
                onClick={async () => {
                  await handleQuickPay(selectedLesson, 'blik');
                  setShowActionModal(false);
                }}
              >
                <IconCheck size={18} /> Zrealizowana + Opłacona BLIK
              </button>

              <button
                className="ios-btn ios-btn-secondary"
                onClick={async () => {
                  await handleQuickPay(selectedLesson, 'gotowka');
                  setShowActionModal(false);
                }}
              >
                <IconCheck size={18} /> Zrealizowana + Gotówka
              </button>

              <button
                className="ios-btn ios-btn-danger"
                onClick={async () => {
                  await updateLessonStatus(selectedLesson.id, 'no_show', 'Nieobecność ucznia');
                  setShowActionModal(false);
                }}
              >
                <IconX size={18} /> Nieobecność ucznia (100% odpłatne)
              </button>

              <div style={{ marginTop: 10, paddingTop: 10, borderTop: '1px solid var(--ios-separator)' }}>
                <label style={{ fontSize: 13, fontWeight: 600, display: 'block', marginBottom: 6 }}>
                  Przesuń termin lekcji:
                </label>
                <div style={{ display: 'flex', gap: 8 }}>
                  <input
                    type="datetime-local"
                    className="ios-input"
                    value={rescheduleDate}
                    onChange={e => setRescheduleDate(e.target.value)}
                  />
                  <button
                    className="ios-btn ios-btn-primary"
                    onClick={async () => {
                      if (rescheduleDate) {
                        await rescheduleLesson(selectedLesson.id, `${rescheduleDate}:00`);
                        setShowActionModal(false);
                      }
                    }}
                  >
                    Przesuń
                  </button>
                </div>
              </div>

              <button
                className="ios-btn"
                style={{ backgroundColor: 'transparent', color: 'var(--ios-text-secondary)', marginTop: 8 }}
                onClick={() => setShowActionModal(false)}
              >
                Anuluj
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
