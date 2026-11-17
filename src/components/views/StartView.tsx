import React, { useState, useMemo } from 'react';
import { useApp } from '../../context/AppContext';
import { Money } from '../../domain/money';
import { Lesson, PaymentMethod } from '../../domain/types';
import { getChargesBalance } from '../../domain/allocation';
import { getWarsawWeekRange } from '../../domain/dateUtils';
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
    paymentAllocations,
    limitStatus,
    todayStr,
    rejectedOperations,
    retryRejectedOperation,
    retryAllRejectedOperations,
    dismissRejectedOperation,
    clearAllRejectedOperations,
    completeAndPayLesson,
    markLessonCompleted,
    recordLessonPayment,
    updateLessonStatus,
    rescheduleLesson
  } = useApp();

  const [selectedLesson, setSelectedLesson] = useState<Lesson | null>(null);
  const [showActionModal, setShowActionModal] = useState(false);
  const [showPayModal, setShowPayModal] = useState(false);
  const [showRejectedModal, setShowRejectedModal] = useState(false);
  const [payMethod, setPayMethod] = useState<PaymentMethod>('blik');
  const [rescheduleDate, setRescheduleDate] = useState('');

  const formattedTodayDate = useMemo(() => {
    const [y, m, d] = todayStr.split('-').map(Number);
    const dateObj = new Date(y, m - 1, d);
    return dateObj.toLocaleDateString('pl-PL', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: 'numeric'
    });
  }, [todayStr]);

  // Lessons today
  const todaysLessons = useMemo(() => {
    return lessons
      .filter(l => l.start_at.slice(0, 10) === todayStr)
      .sort((a, b) => a.start_at.localeCompare(b.start_at));
  }, [lessons, todayStr]);

  // Students having birthday today
  const todaysBirthdays = useMemo(() => {
    const today = new Date();
    const curDay = today.getDate();
    const curMonth = today.getMonth() + 1;
    return students.filter(s => s.birth_day === curDay && s.birth_month === curMonth && s.status === 'active');
  }, [students]);

  // Weekly stats calculated in Europe/Warsaw timezone (PUNKT 1 FIX: no UTC midnight day shifting)
  const weeklyStats = useMemo(() => {
    const { mondayStr: monStr, sundayStr: sunStr } = getWarsawWeekRange(todayStr);

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
  }, [todayStr, lessons, charges, payments, students]);

  const limitBarColor = useMemo(() => {
    switch (limitStatus.alertLevel) {
      case 'critical': return 'var(--ios-red)';
      case 'warn95': return 'var(--ios-red)';
      case 'warn85': return 'var(--ios-amber)';
      case 'warn70': return 'var(--ios-amber)';
      default: return 'var(--ios-green)';
    }
  }, [limitStatus.alertLevel]);

  // Check payment status of each lesson
  const balanceMap = useMemo(() => {
    return getChargesBalance(charges, paymentAllocations);
  }, [charges, paymentAllocations]);

  const handleSwipeCancel = async (lesson: Lesson) => {
    await updateLessonStatus(lesson.id, 'cancelled_student');
  };

  const openActionMenu = (lesson: Lesson) => {
    setSelectedLesson(lesson);
    setRescheduleDate(lesson.start_at.slice(0, 16));
    setShowActionModal(true);
  };

  const openPayDialog = (lesson: Lesson) => {
    setSelectedLesson(lesson);
    setShowPayModal(true);
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

      <NotificationBanner />

      {/* Birthday Celebration Banner */}
      {todaysBirthdays.length > 0 && (
        <div
          style={{
            background: 'linear-gradient(135deg, rgba(175, 82, 222, 0.15), rgba(255, 45, 85, 0.15))',
            border: '1px solid rgba(175, 82, 222, 0.35)',
            borderRadius: 14,
            padding: '12px 14px',
            marginBottom: 16,
            display: 'flex',
            alignItems: 'center',
            gap: 10
          }}
        >
          <span style={{ fontSize: 24 }}>🎂</span>
          <div>
            <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--ios-purple)' }}>
              Urodziny dzisiaj!
            </div>
            <div style={{ fontSize: 12, color: 'var(--ios-text-primary)' }}>
              {todaysBirthdays.map(s => `${s.first_name} ${s.last_name}`).join(', ')} obchodzi dzisiaj urodziny! 🎉
            </div>
          </div>
        </div>
      )}

      {/* Rejected Operations Warning Banner (PUNKT 2 FIX) */}
      {rejectedOperations.length > 0 && (
        <div
          onClick={() => setShowRejectedModal(true)}
          style={{
            background: 'rgba(255, 59, 48, 0.12)',
            border: '1px solid rgba(255, 59, 48, 0.35)',
            borderRadius: 14,
            padding: '12px 14px',
            marginBottom: 16,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ fontSize: 20 }}>⚠️</span>
            <div>
              <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--ios-red)' }}>
                {rejectedOperations.length} {rejectedOperations.length === 1 ? 'odrzucona operacja' : 'odrzucone operacje'} w Arkuszu
              </div>
              <div style={{ fontSize: 12, color: 'var(--ios-text-secondary)' }}>
                Kliknij, aby przejrzeć powód odrzucenia przez Arkusz Google.
              </div>
            </div>
          </div>
          <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--ios-red)' }}>Szczegóły &rarr;</span>
        </div>
      )}

      {/* Section: Today's lessons card list with swipe */}
      <div style={{ marginBottom: 20 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
          <h2 style={{ fontSize: 18, fontWeight: 700 }}>Plan na dziś</h2>
          <span style={{ fontSize: 12, color: 'var(--ios-text-secondary)' }}>Swipe ➔ Zrealizuj</span>
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

            // Check charge and payment status
            const charge = charges.find(c => c.lesson_id === lesson.id && c.amount > 0);
            const b = charge ? balanceMap.get(charge.id) : null;
            const isPaid = b?.status === 'paid';

            return (
              <SwipeableCard
                key={lesson.id}
                rightLabel="Zrealizuj"
                leftLabel="Odwołaj"
                onSwipeRight={() => !isCompleted && openActionMenu(lesson)}
                onSwipeLeft={() => !isCompleted && !isCancelled && handleSwipeCancel(lesson)}
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
                      isPaid
                        ? 'var(--ios-green)'
                        : isCompleted
                        ? 'var(--ios-amber)'
                        : isCancelled
                        ? 'var(--ios-red)'
                        : 'var(--ios-blue)'
                    }`
                  }}
                >
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
                      <span style={{ fontSize: 16, fontWeight: 700 }}>{timeStr}</span>
                      <span style={{ fontSize: 12, color: 'var(--ios-text-secondary)' }}>({lesson.duration_min} min)</span>
                      {isPaid ? (
                        <span className="ios-badge ios-badge-green">Opłacona</span>
                      ) : isCompleted ? (
                        <span className="ios-badge ios-badge-amber">Do zapłaty</span>
                      ) : isCancelled ? (
                        <span className="ios-badge ios-badge-red">Odwołana</span>
                      ) : (
                        <span className="ios-badge ios-badge-blue">Plan</span>
                      )}
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
                          openActionMenu(lesson);
                        }}
                        className="ios-btn ios-btn-primary"
                        style={{ padding: '4px 10px', fontSize: 12, minHeight: 32, marginTop: 4 }}
                      >
                        <IconCheck size={14} /> Zrealizuj
                      </button>
                    )}

                    {isCompleted && !isPaid && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          openPayDialog(lesson);
                        }}
                        className="ios-btn ios-btn-success"
                        style={{ padding: '4px 10px', fontSize: 12, minHeight: 32, marginTop: 4 }}
                      >
                        + Wpłata
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

      {/* Action modal for selected lesson */}
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
              {selectedLesson.status !== 'completed' && (
                <div>
                  <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 8 }}>
                    Wybierz formę płatności za lekcję:
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, marginBottom: 10 }}>
                    <button
                      className="ios-btn ios-btn-success"
                      style={{ padding: '10px 4px', fontSize: 13, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}
                      onClick={async () => {
                        await completeAndPayLesson(selectedLesson.id, 'blik');
                        setShowActionModal(false);
                      }}
                    >
                      <span style={{ fontWeight: 800 }}>BLIK</span>
                      <span style={{ fontSize: 10, opacity: 0.85 }}>Zapłacona</span>
                    </button>
                    <button
                      className="ios-btn ios-btn-primary"
                      style={{ padding: '10px 4px', fontSize: 13, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}
                      onClick={async () => {
                        await completeAndPayLesson(selectedLesson.id, 'przelew');
                        setShowActionModal(false);
                      }}
                    >
                      <span style={{ fontWeight: 800 }}>Przelew</span>
                      <span style={{ fontSize: 10, opacity: 0.85 }}>Zapłacona</span>
                    </button>
                    <button
                      className="ios-btn ios-btn-secondary"
                      style={{ padding: '10px 4px', fontSize: 13, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}
                      onClick={async () => {
                        await completeAndPayLesson(selectedLesson.id, 'gotowka');
                        setShowActionModal(false);
                      }}
                    >
                      <span style={{ fontWeight: 800 }}>Gotówka</span>
                      <span style={{ fontSize: 10, opacity: 0.85 }}>Zapłacona</span>
                    </button>
                  </div>

                  <button
                    className="ios-btn ios-btn-secondary"
                    style={{ width: '100%', fontSize: 13 }}
                    onClick={async () => {
                      await markLessonCompleted(selectedLesson.id);
                      setShowActionModal(false);
                    }}
                  >
                    <IconCheck size={16} /> Zrealizowana (Do zapłaty później)
                  </button>
                </div>
              )}

              {selectedLesson.status === 'completed' && (() => {
                const charge = charges.find(c => c.lesson_id === selectedLesson.id && c.amount > 0);
                const isPaid = charge ? balanceMap.get(charge.id)?.status === 'paid' : false;
                if (isPaid) {
                  return (
                    <div style={{ padding: '10px 12px', borderRadius: 10, background: 'rgba(52,199,89,0.15)', color: 'var(--ios-green)', fontWeight: 700, fontSize: 13, textAlign: 'center' }}>
                      ✓ Lekcja jest w pełni opłacona
                    </div>
                  );
                }
                return (
                  <button
                    className="ios-btn ios-btn-success"
                    onClick={() => {
                      setShowActionModal(false);
                      setShowPayModal(true);
                    }}
                  >
                    <IconCheck size={18} /> Zarejestruj wpłatę
                  </button>
                );
              })()}

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

      {/* Pay modal */}
      {showPayModal && selectedLesson && (
        <div className="ios-modal-overlay" onClick={() => setShowPayModal(false)}>
          <div className="ios-modal-content" onClick={e => e.stopPropagation()}>
            <div className="ios-modal-grabber" />
            <h3 style={{ fontSize: 18, fontWeight: 700, marginBottom: 6 }}>Zarejestruj wpłatę za lekcję</h3>
            <p style={{ fontSize: 13, color: 'var(--ios-text-secondary)', marginBottom: 14 }}>
              Kwota do zapłaty: <strong>{Money.format(selectedLesson.price_snapshot)}</strong>
            </p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div>
                <label style={{ fontSize: 12, fontWeight: 600 }}>Metoda płatności:</label>
                <select
                  className="ios-input"
                  value={payMethod}
                  onChange={e => setPayMethod(e.target.value as PaymentMethod)}
                >
                  <option value="blik">BLIK</option>
                  <option value="gotowka">Gotówka</option>
                  <option value="przelew">Przelew</option>
                  <option value="inna">Inna</option>
                </select>
              </div>

              <button
                className="ios-btn ios-btn-success"
                onClick={async () => {
                  await recordLessonPayment(selectedLesson.id, payMethod);
                  setShowPayModal(false);
                }}
              >
                <IconCheck size={18} /> Zaksięguj wpłatę ({payMethod.toUpperCase()})
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Rejected Operations Modal (PUNKT 2 FIX) */}
      {showRejectedModal && (
        <div className="ios-modal-overlay" onClick={() => setShowRejectedModal(false)}>
          <div className="ios-modal-content" onClick={e => e.stopPropagation()}>
            <div className="ios-modal-grabber" />
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <h3 style={{ fontSize: 18, fontWeight: 700 }}>Odrzucone operacje ({rejectedOperations.length})</h3>
              <button
                onClick={() => setShowRejectedModal(false)}
                className="ios-btn ios-btn-secondary"
                style={{ padding: '4px 8px', fontSize: 12 }}
              >
                Zamknij
              </button>
            </div>

            <p style={{ fontSize: 13, color: 'var(--ios-text-secondary)', marginBottom: 14 }}>
              Operacje, których Google Apps Script nie mógł zapisać w Arkuszu (np. próba zapisu w zamkniętym okresie rozliczeniowym lub konflikt wersji).
            </p>

            <div style={{ maxHeight: 320, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 10 }}>
              {rejectedOperations.map(op => (
                <div
                  key={op.op_id}
                  style={{
                    background: 'var(--ios-bg)',
                    borderRadius: 12,
                    padding: 12,
                    border: '1px solid var(--ios-border)'
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 4 }}>
                    <span style={{ fontSize: 13, fontWeight: 700, textTransform: 'uppercase' }}>
                      {op.action} • {op.table}
                    </span>
                    <div style={{ display: 'flex', gap: 6 }}>
                      <button
                        onClick={async () => {
                          await retryRejectedOperation(op.op_id);
                        }}
                        className="ios-btn ios-btn-primary"
                        style={{ padding: '2px 10px', fontSize: 11, minHeight: 24 }}
                      >
                        Ponów
                      </button>
                      <button
                        onClick={() => dismissRejectedOperation(op.op_id)}
                        className="ios-btn ios-btn-secondary"
                        style={{ padding: '2px 8px', fontSize: 11, minHeight: 24, color: 'var(--ios-red)' }}
                      >
                        Usuń
                      </button>
                    </div>
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--ios-red)', fontWeight: 600, marginBottom: 4 }}>
                    Powód: {op.error || 'Odrzucono przez serwer'}
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--ios-text-secondary)' }}>
                    Czas operacji: {op.timestamp.slice(0, 19).replace('T', ' ')}
                  </div>
                </div>
              ))}
            </div>

            <div style={{ marginTop: 16, display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div style={{ display: 'flex', gap: 8 }}>
                <button
                  className="ios-btn ios-btn-primary"
                  style={{ flex: 1 }}
                  onClick={async () => {
                    await retryAllRejectedOperations();
                    setShowRejectedModal(false);
                  }}
                >
                  Ponów wszystkie ({rejectedOperations.length})
                </button>
                <button
                  className="ios-btn ios-btn-secondary"
                  style={{ flex: 1, color: 'var(--ios-red)' }}
                  onClick={async () => {
                    if (confirm('Czy na pewno chcesz usunąć wszystkie odrzucone operacje z listy?')) {
                      await clearAllRejectedOperations();
                      setShowRejectedModal(false);
                    }
                  }}
                >
                  Wyczyść wszystkie
                </button>
              </div>
              <button
                className="ios-btn ios-btn-secondary"
                style={{ width: '100%' }}
                onClick={() => setShowRejectedModal(false)}
              >
                Zamknij
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
