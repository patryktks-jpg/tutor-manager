import React, { useState } from 'react';
import { useApp } from '../../context/AppContext';
import { Money } from '../../domain/money';
import { Period } from '../../domain/types';
import { MonthlyReportData, buildMonthlyReport } from '../../domain/periods';
import { IconCheck, IconLock } from '../common/Icons';

export const ReportsView: React.FC = () => {
  const {
    periods,
    reportSnapshots,
    lessons,
    charges,
    payments,
    paymentAllocations,
    students,
    limitStatus,
    closePeriod,
    reopenPeriodCorrection,
    offlineQueueCount
  } = useApp();

  const [selectedPeriod, setSelectedPeriod] = useState<Period | null>(periods[0] || null);
  const [showCorrectionModal, setShowCorrectionModal] = useState(false);
  const [correctionReason, setCorrectionReason] = useState('');

  // Active or latest snapshot for period
  const activeSnapshot = selectedPeriod
    ? reportSnapshots
        .filter(s => s.period_id === selectedPeriod.id)
        .sort((a, b) => b.version_num - a.version_num)[0]
    : null;

  // Report data: either from stored snapshot (immutable) or computed live if period is still open
  const reportData: MonthlyReportData | null = React.useMemo(() => {
    if (!selectedPeriod) return null;
    if (activeSnapshot) {
      try {
        return JSON.parse(activeSnapshot.data_json);
      } catch (e) {
        console.error(e);
      }
    }
    return buildMonthlyReport(
      selectedPeriod,
      lessons,
      charges,
      payments,
      paymentAllocations,
      students,
      limitStatus.limitGrosze,
      limitStatus.usedGrosze
    );
  }, [selectedPeriod, activeSnapshot, lessons, charges, payments, paymentAllocations, students, limitStatus]);

  const handleClosePeriod = async (periodId: string) => {
    if (offlineQueueCount > 0) {
      alert('Nie można zamknąć miesiąca przy niepustej kolejce offline! Zsynchronizuj zmiany z Arkuszem Google.');
      return;
    }
    if (confirm('Czy na pewno chcesz zamknąć ten okres? Zapisy zostaną zablokowane i utworzony zostanie nienaruszalny raport v1.')) {
      try {
        await closePeriod(periodId);
        alert('Okres został pomyślnie zamknięty.');
      } catch (err: any) {
        alert(err.message);
      }
    }
  };

  const handleCorrectionSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedPeriod || !correctionReason.trim()) return;

    await reopenPeriodCorrection(selectedPeriod.id, correctionReason);
    setShowCorrectionModal(false);
    setCorrectionReason('');
    alert('Utworzono nową wersję korekty raportu.');
  };

  const handlePrint = () => {
    window.print();
  };

  return (
    <div style={{ padding: '16px 16px 8px 16px', maxWidth: 640, margin: '0 auto' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
        <div>
          <h1 style={{ fontSize: 24, fontWeight: 800 }}>Raporty</h1>
          <span style={{ fontSize: 13, color: 'var(--ios-text-secondary)' }}>
            Zamknięcia okresów, zestawienia i PIT
          </span>
        </div>
        <button
          onClick={handlePrint}
          className="ios-btn ios-btn-secondary"
          style={{ padding: '8px 12px', fontSize: 12, minHeight: 34 }}
        >
          Drukuj / PDF
        </button>
      </div>

      {/* Period Selector Pills */}
      <div style={{ display: 'flex', gap: 8, overflowX: 'auto', paddingBottom: 6, marginBottom: 14 }}>
        {periods.map(p => {
          const isSelected = selectedPeriod?.id === p.id;
          const isClosed = p.status === 'closed';

          return (
            <button
              key={p.id}
              onClick={() => setSelectedPeriod(p)}
              className={`ios-btn ${isSelected ? 'ios-btn-primary' : 'ios-btn-secondary'}`}
              style={{
                padding: '6px 14px',
                fontSize: 13,
                minHeight: 34,
                whiteSpace: 'nowrap',
                display: 'flex',
                alignItems: 'center',
                gap: 6
              }}
            >
              {isClosed ? <IconLock size={14} /> : null}
              <span>{p.date_from.slice(0, 7)}</span>
              <span
                style={{
                  fontSize: 10,
                  opacity: 0.8,
                  backgroundColor: isClosed ? 'rgba(0,0,0,0.2)' : 'transparent',
                  padding: '2px 4px',
                  borderRadius: 4
                }}
              >
                {isClosed ? 'Zamknięty' : 'Otwarty'}
              </span>
            </button>
          );
        })}
      </div>

      {/* Report Sheet View */}
      {selectedPeriod && reportData && (
        <div className="ios-card" style={{ padding: 18, marginBottom: 16 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
            <div>
              <span className="ios-badge ios-badge-blue" style={{ marginBottom: 6 }}>
                Raport Miesięczny: {reportData.periodLabel}
              </span>
              <h2 style={{ fontSize: 20, fontWeight: 800, marginTop: 4 }}>
                Zestawienie działalności
              </h2>
              <div style={{ fontSize: 12, color: 'var(--ios-text-secondary)' }}>
                Od {selectedPeriod.date_from} do {selectedPeriod.date_to}
              </div>
            </div>

            <div style={{ textAlign: 'right' }}>
              <span
                className={`ios-badge ${selectedPeriod.status === 'closed' ? 'ios-badge-green' : 'ios-badge-amber'}`}
              >
                {selectedPeriod.status === 'closed' ? `Wersja v${activeSnapshot?.version_num || 1}` : 'Roboczy'}
              </span>
              {activeSnapshot?.correction_reason && (
                <div style={{ fontSize: 11, color: 'var(--ios-amber)', marginTop: 4 }}>
                  Korekta: {activeSnapshot.correction_reason}
                </div>
              )}
            </div>
          </div>

          {/* Key Metrics Grid */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 16 }}>
            <div style={{ backgroundColor: 'var(--ios-system-bg)', padding: 10, borderRadius: 10 }}>
              <div style={{ fontSize: 11, color: 'var(--ios-text-secondary)' }}>Przychód należny (limit)</div>
              <div style={{ fontSize: 18, fontWeight: 800 }}>{Money.format(reportData.accruedRevenueGrosze)}</div>
            </div>

            <div style={{ backgroundColor: 'var(--ios-system-bg)', padding: 10, borderRadius: 10 }}>
              <div style={{ fontSize: 11, color: 'var(--ios-text-secondary)' }}>Przychód otrzymany (PIT-36)</div>
              <div style={{ fontSize: 18, fontWeight: 800, color: 'var(--ios-green)' }}>
                {Money.format(reportData.receivedRevenueGrosze)}
              </div>
            </div>

            <div style={{ backgroundColor: 'var(--ios-system-bg)', padding: 10, borderRadius: 10 }}>
              <div style={{ fontSize: 11, color: 'var(--ios-text-secondary)' }}>Godziny zrealizowane</div>
              <div style={{ fontSize: 18, fontWeight: 800 }}>{reportData.hoursCompleted} h</div>
              <div style={{ fontSize: 11, color: 'var(--ios-text-secondary)' }}>
                ({reportData.lessonsCompletedCount} lekcji)
              </div>
            </div>

            <div style={{ backgroundColor: 'var(--ios-system-bg)', padding: 10, borderRadius: 10 }}>
              <div style={{ fontSize: 11, color: 'var(--ios-text-secondary)' }}>Nieopłacone należności</div>
              <div style={{ fontSize: 18, fontWeight: 800, color: reportData.unpaidGrosze > 0 ? 'var(--ios-red)' : 'inherit' }}>
                {Money.format(reportData.unpaidGrosze)}
              </div>
            </div>
          </div>

          {/* Breakdown by payment methods */}
          <div style={{ marginBottom: 16 }}>
            <h3 style={{ fontSize: 14, fontWeight: 700, marginBottom: 8 }}>Rozbicie wg metod płatności</h3>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, fontSize: 12 }}>
              <div style={{ border: '1px solid var(--ios-border)', padding: 8, borderRadius: 8 }}>
                <span style={{ color: 'var(--ios-text-secondary)' }}>BLIK:</span>
                <div style={{ fontWeight: 700 }}>{Money.format(reportData.paymentsByMethod.blik)}</div>
              </div>
              <div style={{ border: '1px solid var(--ios-border)', padding: 8, borderRadius: 8 }}>
                <span style={{ color: 'var(--ios-text-secondary)' }}>Przelew:</span>
                <div style={{ fontWeight: 700 }}>{Money.format(reportData.paymentsByMethod.przelew)}</div>
              </div>
              <div style={{ border: '1px solid var(--ios-border)', padding: 8, borderRadius: 8 }}>
                <span style={{ color: 'var(--ios-text-secondary)' }}>Gotówka:</span>
                <div style={{ fontWeight: 700 }}>{Money.format(reportData.paymentsByMethod.gotowka)}</div>
              </div>
            </div>
          </div>

          {/* Breakdown per student */}
          <div style={{ marginBottom: 16 }}>
            <h3 style={{ fontSize: 14, fontWeight: 700, marginBottom: 8 }}>Zestawienie wg uczniów</h3>
            <div style={{ border: '1px solid var(--ios-border)', borderRadius: 8, overflow: 'hidden' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12, textAlign: 'left' }}>
                <thead>
                  <tr style={{ backgroundColor: 'var(--ios-system-bg)' }}>
                    <th style={{ padding: '6px 8px' }}>Uczeń</th>
                    <th style={{ padding: '6px 8px', textAlign: 'center' }}>Godziny</th>
                    <th style={{ padding: '6px 8px', textAlign: 'right' }}>Należne</th>
                    <th style={{ padding: '6px 8px', textAlign: 'right' }}>Wpłacone</th>
                  </tr>
                </thead>
                <tbody>
                  {reportData.studentBreakdown.map(item => (
                    <tr key={item.studentId} style={{ borderTop: '1px solid var(--ios-separator)' }}>
                      <td style={{ padding: '6px 8px', fontWeight: 600 }}>{item.studentName}</td>
                      <td style={{ padding: '6px 8px', textAlign: 'center' }}>{item.completedHours} h</td>
                      <td style={{ padding: '6px 8px', textAlign: 'right' }}>{Money.format(item.accruedGrosze)}</td>
                      <td style={{ padding: '6px 8px', textAlign: 'right', color: 'var(--ios-green)', fontWeight: 600 }}>
                        {Money.format(item.receivedGrosze)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Snapshot Hash / Verification */}
          {activeSnapshot && (
            <div style={{ fontSize: 11, color: 'var(--ios-text-secondary)', borderTop: '1px solid var(--ios-separator)', paddingTop: 8 }}>
              <div>Snapshot ID: {activeSnapshot.id} • Wersja {activeSnapshot.version_num}</div>
              <div>Podpis kryptograficzny: {activeSnapshot.hash}</div>
            </div>
          )}

          {/* Actions: Close period or Correction */}
          <div style={{ marginTop: 16, display: 'flex', gap: 10 }}>
            {selectedPeriod.status === 'open' ? (
              <button
                onClick={() => handleClosePeriod(selectedPeriod.id)}
                className="ios-btn ios-btn-primary"
                style={{ flex: 1 }}
              >
                <IconCheck size={16} /> Zamknij okres (utwórz snapshot)
              </button>
            ) : (
              <button
                onClick={() => setShowCorrectionModal(true)}
                className="ios-btn ios-btn-secondary"
                style={{ flex: 1 }}
              >
                Zgłoś korektę po zamknięciu (nowa wersja)
              </button>
            )}
          </div>
        </div>
      )}

      {/* Correction Modal */}
      {showCorrectionModal && selectedPeriod && (
        <div className="ios-modal-overlay" onClick={() => setShowCorrectionModal(false)}>
          <div className="ios-modal-content" onClick={e => e.stopPropagation()}>
            <div className="ios-modal-grabber" />
            <h3 style={{ fontSize: 18, fontWeight: 700, marginBottom: 8 }}>Korekta po zamknięciu</h3>
            <p style={{ fontSize: 13, color: 'var(--ios-text-secondary)', marginBottom: 12 }}>
              Korekta zachowa historyczną wersję snapshotu i wygeneruje wersję v{(activeSnapshot?.version_num || 1) + 1}.
            </p>
            <form onSubmit={handleCorrectionSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div>
                <label style={{ fontSize: 12, fontWeight: 600 }}>Powód korekty:</label>
                <textarea
                  className="ios-input"
                  rows={3}
                  required
                  placeholder="np. Błędnie oznaczona lekcja z 15.11, zmiana statusu na odwołana"
                  value={correctionReason}
                  onChange={e => setCorrectionReason(e.target.value)}
                />
              </div>

              <button type="submit" className="ios-btn ios-btn-primary">
                Zatwierdź korektę
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
