import React, { useState, useMemo } from 'react';
import { useApp } from '../../context/AppContext';
import { Money } from '../../domain/money';
import { Student, StudentStatus, PaymentMethod } from '../../domain/types';
import { getStudentFinancialSummary } from '../../domain/allocation';
import { IconCheck, IconPhone, IconPlus, IconEdit } from '../common/Icons';

export const POLISH_MONTHS = [
  { value: 1, label: 'stycznia' },
  { value: 2, label: 'lutego' },
  { value: 3, label: 'marca' },
  { value: 4, label: 'kwietnia' },
  { value: 5, label: 'maja' },
  { value: 6, label: 'czerwca' },
  { value: 7, label: 'lipca' },
  { value: 8, label: 'sierpnia' },
  { value: 9, label: 'września' },
  { value: 10, label: 'października' },
  { value: 11, label: 'listopada' },
  { value: 12, label: 'grudnia' }
];

export function formatStudentBirthday(day?: number, month?: number): string {
  if (!day || !month) return '';
  const m = POLISH_MONTHS.find(item => item.value === month);
  return `${day} ${m ? m.label : month}`;
}

export const StudentsView: React.FC = () => {
  const {
    students,
    guardians,
    lessons,
    charges,
    payments,
    createStudent,
    updateStudent,
    anonymizeStudent,
    recordPayment
  } = useApp();

  const [searchQuery, setSearchQuery] = useState('');
  const [filterType, setFilterType] = useState<'all' | 'active' | 'debt'>('active');
  const [selectedStudent, setSelectedStudent] = useState<Student | null>(null);
  const [studentTab, setStudentTab] = useState<'lessons' | 'payments' | 'stats'>('lessons');

  // Modals
  const [showAddStudentModal, setShowAddStudentModal] = useState(false);
  const [showEditStudentModal, setShowEditStudentModal] = useState(false);
  const [showPayModal, setShowPayModal] = useState(false);

  // Form states for adding new student
  const [newFirstName, setNewFirstName] = useState('');
  const [newLastName, setNewLastName] = useState('');
  const [newPhone, setNewPhone] = useState('');
  const [newEmail, setNewEmail] = useState('');
  const [newGrade, setNewGrade] = useState('Klasa 8');
  const [newRateStr, setNewRateStr] = useState('70,00');
  const [newGuardianName, setNewGuardianName] = useState('');
  const [newGuardianPhone, setNewGuardianPhone] = useState('');
  const [newBirthDay, setNewBirthDay] = useState('');
  const [newBirthMonth, setNewBirthMonth] = useState('');

  // Form states for editing student
  const [editFirstName, setEditFirstName] = useState('');
  const [editLastName, setEditLastName] = useState('');
  const [editPhone, setEditPhone] = useState('');
  const [editEmail, setEditEmail] = useState('');
  const [editGrade, setEditGrade] = useState('');
  const [editSubject, setEditSubject] = useState('');
  const [editRateStr, setEditRateStr] = useState('');
  const [editNotes, setEditNotes] = useState('');
  const [editStatus, setEditStatus] = useState<StudentStatus>('active');
  const [editBirthDay, setEditBirthDay] = useState('');
  const [editBirthMonth, setEditBirthMonth] = useState('');

  const openEditModal = (student: Student) => {
    setEditFirstName(student.first_name);
    setEditLastName(student.last_name);
    setEditPhone(student.phone || '');
    setEditEmail(student.email || '');
    setEditGrade(student.grade_level || '');
    setEditSubject(student.subject || 'Matematyka');
    setEditRateStr(Money.format(student.default_rate, false));
    setEditNotes(student.notes || '');
    setEditStatus(student.status);
    setEditBirthDay(student.birth_day ? String(student.birth_day) : '');
    setEditBirthMonth(student.birth_month ? String(student.birth_month) : '');
    setShowEditStudentModal(true);
  };

  const handleEditStudentSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedStudent) return;
    const rateGrosze = Money.parse(editRateStr);
    const updated: Student = {
      ...selectedStudent,
      first_name: editFirstName.trim(),
      last_name: editLastName.trim(),
      phone: editPhone.trim(),
      email: editEmail.trim(),
      grade_level: editGrade.trim(),
      subject: editSubject.trim(),
      default_rate: rateGrosze > 0 ? rateGrosze : selectedStudent.default_rate,
      notes: editNotes.trim(),
      status: editStatus,
      birth_day: editBirthDay ? Number(editBirthDay) : undefined,
      birth_month: editBirthMonth ? Number(editBirthMonth) : undefined
    };
    await updateStudent(updated);
    setSelectedStudent(updated);
    setShowEditStudentModal(false);
  };

  // Payment form state
  const [payAmountStr, setPayAmountStr] = useState('70,00');
  const [payMethod, setPayMethod] = useState<PaymentMethod>('blik');
  const [payDesc, setPayDesc] = useState('Wpłata za lekcje');

  // Filter students
  const filteredStudents = useMemo(() => {
    return students.filter(s => {
      const matchesSearch = `${s.first_name} ${s.last_name} ${s.grade_level} ${s.notes}`
        .toLowerCase()
        .includes(searchQuery.toLowerCase());

      if (!matchesSearch) return false;

      if (filterType === 'active') return s.status === 'active';
      if (filterType === 'debt') {
        const sum = getStudentFinancialSummary(s.id, charges, payments);
        return sum.debt > 0;
      }
      return true;
    });
  }, [students, searchQuery, filterType, charges, payments]);

  const handleAddStudentSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const rateGrosze = Money.parse(newRateStr);
    await createStudent(
      {
        first_name: newFirstName,
        last_name: newLastName,
        phone: newPhone,
        email: newEmail,
        grade_level: newGrade,
        default_rate: rateGrosze,
        birth_day: newBirthDay ? Number(newBirthDay) : undefined,
        birth_month: newBirthMonth ? Number(newBirthMonth) : undefined
      },
      newGuardianName ? {
        full_name: newGuardianName,
        phone: newGuardianPhone,
        role: 'Rodzic',
        is_payer: true
      } : undefined
    );

    setShowAddStudentModal(false);
    setNewFirstName('');
    setNewLastName('');
    setNewPhone('');
    setNewGuardianName('');
  };

  const handlePaymentSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedStudent) return;

    const amountGrosze = Money.parse(payAmountStr);
    await recordPayment({
      student_id: selectedStudent.id,
      amount: amountGrosze,
      method: payMethod,
      description: payDesc
    }, true);

    setShowPayModal(false);
  };

  return (
    <div style={{ padding: '16px 16px 8px 16px', maxWidth: 600, margin: '0 auto' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
        <div>
          <h1 style={{ fontSize: 24, fontWeight: 800 }}>Uczniowie</h1>
          <span style={{ fontSize: 13, color: 'var(--ios-text-secondary)' }}>
            Łącznie {students.length} uczniów w kartotece
          </span>
        </div>
        <button
          onClick={() => setShowAddStudentModal(true)}
          className="ios-btn ios-btn-primary"
          style={{ padding: '8px 14px', fontSize: 13, minHeight: 36 }}
        >
          <IconPlus size={16} /> Dodaj ucznia
        </button>
      </div>

      {/* Search Input */}
      <div style={{ marginBottom: 12 }}>
        <input
          type="search"
          placeholder="Szukaj ucznia, klasy lub notatki..."
          className="ios-input"
          value={searchQuery}
          onChange={e => setSearchQuery(e.target.value)}
        />
      </div>

      {/* Filters: Aktywni / Zaległości / Wszyscy */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        <button
          onClick={() => setFilterType('active')}
          className={`ios-btn ${filterType === 'active' ? 'ios-btn-primary' : 'ios-btn-secondary'}`}
          style={{ padding: '6px 14px', fontSize: 13, minHeight: 32 }}
        >
          Aktywni
        </button>
        <button
          onClick={() => setFilterType('debt')}
          className={`ios-btn ${filterType === 'debt' ? 'ios-btn-danger' : 'ios-btn-secondary'}`}
          style={{ padding: '6px 14px', fontSize: 13, minHeight: 32 }}
        >
          Zaległości
        </button>
        <button
          onClick={() => setFilterType('all')}
          className={`ios-btn ${filterType === 'all' ? 'ios-btn-primary' : 'ios-btn-secondary'}`}
          style={{ padding: '6px 14px', fontSize: 13, minHeight: 32 }}
        >
          Wszyscy
        </button>
      </div>

      {/* Students List */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {filteredStudents.map(student => {
          const summary = getStudentFinancialSummary(student.id, charges, payments);
          const studentGuardians = guardians.filter(g => g.student_id === student.id);

          return (
            <div
              key={student.id}
              className="ios-card"
              onClick={() => setSelectedStudent(student)}
              style={{
                cursor: 'pointer',
                marginBottom: 0,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between'
              }}
            >
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
                  <span style={{ fontSize: 16, fontWeight: 700 }}>
                    {student.first_name} {student.last_name}
                  </span>
                  {student.status === 'archived' && (
                    <span className="ios-badge ios-badge-amber">Archiwum</span>
                  )}
                </div>
                <div style={{ fontSize: 13, color: 'var(--ios-text-secondary)', marginBottom: 2 }}>
                  {student.grade_level} • Stawka: {Money.format(student.default_rate)}
                </div>
                {student.birth_day && student.birth_month && (
                  <div style={{ fontSize: 12, color: 'var(--ios-purple)', marginBottom: 2 }}>
                    🎂 Urodziny: {formatStudentBirthday(student.birth_day, student.birth_month)}
                  </div>
                )}
                {studentGuardians.length > 0 && (
                  <div style={{ fontSize: 12, color: 'var(--ios-text-secondary)' }}>
                    Opiekun: {studentGuardians[0].full_name} ({studentGuardians[0].phone})
                  </div>
                )}
              </div>

              <div style={{ textAlign: 'right' }}>
                {summary.debt > 0 ? (
                  <div>
                    <span style={{ fontSize: 12, color: 'var(--ios-red)', fontWeight: 600 }}>Dług</span>
                    <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--ios-red)' }}>
                      {Money.format(summary.debt)}
                    </div>
                  </div>
                ) : summary.creditBalance > 0 ? (
                  <div>
                    <span style={{ fontSize: 12, color: 'var(--ios-green)', fontWeight: 600 }}>Nadpłata</span>
                    <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--ios-green)' }}>
                      {Money.format(summary.creditBalance)}
                    </div>
                  </div>
                ) : (
                  <span className="ios-badge ios-badge-green" style={{ fontSize: 11 }}>Rozliczony</span>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Student Details Modal */}
      {selectedStudent && (
        <div className="ios-modal-overlay" onClick={() => setSelectedStudent(null)}>
          <div className="ios-modal-content" onClick={e => e.stopPropagation()}>
            <div className="ios-modal-grabber" />

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
              <div>
                <h2 style={{ fontSize: 20, fontWeight: 800 }}>
                  {selectedStudent.first_name} {selectedStudent.last_name}
                </h2>
                <div style={{ fontSize: 13, color: 'var(--ios-text-secondary)' }}>
                  {selectedStudent.grade_level} • {selectedStudent.subject}
                  {selectedStudent.birth_day && selectedStudent.birth_month && (
                    <span style={{ color: 'var(--ios-purple)', marginLeft: 8 }}>
                      • 🎂 {formatStudentBirthday(selectedStudent.birth_day, selectedStudent.birth_month)}
                    </span>
                  )}
                </div>
              </div>

              <div style={{ display: 'flex', gap: 6 }}>
                <button
                  onClick={() => openEditModal(selectedStudent)}
                  className="ios-btn ios-btn-secondary"
                  style={{ padding: '6px 12px', fontSize: 13, minHeight: 34 }}
                >
                  <IconEdit size={14} /> Edytuj
                </button>
                <button
                  onClick={() => {
                    setPayAmountStr(Money.format(selectedStudent.default_rate, false));
                    setShowPayModal(true);
                  }}
                  className="ios-btn ios-btn-success"
                  style={{ padding: '6px 12px', fontSize: 13, minHeight: 34 }}
                >
                  + Wpłata
                </button>
              </div>
            </div>

            {/* Quick Contact Buttons */}
            {selectedStudent.phone && (
              <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
                <a
                  href={`tel:${selectedStudent.phone}`}
                  className="ios-btn ios-btn-secondary"
                  style={{ textDecoration: 'none', flex: 1, fontSize: 13, minHeight: 34 }}
                >
                  <IconPhone size={14} /> Zadzwoń ({selectedStudent.phone})
                </a>
              </div>
            )}

            {/* Sub-tabs: Lekcje / Płatności / Statystyki */}
            <div style={{ display: 'flex', borderBottom: '1px solid var(--ios-separator)', marginBottom: 12 }}>
              {(['lessons', 'payments', 'stats'] as const).map(tab => (
                <button
                  key={tab}
                  onClick={() => setStudentTab(tab)}
                  style={{
                    flex: 1,
                    padding: '8px 0',
                    border: 'none',
                    background: 'none',
                    fontWeight: studentTab === tab ? 700 : 500,
                    color: studentTab === tab ? 'var(--ios-blue)' : 'var(--ios-text-secondary)',
                    borderBottom: studentTab === tab ? '2px solid var(--ios-blue)' : 'none',
                    cursor: 'pointer',
                    fontSize: 14
                  }}
                >
                  {tab === 'lessons' ? 'Lekcje' : tab === 'payments' ? 'Płatności' : 'Statystyki'}
                </button>
              ))}
            </div>

            {/* Tab content: Lessons */}
            {studentTab === 'lessons' && (
              <div style={{ maxHeight: 220, overflowY: 'auto' }}>
                {lessons
                  .filter(l => l.student_id === selectedStudent.id)
                  .sort((a, b) => b.start_at.localeCompare(a.start_at))
                  .map(l => (
                    <div
                      key={l.id}
                      style={{
                        padding: '8px 0',
                        borderBottom: '1px solid var(--ios-separator)',
                        display: 'flex',
                        justifyContent: 'space-between',
                        fontSize: 13
                      }}
                    >
                      <div>
                        <strong>{l.start_at.slice(0, 10)} {l.start_at.slice(11, 16)}</strong>
                        <div style={{ color: 'var(--ios-text-secondary)' }}>{l.subject}</div>
                      </div>
                      <div style={{ textAlign: 'right' }}>
                        <div>{Money.format(l.price_snapshot)}</div>
                        <span className="ios-badge" style={{ fontSize: 10 }}>{l.status}</span>
                      </div>
                    </div>
                  ))}
              </div>
            )}

            {/* Tab content: Payments */}
            {studentTab === 'payments' && (
              <div style={{ maxHeight: 220, overflowY: 'auto' }}>
                {payments
                  .filter(p => p.student_id === selectedStudent.id)
                  .sort((a, b) => b.received_date.localeCompare(a.received_date))
                  .map(p => (
                    <div
                      key={p.id}
                      style={{
                        padding: '8px 0',
                        borderBottom: '1px solid var(--ios-separator)',
                        display: 'flex',
                        justifyContent: 'space-between',
                        fontSize: 13
                      }}
                    >
                      <div>
                        <strong>{p.received_date}</strong> • {p.method.toUpperCase()}
                        <div style={{ color: 'var(--ios-text-secondary)' }}>{p.description}</div>
                      </div>
                      <div style={{ color: 'var(--ios-green)', fontWeight: 700 }}>
                        +{Money.format(p.amount)}
                      </div>
                    </div>
                  ))}
              </div>
            )}

            {/* Tab content: Stats */}
            {studentTab === 'stats' && (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                {(() => {
                  const sSummary = getStudentFinancialSummary(selectedStudent.id, charges, payments);
                  const sLessons = lessons.filter(l => l.student_id === selectedStudent.id);
                  const completedHours = Math.round(
                    sLessons.filter(l => l.status === 'completed').reduce((sum, l) => sum + l.duration_min, 0) / 60 * 10
                  ) / 10;
                  const cancelledCount = sLessons.filter(l => l.status.startsWith('cancelled') || l.status === 'no_show').length;
                  const cancelRate = sLessons.length > 0 ? Math.round((cancelledCount / sLessons.length) * 100) : 0;

                  return (
                    <>
                      <div className="ios-card" style={{ padding: 10, marginBottom: 0 }}>
                        <div style={{ fontSize: 11, color: 'var(--ios-text-secondary)' }}>Godziny zrealizowane</div>
                        <div style={{ fontSize: 18, fontWeight: 700 }}>{completedHours} h</div>
                      </div>
                      <div className="ios-card" style={{ padding: 10, marginBottom: 0 }}>
                        <div style={{ fontSize: 11, color: 'var(--ios-text-secondary)' }}>Suma należności</div>
                        <div style={{ fontSize: 18, fontWeight: 700 }}>{Money.format(sSummary.totalCharges)}</div>
                      </div>
                      <div className="ios-card" style={{ padding: 10, marginBottom: 0 }}>
                        <div style={{ fontSize: 11, color: 'var(--ios-text-secondary)' }}>Suma wpłacona</div>
                        <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--ios-green)' }}>
                          {Money.format(sSummary.totalPayments)}
                        </div>
                      </div>
                      <div className="ios-card" style={{ padding: 10, marginBottom: 0 }}>
                        <div style={{ fontSize: 11, color: 'var(--ios-text-secondary)' }}>Odwołania</div>
                        <div style={{ fontSize: 18, fontWeight: 700 }}>{cancelRate}%</div>
                      </div>
                    </>
                  );
                })()}
              </div>
            )}

            {/* GDPR Anonymization Action */}
            <div style={{ marginTop: 20, paddingTop: 12, borderTop: '1px solid var(--ios-separator)' }}>
              <button
                onClick={() => {
                  if (confirm('Czy na pewno chcesz zanonimizować dane osobowe ucznia zgodnie z RODO? Sumy finansowe i ewidencja zostaną nienaruszone.')) {
                    anonymizeStudent(selectedStudent.id);
                    setSelectedStudent(null);
                  }
                }}
                className="ios-btn ios-btn-danger"
                style={{ width: '100%', fontSize: 13, minHeight: 36 }}
              >
                Anonimizuj dane ucznia (RODO)
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add Student Modal */}
      {showAddStudentModal && (
        <div className="ios-modal-overlay" onClick={() => setShowAddStudentModal(false)}>
          <div className="ios-modal-content" onClick={e => e.stopPropagation()}>
            <div className="ios-modal-grabber" />
            <h3 style={{ fontSize: 18, fontWeight: 700, marginBottom: 12 }}>Nowy uczeń</h3>
            <form onSubmit={handleAddStudentSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <div>
                  <label style={{ fontSize: 12, fontWeight: 600 }}>Imię</label>
                  <input
                    type="text"
                    required
                    className="ios-input"
                    value={newFirstName}
                    onChange={e => setNewFirstName(e.target.value)}
                  />
                </div>
                <div>
                  <label style={{ fontSize: 12, fontWeight: 600 }}>Nazwisko</label>
                  <input
                    type="text"
                    required
                    className="ios-input"
                    value={newLastName}
                    onChange={e => setNewLastName(e.target.value)}
                  />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <div>
                  <label style={{ fontSize: 12, fontWeight: 600 }}>Klasa / Poziom</label>
                  <input
                    type="text"
                    className="ios-input"
                    value={newGrade}
                    onChange={e => setNewGrade(e.target.value)}
                  />
                </div>
                <div>
                  <label style={{ fontSize: 12, fontWeight: 600 }}>Stawka (zł)</label>
                  <input
                    type="text"
                    className="ios-input"
                    value={newRateStr}
                    onChange={e => setNewRateStr(e.target.value)}
                  />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <div>
                  <label style={{ fontSize: 12, fontWeight: 600 }}>Telefon ucznia</label>
                  <input
                    type="tel"
                    className="ios-input"
                    value={newPhone}
                    onChange={e => setNewPhone(e.target.value)}
                  />
                </div>
                <div>
                  <label style={{ fontSize: 12, fontWeight: 600 }}>E-mail (opcjonalnie)</label>
                  <input
                    type="email"
                    className="ios-input"
                    value={newEmail}
                    onChange={e => setNewEmail(e.target.value)}
                  />
                </div>
              </div>

              <div style={{ borderTop: '1px solid var(--ios-separator)', paddingTop: 8, marginTop: 4 }}>
                <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--ios-text-secondary)' }}>
                  🎂 Urodziny ucznia (opcjonalnie)
                </span>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: 10, marginTop: 6 }}>
                  <div>
                    <label style={{ fontSize: 12, fontWeight: 600 }}>Dzień</label>
                    <input
                      type="number"
                      min="1"
                      max="31"
                      placeholder="np. 15"
                      className="ios-input"
                      value={newBirthDay}
                      onChange={e => setNewBirthDay(e.target.value)}
                    />
                  </div>
                  <div>
                    <label style={{ fontSize: 12, fontWeight: 600 }}>Miesiąc</label>
                    <select
                      className="ios-input"
                      value={newBirthMonth}
                      onChange={e => setNewBirthMonth(e.target.value)}
                    >
                      <option value="">Wybierz miesiąc...</option>
                      {POLISH_MONTHS.map(m => (
                        <option key={m.value} value={m.value}>{m.label}</option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>

              <div style={{ borderTop: '1px solid var(--ios-separator)', paddingTop: 8, marginTop: 4 }}>
                <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--ios-text-secondary)' }}>
                  Opiekun prawny (jeśli uczeń jest niepełnoletni)
                </span>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginTop: 6 }}>
                  <div>
                    <label style={{ fontSize: 12, fontWeight: 600 }}>Imię i nazwisko</label>
                    <input
                      type="text"
                      className="ios-input"
                      placeholder="Mama / Tata"
                      value={newGuardianName}
                      onChange={e => setNewGuardianName(e.target.value)}
                    />
                  </div>
                  <div>
                    <label style={{ fontSize: 12, fontWeight: 600 }}>Telefon</label>
                    <input
                      type="tel"
                      className="ios-input"
                      value={newGuardianPhone}
                      onChange={e => setNewGuardianPhone(e.target.value)}
                    />
                  </div>
                </div>
              </div>

              <button type="submit" className="ios-btn ios-btn-primary" style={{ marginTop: 8 }}>
                Zapisz ucznia
              </button>
            </form>
          </div>
        </div>
      )}

      {/* Edit Student Modal */}
      {showEditStudentModal && selectedStudent && (
        <div className="ios-modal-overlay" onClick={() => setShowEditStudentModal(false)}>
          <div className="ios-modal-content" onClick={e => e.stopPropagation()}>
            <div className="ios-modal-grabber" />
            <h3 style={{ fontSize: 18, fontWeight: 700, marginBottom: 12 }}>Edytuj dane ucznia</h3>
            <form onSubmit={handleEditStudentSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <div>
                  <label style={{ fontSize: 12, fontWeight: 600 }}>Imię</label>
                  <input
                    type="text"
                    required
                    className="ios-input"
                    value={editFirstName}
                    onChange={e => setEditFirstName(e.target.value)}
                  />
                </div>
                <div>
                  <label style={{ fontSize: 12, fontWeight: 600 }}>Nazwisko</label>
                  <input
                    type="text"
                    required
                    className="ios-input"
                    value={editLastName}
                    onChange={e => setEditLastName(e.target.value)}
                  />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <div>
                  <label style={{ fontSize: 12, fontWeight: 600 }}>Klasa / Poziom</label>
                  <input
                    type="text"
                    className="ios-input"
                    value={editGrade}
                    onChange={e => setEditGrade(e.target.value)}
                  />
                </div>
                <div>
                  <label style={{ fontSize: 12, fontWeight: 600 }}>Stawka za lekcję (zł)</label>
                  <input
                    type="text"
                    className="ios-input"
                    value={editRateStr}
                    onChange={e => setEditRateStr(e.target.value)}
                  />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <div>
                  <label style={{ fontSize: 12, fontWeight: 600 }}>Przedmiot</label>
                  <input
                    type="text"
                    className="ios-input"
                    value={editSubject}
                    onChange={e => setEditSubject(e.target.value)}
                  />
                </div>
                <div>
                  <label style={{ fontSize: 12, fontWeight: 600 }}>Status</label>
                  <select
                    className="ios-input"
                    value={editStatus}
                    onChange={e => setEditStatus(e.target.value as StudentStatus)}
                  >
                    <option value="active">Aktywny</option>
                    <option value="paused">Zawieszony</option>
                    <option value="archived">Zarchiwizowany</option>
                  </select>
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <div>
                  <label style={{ fontSize: 12, fontWeight: 600 }}>Telefon ucznia</label>
                  <input
                    type="tel"
                    className="ios-input"
                    value={editPhone}
                    onChange={e => setEditPhone(e.target.value)}
                  />
                </div>
                <div>
                  <label style={{ fontSize: 12, fontWeight: 600 }}>E-mail</label>
                  <input
                    type="email"
                    className="ios-input"
                    value={editEmail}
                    onChange={e => setEditEmail(e.target.value)}
                  />
                </div>
              </div>

              <div style={{ borderTop: '1px solid var(--ios-separator)', paddingTop: 8, marginTop: 4 }}>
                <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--ios-text-secondary)' }}>
                  🎂 Urodziny ucznia (opcjonalnie)
                </span>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: 10, marginTop: 6 }}>
                  <div>
                    <label style={{ fontSize: 12, fontWeight: 600 }}>Dzień</label>
                    <input
                      type="number"
                      min="1"
                      max="31"
                      placeholder="np. 15"
                      className="ios-input"
                      value={editBirthDay}
                      onChange={e => setEditBirthDay(e.target.value)}
                    />
                  </div>
                  <div>
                    <label style={{ fontSize: 12, fontWeight: 600 }}>Miesiąc</label>
                    <select
                      className="ios-input"
                      value={editBirthMonth}
                      onChange={e => setEditBirthMonth(e.target.value)}
                    >
                      <option value="">Wybierz miesiąc...</option>
                      {POLISH_MONTHS.map(m => (
                        <option key={m.value} value={m.value}>{m.label}</option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>

              <div>
                <label style={{ fontSize: 12, fontWeight: 600 }}>Notatki / Uwagi</label>
                <textarea
                  className="ios-input"
                  rows={2}
                  value={editNotes}
                  onChange={e => setEditNotes(e.target.value)}
                  placeholder="np. przygotowanie do matury rozszerzonej..."
                />
              </div>

              <div style={{ display: 'flex', gap: 8, marginTop: 6 }}>
                <button
                  type="button"
                  onClick={() => setShowEditStudentModal(false)}
                  className="ios-btn ios-btn-secondary"
                  style={{ flex: 1 }}
                >
                  Anuluj
                </button>
                <button type="submit" className="ios-btn ios-btn-primary" style={{ flex: 1 }}>
                  Zapisz zmiany
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Register Payment Modal */}
      {showPayModal && selectedStudent && (
        <div className="ios-modal-overlay" onClick={() => setShowPayModal(false)}>
          <div className="ios-modal-content" onClick={e => e.stopPropagation()}>
            <div className="ios-modal-grabber" />
            <h3 style={{ fontSize: 18, fontWeight: 700, marginBottom: 8 }}>Zarejestruj wpłatę</h3>
            <p style={{ fontSize: 13, color: 'var(--ios-text-secondary)', marginBottom: 12 }}>
              Uczeń: <strong>{selectedStudent.first_name} {selectedStudent.last_name}</strong>
            </p>

            <form onSubmit={handlePaymentSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div>
                <label style={{ fontSize: 12, fontWeight: 600 }}>Kwota (zł)</label>
                <input
                  type="text"
                  required
                  className="ios-input"
                  value={payAmountStr}
                  onChange={e => setPayAmountStr(e.target.value)}
                />
              </div>

              <div>
                <label style={{ fontSize: 12, fontWeight: 600 }}>Metoda płatności</label>
                <select
                  className="ios-input"
                  value={payMethod}
                  onChange={e => setPayMethod(e.target.value as PaymentMethod)}
                >
                  <option value="blik">BLIK</option>
                  <option value="przelew">Przelew bankowy</option>
                  <option value="gotowka">Gotówka</option>
                  <option value="inna">Inna</option>
                </select>
              </div>

              <div>
                <label style={{ fontSize: 12, fontWeight: 600 }}>Tytuł / Opis</label>
                <input
                  type="text"
                  className="ios-input"
                  value={payDesc}
                  onChange={e => setPayDesc(e.target.value)}
                />
              </div>

              <div style={{ fontSize: 12, color: 'var(--ios-text-secondary)' }}>
                ℹ️ Wpłata zostanie automatycznie rozksięgowana metodą FIFO (od najstarszej nieopłaconej lekcji).
              </div>

              <button type="submit" className="ios-btn ios-btn-success" style={{ marginTop: 8 }}>
                <IconCheck size={18} /> Zaksięguj wpłatę
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
