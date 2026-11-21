import React, { useState, useMemo } from 'react';
import { useApp } from '../../context/AppContext';
import { Money } from '../../domain/money';
import { getChargesBalance, proposeFifoAllocation } from '../../domain/allocation';
import { PaymentMethod, Student } from '../../domain/types';
import { IconDownload, IconX, IconCheck } from '../common/Icons';

export const FinanceView: React.FC = () => {
  const { charges, payments, paymentAllocations, incomeEntries, students, lessons, deleteCharge, recordPayment } = useApp();
  const [activeSubTab, setActiveSubTab] = useState<'charges' | 'payments' | 'register'>('charges');
  const [chargesFilter, setChargesFilter] = useState<'all' | 'open'>('open');
  const [periodFilter, setPeriodFilter] = useState('2026-11');

  // Payment Modal state (B2)
  const [payModalStudent, setPayModalStudent] = useState<Student | null>(null);
  const [payModalAmountStr, setPayModalAmountStr] = useState('');
  const [payModalMethod, setPayModalMethod] = useState<PaymentMethod>('blik');

  // Positive charges (exclude negative technical storno rows from display list)
  const visibleCharges = useMemo(() => {
    return charges.filter(c => c.amount > 0);
  }, [charges]);

  // Charges balance & age of debt
  const openCharges = useMemo(() => {
    const balanceMap = getChargesBalance(charges, paymentAllocations, payments, lessons);
    const list = Array.from(balanceMap.values()).filter(b => b.remainingAmount > 0);

    // Sort by oldest accrual_date first (age of debt)
    return list.sort((a, b) => a.charge.accrual_date.localeCompare(b.charge.accrual_date));
  }, [charges, paymentAllocations, payments, lessons]);

  // Group open charges by student (B2)
  const openDebtsByStudent = useMemo(() => {
    const map = new Map<string, { student: Student; charges: typeof openCharges; total: number }>();
    for (const item of openCharges) {
      const s = students.find(stud => stud.id === item.charge.student_id);
      if (!s) continue;
      if (!map.has(s.id)) {
        map.set(s.id, { student: s, charges: [], total: 0 });
      }
      const entry = map.get(s.id)!;
      entry.charges.push(item);
      entry.total += item.remainingAmount;
    }
    return Array.from(map.values()).sort((a, b) => b.total - a.total);
  }, [openCharges, students]);

  // Live FIFO allocation preview for modal (B2)
  const payAllocationPreview = useMemo(() => {
    if (!payModalStudent) return null;
    const amountGrosze = Money.parse(payModalAmountStr || '0');
    if (amountGrosze <= 0) return null;

    const studentCharges = charges.filter(c => c.student_id === payModalStudent.id);
    const studentAllocs = paymentAllocations.filter(a => {
      const ch = charges.find(c => c.id === a.charge_id);
      return ch?.student_id === payModalStudent.id;
    });

    return proposeFifoAllocation(amountGrosze, studentCharges, studentAllocs);
  }, [payModalStudent, payModalAmountStr, charges, paymentAllocations]);

  // Filtered income entries (exclude zeroed-out storned entries)
  const filteredIncome = useMemo(() => {
    return incomeEntries
      .filter(e => e.accrual_date.startsWith(periodFilter) && (e.amount_due > 0 || e.amount_received > 0))
      .sort((a, b) => b.number.localeCompare(a.number));
  }, [incomeEntries, periodFilter]);

  // Export CSV (Polish Excel standard: UTF-8 with BOM and ';' separator)
  const exportCsv = () => {
    const headers = [
      'Numer',
      'Data wykonania usługi',
      'Data powstania przychodu (limit)',
      'Data zapłaty (PIT)',
      'Uczeń',
      'Rodzaj usługi',
      'Kwota należna (zł)',
      'Kwota otrzymana (zł)',
      'Metoda',
      'Status'
    ];

    const rows = filteredIncome.map(entry => {
      const student = students.find(s => s.id === entry.student_id);
      const studentName = student ? `"${student.first_name} ${student.last_name}"` : '""';
      return [
        entry.number,
        entry.service_date,
        entry.accrual_date,
        entry.received_date || '',
        studentName,
        `"${entry.service_type}"`,
        (entry.amount_due / 100).toFixed(2).replace('.', ','),
        (entry.amount_received / 100).toFixed(2).replace('.', ','),
        entry.method,
        entry.status
      ].join(';');
    });

    const csvContent = '\uFEFF' + [headers.join(';'), ...rows].join('\r\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `Ewidencja_przychodow_${periodFilter}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div style={{ padding: '16px 16px 8px 16px', maxWidth: 640, margin: '0 auto' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
        <div>
          <h1 style={{ fontSize: 24, fontWeight: 800 }}>Finanse</h1>
          <span style={{ fontSize: 13, color: 'var(--ios-text-secondary)' }}>
            Należności, wpłaty i ewidencja przychodów
          </span>
        </div>
        <button
          onClick={exportCsv}
          className="ios-btn ios-btn-secondary"
          style={{ padding: '8px 12px', fontSize: 12, minHeight: 34 }}
        >
          <IconDownload size={14} /> Eksportuj CSV
        </button>
      </div>

      {/* Sub-tabs: Należności / Wpłaty / Ewidencja */}
      <div style={{ display: 'flex', borderBottom: '1px solid var(--ios-separator)', marginBottom: 16 }}>
        {(['charges', 'payments', 'register'] as const).map(tab => (
          <button
            key={tab}
            onClick={() => setActiveSubTab(tab)}
            style={{
              flex: 1,
              padding: '10px 0',
              border: 'none',
              background: 'none',
              fontWeight: activeSubTab === tab ? 700 : 500,
              color: activeSubTab === tab ? 'var(--ios-blue)' : 'var(--ios-text-secondary)',
              borderBottom: activeSubTab === tab ? '2px solid var(--ios-blue)' : 'none',
              cursor: 'pointer',
              fontSize: 14
            }}
          >
            {tab === 'charges' ? 'Należności' : tab === 'payments' ? 'Wpłaty' : 'Ewidencja'}
          </button>
        ))}
      </div>

      {/* TAB 1: Należności / Zaległości */}
      {activeSubTab === 'charges' && (
        <div>
          <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
            <button
              onClick={() => setChargesFilter('all')}
              className={`ios-btn ${chargesFilter === 'all' ? 'ios-btn-primary' : 'ios-btn-secondary'}`}
              style={{ padding: '6px 14px', fontSize: 13, minHeight: 32 }}
            >
              Wszystkie ({visibleCharges.length})
            </button>
            <button
              onClick={() => setChargesFilter('open')}
              className={`ios-btn ${chargesFilter === 'open' ? 'ios-btn-danger' : 'ios-btn-secondary'}`}
              style={{ padding: '6px 14px', fontSize: 13, minHeight: 32 }}
            >
              Do zapłaty ({openCharges.length})
            </button>
          </div>

          {chargesFilter === 'open' ? (
            openDebtsByStudent.length === 0 ? (
              <div className="ios-card" style={{ textAlign: 'center', padding: '24px 16px' }}>
                <div style={{ fontWeight: 600, color: 'var(--ios-green)' }}>Brak zaległości!</div>
                <div style={{ fontSize: 13, color: 'var(--ios-text-secondary)', marginTop: 4 }}>
                  Wszyscy uczniowie mają uregulowane należności.
                </div>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                {openDebtsByStudent.map(({ student, charges: studentOpenCharges, total }) => (
                  <div
                    key={student.id}
                    className="ios-card"
                    style={{ marginBottom: 0, border: '1px solid var(--ios-border)', borderRadius: 14 }}
                  >
                    {/* Student Debt Header */}
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                      <div>
                        <div style={{ fontWeight: 700, fontSize: 16 }}>
                          {student.first_name} {student.last_name}
                        </div>
                        <div style={{ fontSize: 12, color: 'var(--ios-text-secondary)' }}>
                          Łączne zadłużenie ({studentOpenCharges.length} {studentOpenCharges.length === 1 ? 'należność' : 'należności'}):
                        </div>
                      </div>
                      <div style={{ textAlign: 'right' }}>
                        <div style={{ fontSize: 18, fontWeight: 800, color: 'var(--ios-red)' }}>
                          {Money.format(total)}
                        </div>
                      </div>
                    </div>

                    {/* Quick Pay All Button (B2) */}
                    <button
                      onClick={() => {
                        setPayModalStudent(student);
                        setPayModalAmountStr(Money.format(total, false));
                      }}
                      className="ios-btn ios-btn-primary"
                      style={{ width: '100%', marginBottom: 12, fontSize: 13, fontWeight: 700 }}
                    >
                      <IconCheck size={16} /> Zapłać wszystkie zaległe ({Money.format(total)})
                    </button>

                    {/* Breakdown of individual charges */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                      {studentOpenCharges.map(item => {
                        const daysOld = Math.floor(
                          (new Date().getTime() - new Date(item.charge.accrual_date).getTime()) / (1000 * 60 * 60 * 24)
                        );

                        return (
                          <div
                            key={item.charge.id}
                            style={{
                              padding: 10,
                              borderRadius: 10,
                              background: 'var(--ios-bg)',
                              border: '1px solid var(--ios-separator)',
                              display: 'flex',
                              justifyContent: 'space-between',
                              alignItems: 'center'
                            }}
                          >
                            <div>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                <span style={{ fontWeight: 600, fontSize: 14 }}>
                                  {item.charge.description || 'Lekcja'}
                                </span>
                                <span
                                  className="ios-badge"
                                  style={{
                                    backgroundColor: daysOld > 14 ? 'rgba(255,59,48,0.15)' : 'rgba(255,149,0,0.15)',
                                    color: daysOld > 14 ? 'var(--ios-red)' : 'var(--ios-amber)',
                                    fontSize: 10
                                  }}
                                >
                                  {daysOld} dni temu
                                </span>
                              </div>
                              <div style={{ fontSize: 11, color: 'var(--ios-text-secondary)', marginTop: 2 }}>
                                Data: {item.charge.accrual_date}
                              </div>
                            </div>

                            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                              <div style={{ textAlign: 'right' }}>
                                <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--ios-red)' }}>
                                  {Money.format(item.remainingAmount)}
                                </div>
                                {item.allocatedAmount > 0 && (
                                  <div style={{ fontSize: 10, color: 'var(--ios-text-secondary)' }}>
                                    z {Money.format(item.charge.amount)}
                                  </div>
                                )}
                              </div>
                              <button
                                onClick={() => {
                                  setPayModalStudent(student);
                                  setPayModalAmountStr(Money.format(item.remainingAmount, false));
                                }}
                                className="ios-btn ios-btn-secondary"
                                style={{ padding: '4px 8px', fontSize: 11, minHeight: 28 }}
                              >
                                Wpłać
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            )
          ) : (
            /* ALL CHARGES LIST */
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {visibleCharges
                .slice()
                .sort((a, b) => b.accrual_date.localeCompare(a.accrual_date) || b.created_at.localeCompare(a.created_at))
                .map(c => {
                  const student = students.find(s => s.id === c.student_id);
                  const isStorned = charges.some(sc => sc.reverses_charge_id === c.id);
                  const allocated = paymentAllocations
                    .filter(a => a.charge_id === c.id && payments.some(p => p.id === a.payment_id))
                    .reduce((sum, a) => sum + a.amount, 0);
                  const isFullyPaid = !isStorned && allocated >= c.amount;

                  return (
                    <div key={c.id} className="ios-card" style={{ marginBottom: 0, padding: 12, opacity: isStorned ? 0.65 : 1 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                            <span style={{ fontWeight: 700, fontSize: 15 }}>
                              {student ? `${student.first_name} ${student.last_name}` : 'Uczeń'}
                            </span>
                            {isStorned ? (
                              <span className="ios-badge" style={{ fontSize: 10, backgroundColor: 'rgba(142,142,147,0.18)', color: 'var(--ios-text-secondary)' }}>
                                Anulowane (Storno)
                              </span>
                            ) : isFullyPaid ? (
                              <span className="ios-badge ios-badge-green" style={{ fontSize: 10 }}>Opłacona</span>
                            ) : (
                              <span className="ios-badge ios-badge-amber" style={{ fontSize: 10 }}>Do zapłaty</span>
                            )}
                          </div>
                          <div style={{ fontSize: 12, color: 'var(--ios-text-secondary)', marginTop: 2 }}>
                            {c.accrual_date} • {c.description || 'Lekcja'}
                          </div>
                        </div>

                        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                          <div style={{ textAlign: 'right' }}>
                            <div style={{ fontSize: 16, fontWeight: 700, textDecoration: isStorned ? 'line-through' : 'none' }}>
                              {Money.format(c.amount)}
                            </div>
                            <div style={{ fontSize: 11, color: 'var(--ios-text-secondary)' }}>
                              {isStorned ? 'Anulowano' : isFullyPaid ? 'Rozliczona' : `Pozostało: ${Money.format(c.amount - allocated)}`}
                            </div>
                          </div>

                          {!isStorned && (
                            <button
                              onClick={() => {
                                if (confirm(`Czy na pewno chcesz anulować (wystornować) to naliczenie (${Money.format(c.amount)})?`)) {
                                  deleteCharge(c.id);
                                }
                              }}
                              title="Anuluj (stornuj) naliczenie"
                              style={{
                                border: 'none',
                                background: 'rgba(255,59,48,0.1)',
                                color: 'var(--ios-red)',
                                borderRadius: 8,
                                width: 32,
                                height: 32,
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                cursor: 'pointer'
                              }}
                            >
                              <IconX size={16} />
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
            </div>
          )}
        </div>
      )}

      {/* TAB 2: Wpłaty */}
      {activeSubTab === 'payments' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {payments
            .slice()
            .sort((a, b) => b.received_date.localeCompare(a.received_date))
            .map(p => {
              const student = students.find(s => s.id === p.student_id);
              return (
                <div key={p.id} className="ios-card" style={{ marginBottom: 0 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <span style={{ fontWeight: 700, fontSize: 15 }}>
                          {student ? `${student.first_name} ${student.last_name}` : 'Uczeń'}
                        </span>
                        <span className="ios-badge ios-badge-green" style={{ fontSize: 10 }}>
                          {p.method.toUpperCase()}
                        </span>
                      </div>
                      <div style={{ fontSize: 13, color: 'var(--ios-text-secondary)', marginTop: 2 }}>
                        {p.received_date} • {p.description}
                      </div>
                    </div>
                    <div style={{ fontSize: 17, fontWeight: 800, color: 'var(--ios-green)' }}>
                      +{Money.format(p.amount)}
                    </div>
                  </div>
                </div>
              );
            })}
        </div>
      )}

      {/* TAB 3: Ewidencja Przychodów (Official tax table RRRR/NNN) */}
      {activeSubTab === 'register' && (
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <span style={{ fontSize: 14, fontWeight: 700 }}>Okres:</span>
            <input
              type="month"
              className="ios-input"
              style={{ width: 'auto', minHeight: 32, padding: '4px 8px', fontSize: 13 }}
              value={periodFilter}
              onChange={e => setPeriodFilter(e.target.value)}
            />
          </div>

          <div className="ios-card" style={{ padding: 0, overflowX: 'auto', marginBottom: 12 }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, textAlign: 'left' }}>
              <thead>
                <tr style={{ backgroundColor: 'var(--ios-system-bg)', borderBottom: '1px solid var(--ios-separator)' }}>
                  <th style={{ padding: '8px 10px', fontWeight: 700 }}>Nr</th>
                  <th style={{ padding: '8px 10px', fontWeight: 700 }}>Data</th>
                  <th style={{ padding: '8px 10px', fontWeight: 700 }}>Uczeń</th>
                  <th style={{ padding: '8px 10px', fontWeight: 700, textAlign: 'right' }}>Należna</th>
                  <th style={{ padding: '8px 10px', fontWeight: 700, textAlign: 'right' }}>Wpłacona</th>
                </tr>
              </thead>
              <tbody>
                {filteredIncome.map(entry => {
                  const student = students.find(s => s.id === entry.student_id);
                  return (
                    <tr key={entry.id} style={{ borderBottom: '1px solid var(--ios-separator)' }}>
                      <td style={{ padding: '8px 10px', fontWeight: 600 }}>{entry.number}</td>
                      <td style={{ padding: '8px 10px', color: 'var(--ios-text-secondary)' }}>{entry.accrual_date}</td>
                      <td style={{ padding: '8px 10px' }}>
                        {student ? `${student.first_name} ${student.last_name}` : 'Uczeń'}
                      </td>
                      <td style={{ padding: '8px 10px', textAlign: 'right', fontWeight: 600 }}>
                        {Money.format(entry.amount_due)}
                      </td>
                      <td style={{ padding: '8px 10px', textAlign: 'right', fontWeight: 600, color: 'var(--ios-green)' }}>
                        {Money.format(entry.amount_received)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div style={{ fontSize: 12, color: 'var(--ios-text-secondary)', lineHeight: 1.4 }}>
            ℹ️ Ewidencja numerowana jest ściśle rosnąco (RRRR/NNN) bez luk. Anulowanie wpisu następuje poprzez storno, nie usuwanie.
          </div>
        </div>
      )}

      {/* Payment Modal with Live FIFO Preview (B2) */}
      {payModalStudent && (
        <div className="ios-modal-overlay" onClick={() => setPayModalStudent(null)}>
          <div className="ios-modal-content" onClick={e => e.stopPropagation()}>
            <div className="ios-modal-grabber" />
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <h3 style={{ fontSize: 18, fontWeight: 700 }}>
                Rozlicz wpłatę: {payModalStudent.first_name} {payModalStudent.last_name}
              </h3>
              <button
                onClick={() => setPayModalStudent(null)}
                className="ios-btn ios-btn-secondary"
                style={{ padding: '4px 8px', fontSize: 12 }}
              >
                Zamknij
              </button>
            </div>

            {/* Amount Input */}
            <div style={{ marginBottom: 14 }}>
              <label style={{ fontSize: 13, fontWeight: 600, display: 'block', marginBottom: 4 }}>
                Kwota wpłaty (zł):
              </label>
              <input
                type="text"
                className="ios-input"
                style={{ fontSize: 18, fontWeight: 700 }}
                value={payModalAmountStr}
                onChange={e => setPayModalAmountStr(e.target.value)}
                placeholder="np. 70 lub 140"
              />
            </div>

            {/* Payment Method Selector */}
            <div style={{ marginBottom: 16 }}>
              <label style={{ fontSize: 13, fontWeight: 600, display: 'block', marginBottom: 6 }}>
                Metoda płatności:
              </label>
              <div style={{ display: 'flex', gap: 8 }}>
                {(['blik', 'przelew', 'gotowka'] as const).map(m => (
                  <button
                    key={m}
                    onClick={() => setPayModalMethod(m)}
                    className={`ios-btn ${payModalMethod === m ? 'ios-btn-primary' : 'ios-btn-secondary'}`}
                    style={{ flex: 1, textTransform: 'uppercase', fontSize: 12, fontWeight: 600 }}
                  >
                    {m}
                  </button>
                ))}
              </div>
            </div>

            {/* Live FIFO Allocation Preview (B2) */}
            {payAllocationPreview && (
              <div
                style={{
                  background: 'var(--ios-bg)',
                  borderRadius: 12,
                  padding: 12,
                  marginBottom: 16,
                  border: '1px solid var(--ios-border)'
                }}
              >
                <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 6, color: 'var(--ios-text-secondary)' }}>
                  PODGLĄD POKRYCIA NALEŻNOŚCI (FIFO):
                </div>
                {payAllocationPreview.allocations.length === 0 && payAllocationPreview.creditOverpayment === 0 ? (
                  <div style={{ fontSize: 12, color: 'var(--ios-text-secondary)' }}>Wpisz kwotę wpłaty</div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {payAllocationPreview.allocations.map(a => {
                      const ch = charges.find(c => c.id === a.chargeId);
                      return (
                        <div key={a.chargeId} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
                          <span>
                            • {ch?.accrual_date} ({ch?.description || 'Lekcja'})
                          </span>
                          <span style={{ fontWeight: 700, color: 'var(--ios-green)' }}>
                            +{Money.format(a.amount)}
                          </span>
                        </div>
                      );
                    })}
                    {payAllocationPreview.creditOverpayment > 0 && (
                      <div
                        style={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          fontSize: 13,
                          marginTop: 4,
                          paddingTop: 4,
                          borderTop: '1px dashed var(--ios-border)',
                          color: 'var(--ios-blue)',
                          fontWeight: 600
                        }}
                      >
                        <span>• Nadpłata na poczet przyszłych lekcji</span>
                        <span>+{Money.format(payAllocationPreview.creditOverpayment)}</span>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            <button
              onClick={async () => {
                const amountGrosze = Money.parse(payModalAmountStr);
                if (amountGrosze <= 0) {
                  alert('Podaj prawidłową kwotę.');
                  return;
                }
                await recordPayment({
                  student_id: payModalStudent.id,
                  amount: amountGrosze,
                  method: payModalMethod,
                  description: `Wpłata ${payModalMethod.toUpperCase()}`
                }, true);
                setPayModalStudent(null);
              }}
              className="ios-btn ios-btn-primary"
              style={{ width: '100%', fontSize: 15, fontWeight: 700, padding: 14 }}
            >
              Zatwierdź wpłatę ({Money.format(Money.parse(payModalAmountStr || '0'))})
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
