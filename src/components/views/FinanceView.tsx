import React, { useState, useMemo } from 'react';
import { useApp } from '../../context/AppContext';
import { Money } from '../../domain/money';
import { getChargesBalance } from '../../domain/allocation';
import { IconDownload } from '../common/Icons';

export const FinanceView: React.FC = () => {
  const { charges, payments, paymentAllocations, incomeEntries, students } = useApp();
  const [activeSubTab, setActiveSubTab] = useState<'charges' | 'payments' | 'register'>('charges');
  const [periodFilter, setPeriodFilter] = useState('2026-11');

  // Charges balance & age of debt
  const openCharges = useMemo(() => {
    const balanceMap = getChargesBalance(charges, paymentAllocations);
    const list = Array.from(balanceMap.values()).filter(b => b.remainingAmount > 0);

    // Sort by oldest accrual_date first (age of debt)
    return list.sort((a, b) => a.charge.accrual_date.localeCompare(b.charge.accrual_date));
  }, [charges, paymentAllocations]);

  // Filtered income entries
  const filteredIncome = useMemo(() => {
    return incomeEntries
      .filter(e => e.accrual_date.startsWith(periodFilter))
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
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
            <h2 style={{ fontSize: 16, fontWeight: 700 }}>Otwarte należności ({openCharges.length})</h2>
            <span style={{ fontSize: 12, color: 'var(--ios-text-secondary)' }}>Sortowane od najstarszych</span>
          </div>

          {openCharges.length === 0 ? (
            <div className="ios-card" style={{ textAlign: 'center', padding: '24px 16px' }}>
              <div style={{ fontWeight: 600, color: 'var(--ios-green)' }}>Brak zaległości!</div>
              <div style={{ fontSize: 13, color: 'var(--ios-text-secondary)', marginTop: 4 }}>
                Wszyscy uczniowie mają uregulowane należności.
              </div>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {openCharges.map(item => {
                const student = students.find(s => s.id === item.charge.student_id);
                // Days since accrual
                const daysOld = Math.floor(
                  (new Date().getTime() - new Date(item.charge.accrual_date).getTime()) / (1000 * 60 * 60 * 24)
                );

                return (
                  <div key={item.charge.id} className="ios-card" style={{ marginBottom: 0 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                      <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <span style={{ fontWeight: 700, fontSize: 15 }}>
                            {student ? `${student.first_name} ${student.last_name}` : 'Uczeń'}
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
                        <div style={{ fontSize: 13, color: 'var(--ios-text-secondary)', marginTop: 2 }}>
                          Termin: {item.charge.accrual_date} • {item.charge.description || 'Lekcja'}
                        </div>
                      </div>

                      <div style={{ textAlign: 'right' }}>
                        <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--ios-red)' }}>
                          {Money.format(item.remainingAmount)}
                        </div>
                        {item.allocatedAmount > 0 && (
                          <div style={{ fontSize: 11, color: 'var(--ios-text-secondary)' }}>
                            z {Money.format(item.charge.amount)} (częściowo)
                          </div>
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
    </div>
  );
};
